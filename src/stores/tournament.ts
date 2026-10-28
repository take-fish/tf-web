import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { formatApiError } from '@/lib/http'
import { fetchOnline } from '@/modules/chat/chatApi'
import {
  fetchActiveMatches,
  fetchDuel,
  fetchDuels,
  fetchInvitations,
  fetchMatch,
  fetchTournament,
  fetchTournaments,
} from '@/modules/games/gameApi'
import { GameSocketClient } from '@/modules/games/gameSocket'
import { findWatchableMatch, isParticipant, otherPlayerId } from '@/modules/games/lib/gameFormat'
import type {
  ArenaGameId,
  GameArenaAction,
  GameArenaFinishedEvent,
  GameArenaStateEvent,
  GameBlindActionEvent,
  GameMatch,
  GameMatchResultEvent,
  GameOnlineUser,
  GameSocketStatus,
  GameStoneEvent,
  GameTournament,
  TournamentPoolGameId,
  TournamentType,
} from '@/modules/games/types'
import { useAuthStore } from './auth'
import { createChatModule } from './tournament/chat'
import { createDuelModule } from './tournament/duel'
import { createExerciseModule } from './tournament/exercise'
import { createLobbyModule } from './tournament/lobby'
import { createNotificationModule } from './tournament/notifications'

const NOTIFICATION_POLL_MS = 30_000

