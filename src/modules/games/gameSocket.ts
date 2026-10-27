import { ApiError } from '@/lib/http'
import { fetchGameWsTicket } from './gameApi'
import type {
  GameBlindActionEvent,
  GameChatChannel,
  GameChatMessage,
  GameMatch,
  GameMatchRestEvent,
  GameMatchResultEvent,
  GameNotification,
  GameReadyFrame,
  GameServerFrame,
  GameSocketStatus,
  GameStoneEvent,
  GameTournament,
} from './types'

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
