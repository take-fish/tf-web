import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { formatApiError } from '@/lib/http'
import { fetchOnline } from '@/modules/chat/chatApi'
import {
  acceptDuel,
  acceptTournament,
  cancelDuel,
  cancelTournament,
  createDuel,
  createTournament,
  declineDuel,
  declineTournament,
  deleteTournament,
  fetchActiveMatches,
  fetchDuel,
  fetchDuels,
  fetchGameNotifications,
  fetchInvitations,
  fetchMatch,
  fetchMatchChat,
  fetchTournament,
  fetchTournaments,
  sendMatchChat,
} from '@/modules/games/gameApi'
import { GameSocketClient } from '@/modules/games/gameSocket'
import { findWatchableMatch, isParticipant, otherPlayerId } from '@/modules/games/lib/gameFormat'
import type {
  BlindLayout,
  GameBlindActionEvent,
  GameChatChannel,
  GameChatMessage,
  GameFormat,
  GameId,
  GameMatch,
  GameMatchResultEvent,
  GameNotification,
  GameOnlineUser,
  GameSocketStatus,
  GameStoneEvent,
  GameTournament,
} from '@/modules/games/types'
import { useAuthStore } from './auth'

const NOTIFICATION_POLL_MS = 30_000
const NOTIFICATION_FRESH_MS = 120_000
const MAX_CHAT_MESSAGES = 240

