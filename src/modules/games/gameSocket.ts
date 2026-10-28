import { ApiError } from '@/lib/http'
import { fetchGameWsTicket } from './gameApi'
import type {
  ExerciseInput,
  ExerciseState,
  GameArenaAction,
  GameArenaFinishedEvent,
  GameArenaStateEvent,
  GameBlindActionEvent,
  GameChatChannel,
  GameChatMessage,
  GameExerciseFinishedEvent,
  GameExerciseRoomsEvent,
  GameExerciseRoomEvent,
  GameExerciseStateEvent,
  GameMatch,
  GameMatchRestEvent,
  GameMatchResultEvent,
  GameNotification,
  GameReadyFrame,
  GameServerFrame,
  GameSocketStatus,
  GameStoneEvent,
  GameTournament,
} from '@/types/games'

export interface GameSocketHandlers {
  onStatus?: (status: GameSocketStatus) => void
  onReady?: (frame: GameReadyFrame) => void
  onTournament?: (tournament: GameTournament) => void
  onInvitation?: (tournament: GameTournament) => void
  onTournamentCancelled?: (tournamentId: string) => void
  onTournamentDeleted?: (tournamentId: string) => void
  onDuel?: (duel: GameTournament) => void
  onDuelInvitation?: (duel: GameTournament) => void
  onDuelStarted?: (duel: GameTournament, match?: GameMatch) => void
  onMatch?: (match: GameMatch) => void
  onMatchReady?: (matchId: string, readyUserIds: string[]) => void
  onStone?: (event: GameStoneEvent) => void
  onBlindAction?: (event: GameBlindActionEvent) => void
  onMatchRest?: (event: GameMatchRestEvent) => void
  onMatchResult?: (event: GameMatchResultEvent) => void
  onArenaState?: (event: GameArenaStateEvent) => void
  onArenaFinished?: (event: GameArenaFinishedEvent) => void
  onExerciseState?: (event: GameExerciseStateEvent) => void
  onExerciseFinished?: (event: GameExerciseFinishedEvent) => void
  onExerciseRoom?: (event: GameExerciseRoomEvent) => void
  onExerciseRooms?: (event: GameExerciseRoomsEvent) => void
  onChat?: (message: GameChatMessage) => void
  onNotification?: (notification: GameNotification) => void
  onError?: (message: string, code?: string) => void
  onAuthError?: () => void
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]

function socketUrl(ticket: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/game?ticket=${encodeURIComponent(ticket)}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '调度通道建立失败'
}

export class GameSocketClient {
  private ws: WebSocket | null = null
  private watchingMatchId: string | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastPong = 0
  private manuallyClosed = false
  private authFailed = false
  private connectAttempt = 0
  private actionSeq = 0
  private exerciseRoomId: string | null = null
  private exerciseSeq = 0

  constructor(private readonly handlers: GameSocketHandlers) {}

  connect(): Promise<void> {
    this.manuallyClosed = false
    this.authFailed = false
    return this.open()
  }

  close() {
    this.manuallyClosed = true
    this.connectAttempt += 1
    this.stopHeartbeat()
    this.clearReconnect()
    this.handlers.onStatus?.('offline')
    this.ws?.close(1000, 'client close')
    this.ws = null
  }

  refreshLobby(): boolean {
    return this.send({ type: 'refresh_lobby' })
  }

  watchMatch(matchId: string): boolean {
    this.watchingMatchId = matchId
    return this.send({ type: 'watch_match', matchId })
  }

  leaveMatch(): boolean {
    this.watchingMatchId = null
    return this.send({ type: 'leave_match' })
  }

  ready(matchId: string): boolean {
    return this.send({ type: 'match_ready', matchId })
  }

  placeStone(matchId: string, x: number, y: number): boolean {
    return this.send({ type: 'place_stone', matchId, x, y })
  }

  revealPiece(matchId: string, x: number, y: number): boolean {
    return this.send({ type: 'reveal_piece', matchId, x, y })
  }

  movePiece(
    matchId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): boolean {
    return this.send({ type: 'move_piece', matchId, fromX, fromY, toX, toY })
  }

  resign(matchId: string): boolean {
    return this.send({ type: 'resign', matchId })
  }

  /** 页面淘汰高顺位选手指定首局剧本，服务端会校验选图权。 */
  chooseGame(matchId: string, gameId: string): boolean {
    return this.send({ type: 'choose_game', matchId, gameId })
  }

  /** 竞技场动作：动作 ID 用于服务端幂等，重复提交不会重复扣资源。 */
  sendArenaAction(matchId: string, action: GameArenaAction): boolean {
    const actionId = `${Date.now().toString(36)}-${(this.actionSeq += 1).toString(36)}`
    return this.send({
      type: 'arena_action',
      matchId,
      action: action.action,
      target: action.target,
      skill: action.skill,
      cell: action.cell,
      actionId,
    })
  }