export const useTournamentStore = defineStore('tournament', () => {
  const auth = useAuthStore()

  const started = ref(false)
  const status = ref<GameSocketStatus>('offline')
  const selfUserId = ref('')
  const selfNickname = ref('')
  const onlineUserIds = ref<string[]>([])
  /** 比赛通道在线快照，昵称来自用户中台，优先于聊天在线列表。 */
  const gameOnlineMembers = ref<GameOnlineUser[]>([])
  const onlineMembers = ref<GameOnlineUser[]>([])
  const tournaments = ref<GameTournament[]>([])
  const invitations = ref<GameTournament[]>([])
  const activeMatches = ref<GameMatch[]>([])
  const currentMatchId = ref<string | null>(null)
  const currentMatch = ref<GameMatch | null>(null)
  const currentTournament = ref<GameTournament | null>(null)
  const matchLoading = ref(false)
  const matchError = ref('')
  const lastResult = ref<GameMatchResultEvent | null>(null)
  const lastBlindAction = ref<GameBlindActionEvent | null>(null)
  const lobbyOpen = ref(false)
  /** 调度台创建模式：顶部入口默认 S赛，游戏卡片进入则为锦标赛。 */
  const lobbyMode = ref<TournamentType>('SERIES')
  /** 从游戏卡片/剧本卡片进入时预选的锦标赛剧本。 */
  const lobbyPreferredGameId = ref<TournamentPoolGameId | ''>('')
  /** 调度台最近进入的竞技场剧本，用于首页卡片高亮。 */
  const lobbyScript = ref<ArenaGameId>('heatmap-gomoku')
  const lobbyLoading = ref(false)
  const lobbyError = ref('')
  const inviteUnread = ref(0)
  const lastError = ref('')

  let socket: GameSocketClient | null = null
  let notificationTimer: ReturnType<typeof setInterval> | undefined

  const ownUserId = computed(
    () => selfUserId.value || (auth.user ? `u${auth.user.id}` : ''),
  )
  const ownNickname = computed(
    () => selfNickname.value || auth.user?.nickname || ownUserId.value,
  )
  const connected = computed(() => status.value === 'online')
  const pendingInvitationCount = computed(() => invitations.value.length)
  const isCurrentParticipant = computed(() =>
    isParticipant(currentMatch.value, ownUserId.value),
  )
  const currentRound = computed(() => currentMatch.value?.currentRound ?? null)
  const opponentUserId = computed(() => {
    const match = currentMatch.value
    return match ? otherPlayerId(match, ownUserId.value) : null
  })
  const opponentNickname = computed(() => {
    const match = currentMatch.value
    const peer = opponentUserId.value
    if (!match || !peer) return '待定'
    if (match.player1UserId === peer) return match.player1Nickname || peer
    if (match.player2UserId === peer) return match.player2Nickname || peer
    return peer
  })
  const lobbyOnline = computed<GameOnlineUser[]>(() => {
    const merged = new Map<string, GameOnlineUser>()
    for (const member of gameOnlineMembers.value) {
      merged.set(member.userId, member)
    }
    for (const member of onlineMembers.value) {
      if (!merged.has(member.userId)) merged.set(member.userId, member)
    }
    for (const userId of onlineUserIds.value) {
      if (!merged.has(userId)) merged.set(userId, { userId, nickname: userId })
    }
    const own = ownUserId.value
    if (own) {
      merged.set(own, { userId: own, nickname: ownNickname.value })
    }
    return [...merged.values()].sort((left, right) => {
      if (left.userId === own) return -1
      if (right.userId === own) return 1
      return left.nickname.localeCompare(right.nickname, 'zh-CN')
    })
  })

  const duel = createDuelModule({
    ownUserId,
    refreshLobby: () => refreshLobby(),
    syncCurrentTournament: (updated) => {
      if (currentTournament.value?.id === updated.id) currentTournament.value = updated
    },
  })
  const chat = createChatModule({ currentMatch, ownUserId, opponentUserId })
  const notifications = createNotificationModule({ hasToken: () => auth.hasToken })
  const lobby = createLobbyModule({
    lobbyError,
    lobbyOpen,
    lobbyMode,
    lobbyPreferredGameId,
    lobbyScript,
    inviteUnread,
    tournaments,
    upsertTournament,
    removeTournamentLocally,
    refreshLobby,
  })

  const exercise = createExerciseModule({
    hasToken: () => auth.hasToken,
    socket: () => socket,
    ownUserId,
    currentMatch,
    lastError,
    refreshCurrentMatch: () => refreshCurrentMatch(),
  })

  function start() {
    if (started.value) return
    if (!auth.hasToken) return
    started.value = true
    socket = new GameSocketClient({
      onStatus: (next) => {
        status.value = next
      },
      onReady: applyLobbyFrame,
      onTournament: (tournament) => upsertTournament(tournament),
      onInvitation: (tournament) => upsertTournament(tournament),
      onTournamentCancelled: (tournamentId) => {
        const tournament = tournaments.value.find((entry) => entry.id === tournamentId)
        if (tournament) tournament.status = 'CANCELLED'
        invitations.value = invitations.value.filter((entry) => entry.id !== tournamentId)
        activeMatches.value = activeMatches.value.filter(
          (match) => match.tournamentId !== tournamentId,
        )
      },
      onTournamentDeleted: (tournamentId) => removeTournamentLocally(tournamentId),
      onDuel: (entry) => duel.upsertDuel(entry),
      onDuelInvitation: (entry) => duel.upsertDuel(entry),
      onDuelStarted: (entry, match) => {
        duel.upsertDuel(entry)
        duel.markDuelStarted(match?.id ?? null)
      },
      onMatch: applyMatch,
      onMatchReady: (matchId, readyUserIds) => {
        const match = currentMatch.value
        if (match?.id === matchId && match.currentRound) {
          match.currentRound.readyUserIds = [...readyUserIds]
        }
      },
      onStone: applyStone,
      onBlindAction: (event) => {
        lastBlindAction.value = event
      },
      onMatchRest: (event) => {
        const match = currentMatch.value
        if (!match || match.id !== event.matchId) return
        match.player1Score = event.player1Score
        match.player2Score = event.player2Score
        if (match.currentRound) {
          match.currentRound.status = 'REST'
          match.currentRound.restUntil = event.restUntil
          match.currentRound.turnUserId = null
        }
        updateActiveMatch(match)
      },
      onArenaState: (event) => applyArenaState(event),
      onArenaFinished: (event) => {
        applyArenaState(event)
        // 服务端随后走 BO 计分与休息流程，稍后补拉一次比赛详情。
        setTimeout(() => {
          void refreshCurrentMatch()
        }, 400)
      },
      onExerciseState: (event) => exercise.applyExerciseState(event),
      onExerciseFinished: (event) => exercise.applyExerciseFinished(event),
      onExerciseRoom: (event) => exercise.applyExerciseRoom(event.room),
      onExerciseRooms: (event) => {
        exercise.exerciseRooms.value = event.rooms ?? []
      },
      onMatchResult: (event) => {
        lastResult.value = event
        const match = currentMatch.value
        if (match && match.id === event.matchId) {
          match.player1Score = event.player1Score
          match.player2Score = event.player2Score
          match.winnerUserId = event.winnerUserId
          match.status = 'FINISHED'
          updateActiveMatch(match)
          void refreshCurrentMatch()
        }
      },
      onChat: (message) => {
        if (message.matchId === currentMatchId.value) chat.mergeChatMessage(message)
      },
      onNotification: (notification) => notifications.consumeNotification(notification),
      onError: (message) => {
        lastError.value = message
      },
      onAuthError: () => {
        status.value = 'offline'
        lastError.value = '登录状态已失效，调度通道已断开'
      },
    })
    void socket.connect()
    void refreshLobby()
    void notifications.loadRecentNotifications()
    if (notificationTimer) clearInterval(notificationTimer)
    notificationTimer = setInterval(() => {
      void notifications.pollNotifications()
    }, NOTIFICATION_POLL_MS)
  }

  function stop() {
    started.value = false
    if (notificationTimer) {
      clearInterval(notificationTimer)
      notificationTimer = undefined
    }
    socket?.close()
    socket = null
    status.value = 'offline'
  }

  function applyLobbyFrame(frame: {
    user: { userId: string; nickname: string }
    onlineUserIds?: string[]
    onlineMembers?: GameOnlineUser[]
    tournaments?: GameTournament[]
    invitations?: GameTournament[]
    duels?: GameTournament[]
    activeMatches?: GameMatch[]
  }) {
    selfUserId.value = frame.user.userId
    selfNickname.value = frame.user.nickname
    onlineUserIds.value = frame.onlineUserIds ?? []
    gameOnlineMembers.value = frame.onlineMembers ?? []
    tournaments.value = frame.tournaments ?? []
    invitations.value = frame.invitations ?? []
    duel.duels.value = frame.duels ?? []
    activeMatches.value = frame.activeMatches ?? []
    if (!lobbyOpen.value) {
      inviteUnread.value = Math.max(inviteUnread.value, invitations.value.length)
    }
    if (!duel.duelPanelOpen.value) {
      duel.duelInviteUnread.value = Math.max(
        duel.duelInviteUnread.value,
        duel.pendingDuelInvitationCount.value,
      )
    }
    if (currentMatchId.value) socket?.watchMatch(currentMatchId.value)
  }

  async function refreshLobby() {
    if (!auth.hasToken) return
    lobbyLoading.value = true
    lobbyError.value = ''
    const results = await Promise.allSettled([
      fetchTournaments(),
      fetchInvitations(),
      fetchDuels(),
      fetchActiveMatches(),
      fetchOnline(),
    ])
    const [tournamentResult, invitationResult, duelResult, matchResult, onlineResult] =
      results
    if (tournamentResult?.status === 'fulfilled') {
      tournaments.value = tournamentResult.value
      if (currentTournament.value) {
        const fresh = tournamentResult.value.find(
          (entry) => entry.id === currentTournament.value?.id,
        )
        if (fresh) currentTournament.value = fresh
      }
    }
    if (invitationResult?.status === 'fulfilled') {
      invitations.value = invitationResult.value
      if (!lobbyOpen.value) {
        inviteUnread.value = Math.max(inviteUnread.value, invitations.value.length)
      }
    }
    if (duelResult?.status === 'fulfilled') {
      duel.duels.value = duelResult.value
      if (!duel.duelPanelOpen.value) {
        duel.duelInviteUnread.value = Math.max(
          duel.duelInviteUnread.value,
          duel.pendingDuelInvitationCount.value,
        )
      }
    }
    if (matchResult?.status === 'fulfilled') {
      activeMatches.value = matchResult.value
    }
    if (onlineResult?.status === 'fulfilled') {
      onlineMembers.value = onlineResult.value.map((member) => ({
        userId: member.userId,
        nickname: member.nickname,
      }))
    }
    if (results.every((result) => result.status === 'rejected')) {
      lobbyError.value = '演练列表暂时不可用，请稍后重试'
    }
    socket?.refreshLobby()
    lobbyLoading.value = false
  }

  function upsertTournament(tournament: GameTournament) {
    const index = tournaments.value.findIndex((entry) => entry.id === tournament.id)
    if (index >= 0) tournaments.value[index] = tournament
    else tournaments.value.unshift(tournament)

    if (currentTournament.value?.id === tournament.id) {
      currentTournament.value = tournament
    }

    const selfPlayer = tournament.players.find(
      (player) => player.userId === ownUserId.value,
    )
    const invited =
      tournament.status === 'INVITING' && selfPlayer?.status === 'INVITED'
    const invitationIndex = invitations.value.findIndex(
      (entry) => entry.id === tournament.id,
    )
    if (invited) {
      if (invitationIndex >= 0) invitations.value[invitationIndex] = tournament
      else {
        invitations.value.unshift(tournament)
        if (!lobbyOpen.value) inviteUnread.value += 1
      }
    } else if (invitationIndex >= 0) {
      invitations.value.splice(invitationIndex, 1)
    }
  }

  /** 删除或收到删除广播后，从大厅、邀请与观看态中移除。 */
  function removeTournamentLocally(tournamentId: string) {
    tournaments.value = tournaments.value.filter((entry) => entry.id !== tournamentId)
    invitations.value = invitations.value.filter((entry) => entry.id !== tournamentId)
    activeMatches.value = activeMatches.value.filter(
      (match) => match.tournamentId !== tournamentId,
    )
    if (currentTournament.value?.id === tournamentId) {
      currentTournament.value = null
    }
    if (currentMatch.value?.tournamentId === tournamentId) {
      leaveWatch()
    }
  }

  function updateActiveMatch(match: GameMatch) {
    const index = activeMatches.value.findIndex((entry) => entry.id === match.id)
    if (match.status === 'READY' || match.status === 'RUNNING') {
      if (index >= 0) activeMatches.value[index] = match
      else activeMatches.value.unshift(match)
    } else if (index >= 0) {
      activeMatches.value.splice(index, 1)
    }
  }

  /** 竞技场帧只更新当前小局的权威状态，避免整场比赛频繁重建。 */
  function applyArenaState(event: GameArenaStateEvent | GameArenaFinishedEvent) {
    const match = currentMatch.value
    if (!match || match.id !== event.matchId) return
    const round = match.currentRound
    if (!round || round.id !== event.roundId) return
    if (event.seq < round.seq) return
    round.gameId = event.gameId
    round.seq = event.seq
    round.state = event.state
    round.endsAt = event.state.endsAt
    round.lastMoveAt = event.serverTime
    if (event.state.finished) {
      round.winnerUserId = event.state.winnerUserId ?? null
    }
  }

  function applyMatch(match: GameMatch) {
    updateActiveMatch(match)
    if (currentMatchId.value === match.id) {
      // 详情接口可能比最后一帧广播更早落库，保留本地更新的快照避免画面回退。
      const previous = currentMatch.value?.currentRound
      const previousRoundId = previous?.id
      const next = match.currentRound
      if (
        previous &&
        next &&
        previous.id === next.id &&
        next.seq < previous.seq
      ) {
        next.state = previous.state
        next.seq = previous.seq
        next.endsAt = previous.endsAt ?? next.endsAt
      }
      currentMatch.value = match
      if (previousRoundId !== match.currentRound?.id) lastBlindAction.value = null
      matchError.value = ''
    }
    const tournament = tournaments.value.find(
      (entry) => entry.id === match.tournamentId,
    )
    if (tournament) {
      const index = tournament.matches.findIndex((entry) => entry.id === match.id)
      if (index >= 0) tournament.matches[index] = match
      else tournament.matches.push(match)
    }
    const knownDuel = duel.duels.value.find(
      (entry) => entry.id === match.tournamentId,
    )
    if (knownDuel) {
      const index = knownDuel.matches.findIndex((entry) => entry.id === match.id)
      if (index >= 0) knownDuel.matches[index] = match
      else knownDuel.matches.push(match)
    }
    const activeTournament = currentTournament.value
    if (activeTournament?.id === match.tournamentId) {
      const index = activeTournament.matches.findIndex((entry) => entry.id === match.id)
      if (index >= 0) activeTournament.matches[index] = match
      else activeTournament.matches.push(match)
    }
  }

  function applyStone(event: GameStoneEvent) {
    const match = currentMatch.value
    if (!match || match.id !== event.matchId) return
    const round = match.currentRound
    if (!round || round.id !== event.roundId) return
    if (!round.moves.some((move) => move.moveNo === event.moveNo)) {
      round.moves.push({
        moveNo: event.moveNo,
        userId: event.userId,
        x: event.x,
        y: event.y,
      })
    }
    round.moveCount = event.moveCount
    round.turnUserId = event.turnUserId
    round.lastMoveAt = Date.now()
  }

  async function watch(matchId: string) {
    if (currentMatchId.value === matchId && currentMatch.value) {
      socket?.watchMatch(matchId)
      return
    }
    currentMatchId.value = matchId
    currentMatch.value = null
    currentTournament.value = null
    matchError.value = ''
    // 丢弃上一场对局残留的 WS 错误，避免它显示在新对局底部。
    lastError.value = ''
    matchLoading.value = true
    chat.resetChat()
    lastResult.value = null
    lastBlindAction.value = null
    socket?.watchMatch(matchId)
    try {
      const match = await fetchMatch(matchId)
      currentMatch.value = match
      updateActiveMatch(match)
      if (match.kind === 'DUEL') {
        const known = duel.duels.value.find((entry) => entry.id === match.tournamentId)
        if (known) {
          currentTournament.value = known
        } else {
          const fetched = await fetchDuel(match.tournamentId)
          currentTournament.value = fetched
          duel.upsertDuel(fetched)
        }
      } else {
        const known = tournaments.value.find(
          (tournament) => tournament.id === match.tournamentId,
        )
        if (known) {
          currentTournament.value = known
        } else {
          const fetched = await fetchTournament(match.tournamentId)
          currentTournament.value = fetched
          upsertTournament(fetched)
        }
        await chat.loadChat()
      }
    } catch (error) {
      matchError.value = formatApiError(error, '执行记录加载失败')
    } finally {
      matchLoading.value = false
    }
  }

  async function refreshCurrentMatch() {
    const id = currentMatchId.value
    if (!id) return
    try {
      const match = await fetchMatch(id)
      if (currentMatchId.value !== id) return
      currentMatch.value = match
      updateActiveMatch(match)
    } catch {
      // 下一帧 match_update 仍可补齐
    }
  }

  function leaveWatch() {
    socket?.leaveMatch()
    currentMatchId.value = null
    currentMatch.value = null
    currentTournament.value = null
    matchError.value = ''
    matchLoading.value = false
    chat.resetChat()
    lastResult.value = null
    lastBlindAction.value = null
  }

  function ready() {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.ready(id)) {
      lastError.value = '调度通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function placeStone(x: number, y: number) {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.placeStone(id, x, y)) {
      lastError.value = '落子通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function revealPiece(x: number, y: number) {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.revealPiece(id, x, y)) {
      lastError.value = '翻棋通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function movePiece(fromX: number, fromY: number, toX: number, toY: number) {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.movePiece(id, fromX, fromY, toX, toY)) {
      lastError.value = '走子通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function resign() {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.resign(id)) {
      lastError.value = '调度通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function sendArenaAction(action: GameArenaAction): boolean {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.sendArenaAction(id, action)) {
      lastError.value = '调度通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  /** 页面淘汰首局选图：只有高顺位选手在开赛前可用，权限由服务端复核。 */
  function chooseGame(gameId: string): boolean {
    const id = currentMatchId.value
    if (!id) return false
    if (!socket?.chooseGame(id, gameId)) {
      lastError.value = '调度通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function clearError() {
    lastError.value = ''
  }

  function bestMatchFor(tournament: GameTournament): GameMatch | undefined {
    return findWatchableMatch(tournament, ownUserId.value)
  }

  return {
    started,
    status,
    connected,
    selfUserId,
    selfNickname,
    ownUserId,
    ownNickname,
    onlineUserIds,
    onlineMembers,
    lobbyOnline,
    tournaments,
    invitations,
    duels: duel.duels,
    pendingInvitationCount,
    pendingDuelInvitations: duel.pendingDuelInvitations,
    pendingDuelInvitationCount: duel.pendingDuelInvitationCount,
    activeDuels: duel.activeDuels,
    duelPanelOpen: duel.duelPanelOpen,
    duelInviteUnread: duel.duelInviteUnread,
    duelError: duel.duelError,
    duelStartedMatchId: duel.duelStartedMatchId,
    activeMatches,
    currentMatchId,
    currentMatch,
    currentTournament,
    currentRound,
    isCurrentParticipant,
    opponentUserId,
    opponentNickname,
    matchLoading,
    matchError,
    lastResult,
    lastBlindAction,
    chatMessages: chat.chatMessages,
    chatLoading: chat.chatLoading,
    chatError: chat.chatError,
    chatSending: chat.chatSending,
    notifications: notifications.notifications,
    finalNotification: notifications.finalNotification,
    championNotification: notifications.championNotification,
    lobbyOpen,
    lobbyMode,
    lobbyPreferredGameId,
    lobbyScript,
    lobbyLoading,
    lobbyError,
    inviteUnread,
    lastError,
    exerciseOpen: exercise.exerciseOpen,
    exerciseRooms: exercise.exerciseRooms,
    exerciseRoom: exercise.exerciseRoom,
    exerciseRoomId: exercise.exerciseRoomId,
    exerciseState: exercise.exerciseState,
    exerciseFinished: exercise.exerciseFinished,
    exerciseResults: exercise.exerciseResults,
    exerciseLoading: exercise.exerciseLoading,
    exerciseBusy: exercise.exerciseBusy,
    exerciseError: exercise.exerciseError,
    exerciseSelfActor: exercise.exerciseSelfActor,
    exerciseInRoom: exercise.exerciseInRoom,
    exerciseRunning: exercise.exerciseRunning,
    start,
    stop,
    refreshLobby,
    watch,
    refreshCurrentMatch,
    leaveWatch,
    ready,
    placeStone,
    revealPiece,
    movePiece,
    resign,
    sendArenaAction,
    chooseGame,
    refreshExerciseRooms: exercise.refreshExerciseRooms,
    refreshExerciseResults: exercise.refreshExerciseResults,
    createExercise: exercise.createExercise,
    joinExercise: exercise.joinExercise,
    readyExercise: exercise.readyExercise,
    leaveExercise: exercise.leaveExercise,
    sendExerciseInput: exercise.sendExerciseInput,
    openExerciseLobby: exercise.openExerciseLobby,
    closeExerciseLobby: exercise.closeExerciseLobby,
    loadChat: chat.loadChat,
    sendChat: chat.sendChat,
    create: lobby.create,
    acceptInvitation: lobby.acceptInvitation,
    declineInvitation: lobby.declineInvitation,
    cancel: lobby.cancel,
    remove: lobby.remove,
    createDuelFor: duel.createDuelFor,
    acceptDuelInvitation: duel.acceptDuelInvitation,
    declineDuelInvitation: duel.declineDuelInvitation,
    cancelDuelById: duel.cancelDuelById,
    openDuelPanel: duel.openDuelPanel,
    closeDuelPanel: duel.closeDuelPanel,
    consumeDuelStartedMatch: duel.consumeDuelStartedMatch,
    openLobby: lobby.openLobby,
    closeLobby: lobby.closeLobby,
    dismissFinal: notifications.dismissFinal,
    dismissChampion: notifications.dismissChampion,
    clearError,
    findTournament: lobby.findTournament,
    bestMatchFor,
  }
})