function byCreatedAt(left: { createdAt: number }, right: { createdAt: number }): number {
  return left.createdAt - right.createdAt
}

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
  const duels = ref<GameTournament[]>([])
  const activeMatches = ref<GameMatch[]>([])
  const currentMatchId = ref<string | null>(null)
  const currentMatch = ref<GameMatch | null>(null)
  const currentTournament = ref<GameTournament | null>(null)
  const matchLoading = ref(false)
  const matchError = ref('')
  const lastResult = ref<GameMatchResultEvent | null>(null)
  const lastBlindAction = ref<GameBlindActionEvent | null>(null)
  const chatMessages = ref<GameChatMessage[]>([])
  const chatLoading = ref(false)
  const chatError = ref('')
  const chatSending = ref(false)
  const notifications = ref<GameNotification[]>([])
  const finalNotification = ref<GameNotification | null>(null)
  const championNotification = ref<GameNotification | null>(null)
  const lobbyOpen = ref(false)
  const lobbyPreferredGameId = ref<GameId | ''>('')
  const lobbyLoading = ref(false)
  const lobbyError = ref('')
  const inviteUnread = ref(0)
  const duelPanelOpen = ref(false)
  const duelInviteUnread = ref(0)
  const duelError = ref('')
  const duelStartedMatchId = ref<string | null>(null)
  const lastError = ref('')
  const notificationCursor = ref(0)

  let socket: GameSocketClient | null = null
  let notificationTimer: ReturnType<typeof setInterval> | undefined
  const seenNotifications = new Set<string>()

  const ownUserId = computed(
    () => selfUserId.value || (auth.user ? `u${auth.user.id}` : ''),
  )
  const ownNickname = computed(
    () => selfNickname.value || auth.user?.nickname || ownUserId.value,
  )
  const connected = computed(() => status.value === 'online')
  const pendingInvitationCount = computed(() => invitations.value.length)
  const pendingDuelInvitations = computed(() =>
    duels.value.filter(
      (duel) =>
        duel.status === 'INVITING' &&
        duel.players.some(
          (player) => player.userId === ownUserId.value && player.status === 'INVITED',
        ),
    ),
  )
  const pendingDuelInvitationCount = computed(() => pendingDuelInvitations.value.length)
  const activeDuels = computed(() =>
    duels.value.filter((duel) => duel.status === 'INVITING' || duel.status === 'RUNNING'),
  )
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
      onDuel: (duel) => upsertDuel(duel),
      onDuelInvitation: (duel) => upsertDuel(duel),
      onDuelStarted: (duel, match) => {
        upsertDuel(duel)
        if (match) duelStartedMatchId.value = match.id
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
        if (message.matchId === currentMatchId.value) mergeChatMessage(message)
      },
      onNotification: (notification) => consumeNotification(notification),
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
    void loadRecentNotifications()
    if (notificationTimer) clearInterval(notificationTimer)
    notificationTimer = setInterval(() => {
      void pollNotifications()
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
    duels.value = frame.duels ?? []
    activeMatches.value = frame.activeMatches ?? []
    if (!lobbyOpen.value) {
      inviteUnread.value = Math.max(inviteUnread.value, invitations.value.length)
    }
    if (!duelPanelOpen.value) {
      duelInviteUnread.value = Math.max(
        duelInviteUnread.value,
        pendingDuelInvitationCount.value,
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
      duels.value = duelResult.value
      if (!duelPanelOpen.value) {
        duelInviteUnread.value = Math.max(
          duelInviteUnread.value,
          pendingDuelInvitationCount.value,
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

  /** 约战只出现在一对一面板，不进入演练大厅。 */
  function upsertDuel(duel: GameTournament) {
    const index = duels.value.findIndex((entry) => entry.id === duel.id)
    const isNew = index < 0
    if (isNew) duels.value.unshift(duel)
    else duels.value[index] = duel

    if (currentTournament.value?.id === duel.id) {
      currentTournament.value = duel
    }

    const invited = isDuelInvitation(duel)
    if (invited && isNew && !duelPanelOpen.value) {
      duelInviteUnread.value += 1
    }
  }

  function isDuelInvitation(duel: GameTournament): boolean {
    return (
      duel.status === 'INVITING' &&
      duel.players.some(
        (player) => player.userId === ownUserId.value && player.status === 'INVITED',
      )
    )
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

  function applyMatch(match: GameMatch) {
    updateActiveMatch(match)
    if (currentMatchId.value === match.id) {
      const previousRoundId = currentMatch.value?.currentRound?.id
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
    const duel = duels.value.find((entry) => entry.id === match.tournamentId)
    if (duel) {
      const index = duel.matches.findIndex((entry) => entry.id === match.id)
      if (index >= 0) duel.matches[index] = match
      else duel.matches.push(match)
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

  function mergeChatMessage(message: GameChatMessage) {
    if (chatMessages.value.some((entry) => entry.id === message.id)) return
    chatMessages.value.push(message)
    chatMessages.value.sort(byCreatedAt)
    if (chatMessages.value.length > MAX_CHAT_MESSAGES) {
      chatMessages.value.splice(0, chatMessages.value.length - MAX_CHAT_MESSAGES)
    }
  }

  async function loadChat() {
    const match = currentMatch.value
    if (!match) return
    // 一对一约战没有聊天，不请求聊天接口。
    if (match.kind === 'DUEL') {
      chatMessages.value = []
      chatError.value = ''
      chatLoading.value = false
      return
    }
    chatLoading.value = true
    chatError.value = ''
    try {
      const publicMessages = await fetchMatchChat(match.id, 'PUBLIC', 80)
      let privateMessages: GameChatMessage[] = []
      if (isParticipant(match, ownUserId.value)) {
        try {
          privateMessages = await fetchMatchChat(match.id, 'PLAYER_DM', 80)
        } catch {
          // 阶梯决赛对手尚未产生时私聊不可用，不影响公开频道。
        }
      }
      const merged = new Map<string, GameChatMessage>()
      for (const message of [...publicMessages, ...privateMessages]) {
        merged.set(message.id, message)
      }
      chatMessages.value = [...merged.values()].sort(byCreatedAt)
    } catch (error) {
      chatError.value = formatApiError(error, '聊天记录加载失败')
    } finally {
      chatLoading.value = false
    }
  }

  async function sendChat(content: string, channel: GameChatChannel): Promise<boolean> {
    const match = currentMatch.value
    const text = content.trim()
    if (!match || !text || chatSending.value) return false
    if (match.kind === 'DUEL') {
      chatError.value = '约战不提供聊天'
      return false
    }
    chatSending.value = true
    chatError.value = ''
    try {
      const toUserId =
        channel === 'PLAYER_DM' ? opponentUserId.value : null
      if (channel === 'PLAYER_DM' && !toUserId) {
        chatError.value = '对手尚未产生，暂时不能私聊'
        return false
      }
      const message = await sendMatchChat(match.id, {
        channel,
        toUserId,
        content: text,
      })
      mergeChatMessage(message)
      return true
    } catch (error) {
      chatError.value = formatApiError(error, '消息发送失败')
      return false
    } finally {
      chatSending.value = false
    }
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
    chatMessages.value = []
    chatError.value = ''
    chatLoading.value = false
    lastResult.value = null
    lastBlindAction.value = null
    socket?.watchMatch(matchId)
    try {
      const match = await fetchMatch(matchId)
      currentMatch.value = match
      updateActiveMatch(match)
      if (match.kind === 'DUEL') {
        const known = duels.value.find((duel) => duel.id === match.tournamentId)
        if (known) {
          currentTournament.value = known
        } else {
          const fetched = await fetchDuel(match.tournamentId)
          currentTournament.value = fetched
          upsertDuel(fetched)
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
        await loadChat()
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
    chatMessages.value = []
    chatError.value = ''
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

  async function create(payload: {
    name: string
    format: GameFormat
    players: GameOnlineUser[]
    gameId?: GameId
    blindLayout?: BlindLayout
  }): Promise<GameTournament> {
    lobbyError.value = ''
    try {
      const tournament = await createTournament(payload)
      upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '演练创建失败')
      throw error
    }
  }

  async function acceptInvitation(id: string) {
    lobbyError.value = ''
    try {
      const tournament = await acceptTournament(id)
      upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '接受邀请失败')
      throw error
    }
  }

  async function declineInvitation(id: string) {
    lobbyError.value = ''
    try {
      const tournament = await declineTournament(id)
      upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '拒绝邀请失败')
      throw error
    }
  }

  async function cancel(id: string) {
    lobbyError.value = ''
    try {
      const tournament = await cancelTournament(id)
      upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '取消演练失败')
      throw error
    }
  }

  async function remove(id: string) {
    lobbyError.value = ''
    try {
      await deleteTournament(id)
      removeTournamentLocally(id)
    } catch (error) {
      lobbyError.value = formatApiError(error, '删除演练失败')
      throw error
    }
  }

  async function createDuelFor(
    opponent: GameOnlineUser,
    format: GameFormat,
    gameId?: GameId,
    blindLayout?: BlindLayout,
  ): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await createDuel({
        opponentUserId: opponent.userId,
        opponentNickname: opponent.nickname,
        format,
        ...(gameId ? { gameId } : {}),
        ...(blindLayout ? { blindLayout } : {}),
      })
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '约战发起失败')
      throw error
    }
  }

  async function acceptDuelInvitation(id: string): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await acceptDuel(id)
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '接受约战失败')
      throw error
    }
  }

  async function declineDuelInvitation(id: string): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await declineDuel(id)
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '拒绝约战失败')
      throw error
    }
  }

  async function cancelDuelById(id: string): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await cancelDuel(id)
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '取消约战失败')
      throw error
    }
  }

  function openDuelPanel() {
    duelPanelOpen.value = true
    duelInviteUnread.value = 0
    duelError.value = ''
    void refreshLobby()
  }

  function closeDuelPanel() {
    duelPanelOpen.value = false
    duelError.value = ''
  }

  function consumeDuelStartedMatch(): string | null {
    const id = duelStartedMatchId.value
    duelStartedMatchId.value = null
    return id
  }

  function consumeNotification(notification: GameNotification) {
    if (!notification || seenNotifications.has(notification.id)) return
    seenNotifications.add(notification.id)
    notificationCursor.value = Math.max(
      notificationCursor.value,
      notification.createdAt,
    )
    if (notification.expiresAt && notification.expiresAt < Date.now()) return
    notifications.value.unshift(notification)
    if (notifications.value.length > 50) notifications.value.length = 50
    const fresh = Date.now() - notification.createdAt <= NOTIFICATION_FRESH_MS
    if (!fresh) return
    if (notification.type === 'FINAL_START') finalNotification.value = notification
    if (notification.type === 'CHAMPION') championNotification.value = notification
  }

  async function loadRecentNotifications() {
    try {
      const entries = await fetchGameNotifications(0, 20)
      for (const notification of [...entries].sort(byCreatedAt)) {
        consumeNotification(notification)
      }
      const newest = entries.reduce(
        (latest, entry) => Math.max(latest, entry.createdAt),
        notificationCursor.value,
      )
      notificationCursor.value = newest
    } catch {
      // 通知为增强能力，失败不影响大厅
    }
  }

  async function pollNotifications() {
    if (!auth.hasToken) return
    try {
      const entries = await fetchGameNotifications(notificationCursor.value, 20)
      for (const notification of [...entries].sort(byCreatedAt)) {
        consumeNotification(notification)
      }
      const newest = entries.reduce(
        (latest, entry) => Math.max(latest, entry.createdAt),
        notificationCursor.value,
      )
      notificationCursor.value = newest
    } catch {
      // 轮询失败等下一轮
    }
  }

  function openLobby(gameId?: GameId) {
    lobbyPreferredGameId.value = gameId ?? ''
    lobbyOpen.value = true
    inviteUnread.value = 0
    void refreshLobby()
  }

  function closeLobby() {
    lobbyOpen.value = false
    lobbyPreferredGameId.value = ''
  }

  function dismissFinal() {
    finalNotification.value = null
  }

  function dismissChampion() {
    championNotification.value = null
  }

  function clearError() {
    lastError.value = ''
  }

  function findTournament(id: string): GameTournament | undefined {
    return tournaments.value.find((tournament) => tournament.id === id)
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
    duels,
    pendingInvitationCount,
    pendingDuelInvitations,
    pendingDuelInvitationCount,
    activeDuels,
    duelPanelOpen,
    duelInviteUnread,
    duelError,
    duelStartedMatchId,
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
    chatMessages,
    chatLoading,
    chatError,
    chatSending,
    notifications,
    finalNotification,
    championNotification,
    lobbyOpen,
    lobbyPreferredGameId,
    lobbyLoading,
    lobbyError,
    inviteUnread,
    lastError,
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
    loadChat,
    sendChat,
    create,
    acceptInvitation,
    declineInvitation,
    cancel,
    remove,
    createDuelFor,
    acceptDuelInvitation,
    declineDuelInvitation,
    cancelDuelById,
    openDuelPanel,
    closeDuelPanel,
    consumeDuelStartedMatch,
    openLobby,
    closeLobby,
    dismissFinal,
    dismissChampion,
    clearError,
    findTournament,
    bestMatchFor,
  }
})