  /** 休闲巡检房间：加入后记录房间 ID，断线重连会自动重新加入。 */
  joinExercise(roomId: string): boolean {
    this.exerciseRoomId = roomId
    return this.send({ type: 'exercise_join', roomId })
  }

  leaveExercise(roomId?: string): boolean {
    const key = roomId ?? this.exerciseRoomId
    if (!roomId || roomId === this.exerciseRoomId) this.exerciseRoomId = null
    if (!key) return false
    return this.send({ type: 'exercise_leave', roomId: key })
  }

  readyExercise(roomId: string): boolean {
    return this.send({ type: 'exercise_ready', roomId })
  }

  refreshExerciseRooms(): boolean {
    return this.send({ type: 'exercise_rooms' })
  }

  /** 输入只上报意图；同一房间的 inputSeq 单调递增，便于服务端排查丢帧。 */
  sendExerciseInput(roomId: string, input: ExerciseInput): boolean {
    const inputSeq = (this.exerciseSeq += 1)
    return this.send({
      type: 'exercise_input',
      roomId,
      inputSeq,
      moveX: input.moveX,
      moveY: input.moveY,
      aim: input.aim,
      fire: input.fire,
      skill: input.skill ?? null,
      skillX: input.skillX ?? null,
      skillY: input.skillY ?? null,
    })
  }

  sendChat(payload: {
    tournamentId: string
    matchId: string
    channel: GameChatChannel
    toUserId?: string | null
    content: string
  }): boolean {
    return this.send({ type: 'chat', ...payload })
  }

  private async open(): Promise<void> {
    this.clearReconnect()
    this.handlers.onStatus?.(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    const attempt = ++this.connectAttempt

    let ticket: string
    try {
      ticket = (await fetchGameWsTicket()).ticket
    } catch (error) {
      if (this.manuallyClosed || attempt !== this.connectAttempt) return
      if (error instanceof ApiError && error.status === 401) {
        this.authFailed = true
        this.handlers.onStatus?.('offline')
        this.handlers.onAuthError?.()
        return
      }
      this.handlers.onError?.(errorText(error), 'GAME_HANDSHAKE_FAILED')
      this.scheduleReconnect()
      return
    }
    if (this.manuallyClosed || attempt !== this.connectAttempt) return

    let ws: WebSocket
    try {
      ws = new WebSocket(socketUrl(ticket))
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
      this.lastPong = Date.now()
      this.handlers.onStatus?.('online')
      this.startHeartbeat()
      if (this.watchingMatchId) {
        this.send({ type: 'watch_match', matchId: this.watchingMatchId })
      }
      if (this.exerciseRoomId) {
        this.send({ type: 'exercise_join', roomId: this.exerciseRoomId })
      }
    }

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      try {
        this.dispatch(JSON.parse(event.data) as GameServerFrame)
      } catch {
        // 忽略非协议帧
      }
    }

    ws.onclose = () => {
      this.stopHeartbeat()
      if (this.ws === ws) this.ws = null
      if (this.manuallyClosed || this.authFailed) return
      this.handlers.onStatus?.('reconnecting')
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      // 关闭事件会统一触发重连
    }
  }

  private dispatch(frame: GameServerFrame) {
    switch (frame.type) {
      case 'game_ready':
        if (frame.user) this.handlers.onReady?.(frame as GameReadyFrame)
        break
      case 'tournament_update':
        if (frame.tournament) this.handlers.onTournament?.(frame.tournament)
        break
      case 'game_invitation':
        if (frame.tournament) this.handlers.onInvitation?.(frame.tournament)
        break
      case 'tournament_cancelled':
        if (frame.tournamentId) this.handlers.onTournamentCancelled?.(frame.tournamentId)
        break
      case 'tournament_deleted':
        if (frame.tournamentId) this.handlers.onTournamentDeleted?.(frame.tournamentId)
        break
      case 'duel_update':
        if (frame.duel) this.handlers.onDuel?.(frame.duel)
        break
      case 'duel_invitation':
        if (frame.duel) this.handlers.onDuelInvitation?.(frame.duel)
        break
      case 'duel_started':
        if (frame.duel) this.handlers.onDuelStarted?.(frame.duel, frame.match)
        break
      case 'match_update':
        if (frame.match) this.handlers.onMatch?.(frame.match)
        break
      case 'match_ready':
        if (frame.matchId) {
          this.handlers.onMatchReady?.(frame.matchId, frame.readyUserIds ?? [])
        }
        break
      case 'stone':
        if (
          frame.matchId &&
          frame.roundId &&
          frame.moveNo != null &&
          frame.userId &&
          frame.x != null &&
          frame.y != null &&
          frame.turnUserId
        ) {
          this.handlers.onStone?.({
            type: 'stone',
            matchId: frame.matchId,
            roundId: frame.roundId,
            moveNo: frame.moveNo,
            userId: frame.userId,
            x: frame.x,
            y: frame.y,
            turnUserId: frame.turnUserId,
            moveCount: frame.moveCount ?? frame.moveNo,
            winning: Boolean(frame.winning),
          })
        }
        break
      case 'blind_action':
        if (
          frame.matchId &&
          frame.roundId &&
          frame.moveNo != null &&
          frame.userId &&
          frame.action &&
          frame.pieceType &&
          frame.pieceColor &&
          frame.turnUserId &&
          frame.toX != null &&
          frame.toY != null
        ) {
          this.handlers.onBlindAction?.({
            type: 'blind_action',
            matchId: frame.matchId,
            roundId: frame.roundId,
            moveNo: frame.moveNo,
            userId: frame.userId,
            action: frame.action,
            fromX: frame.fromX ?? null,
            fromY: frame.fromY ?? null,
            toX: frame.toX,
            toY: frame.toY,
            pieceType: frame.pieceType,
            pieceColor: frame.pieceColor,
            capturedPieceType: frame.capturedPieceType ?? null,
            capturedPieceColor: frame.capturedPieceColor ?? null,
            turnUserId: frame.turnUserId,
            moveCount: frame.moveCount ?? frame.moveNo,
            result: frame.result ?? null,
          })
        }
        break
      case 'match_rest':
        if (frame.matchId && frame.restUntil != null) {
          this.handlers.onMatchRest?.({
            type: 'match_rest',
            matchId: frame.matchId,
            restUntil: frame.restUntil,
            player1Score: frame.player1Score ?? 0,
            player2Score: frame.player2Score ?? 0,
          })
        }
        break
      case 'match_result':
        if (frame.matchId && frame.winnerUserId) {
          this.handlers.onMatchResult?.({
            type: 'match_result',
            matchId: frame.matchId,
            winnerUserId: frame.winnerUserId,
            reason: frame.reason ?? '',
            player1Score: frame.player1Score ?? 0,
            player2Score: frame.player2Score ?? 0,
          })
        }
        break
      case 'arena_state':
      case 'arena_finished':
        if (frame.matchId && frame.roundId && frame.state) {
          const event = {
            type: frame.type === 'arena_finished' ? 'arena_finished' : 'arena_state',
            matchId: frame.matchId,
            roundId: frame.roundId,
            gameId: frame.gameId ?? frame.state.gameId,
            seq: frame.seq ?? frame.state.seq,
            serverTime: frame.serverTime ?? frame.state.serverTime,
            state: frame.state,
          } as GameArenaStateEvent | GameArenaFinishedEvent
          if (event.type === 'arena_finished') {
            this.handlers.onArenaFinished?.(event)
          } else {
            this.handlers.onArenaState?.(event)
          }
        }
        break
      case 'exercise_state':
        if (frame.roomId && frame.state && frame.state.gameId === 'cluster-patrol-arena') {
          this.handlers.onExerciseState?.({
            type: 'exercise_state',
            roomId: frame.roomId,
            roomCode: frame.roomCode ?? '',
            mode: frame.mode ?? (frame.state as ExerciseState).mode,
            matchId: frame.matchId ?? null,
            seq: frame.seq ?? frame.state.seq,
            serverTime: frame.serverTime ?? frame.state.serverTime,
            you: frame.you ?? null,
            state: frame.state as ExerciseState,
          })
        }
        break
      case 'exercise_finished':
        if (frame.roomId) {
          this.handlers.onExerciseFinished?.({
            type: 'exercise_finished',
            roomId: frame.roomId,
            roomCode: frame.roomCode ?? '',
            mode: frame.mode ?? 'FFA',
            matchId: frame.matchId ?? null,
            winnerUserId: frame.winnerUserId ?? null,
            winnerTeam: frame.winnerTeam ?? null,
            reason: frame.reason ?? '巡检结束',
            standings: frame.standings ?? [],
            state: frame.state as ExerciseState | undefined,
          })
        }
        break
      case 'exercise_room':
        if (frame.room) this.handlers.onExerciseRoom?.(frame as GameExerciseRoomEvent)
        break
      case 'exercise_rooms':
        this.handlers.onExerciseRooms?.(frame as GameExerciseRoomsEvent)
        break
      case 'game_chat':
        if (frame.message && typeof frame.message !== 'string') {
          this.handlers.onChat?.(frame.message)
        }
        break
      case 'notification':
        if (frame.notification) this.handlers.onNotification?.(frame.notification)
        break
      case 'pong':
        this.lastPong = Date.now()
        break
      case 'error':
        this.handlers.onError?.(
          typeof frame.message === 'string' && frame.message ? frame.message : '调度通道异常',
          frame.code,
        )
        break
      default:
        break
    }
  }

  private send(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(payload))
    return true
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPong > 55_000) {
        this.ws?.close(4000, 'heartbeat timeout')
        return
      }
      this.send({ type: 'ping', ts: Date.now() })
    }, 25_000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempts += 1
    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      void this.open()
    }, delay ?? 15000)
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }
}
