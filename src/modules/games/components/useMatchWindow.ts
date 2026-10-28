import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useTournamentStore } from '@/stores/tournament'
import { ARENA_SCRIPTS, isArenaScript, scriptLabel, scriptShortLabel } from '../lib/arenaScripts'
import { colorOfPlayer, lostPiecesByColor, pieceLabel } from '../lib/blindXiangqi'
import {
  formatClock,
  formatDuration,
  formatLabel,
  isParticipant,
  playerName,
} from '../lib/gameFormat'
import type {
  ExerciseInput,
  ExerciseState,
  GameArenaAction,
  GameChatChannel,
  GameRound,
  HeatmapState,
  TopologyState,
} from '@/types/games'

export function useMatchWindow() {
  const store = useTournamentStore()

  const MOVE_TIMEOUT_SECONDS = 60

  const now = ref(Date.now())
  const channel = ref<GameChatChannel>('PUBLIC')
  const chatInput = ref('')
  const chatBody = ref<HTMLElement | null>(null)
  const actionError = ref('')
  const resigning = ref(false)
  const boardExpanded = ref(false)
  const drawChoice = ref('')

  /** 选图权目录：随机抽签 + 四个竞技场剧本。 */
  const DRAW_OPTIONS = [
    { id: 'random', shortName: '随机抽签' },
    ...ARENA_SCRIPTS.map((script) => ({ id: script.id, shortName: script.shortName })),
  ]

  let clockTimer: ReturnType<typeof setInterval> | undefined

  const match = computed(() => store.currentMatch)
  /** 一对一约战：只用棋盘与比分，不提供聊天与观战。 */
  const isDuel = computed(() => match.value?.kind === 'DUEL')
  const matchLoading = computed(() => store.matchLoading)
  const matchError = computed(() => store.matchError)
  const chatLoading = computed(() => store.chatLoading)
  const chatError = computed(() => store.chatError)
  const tournament = computed(() => store.currentTournament)
  const round = computed<GameRound | null>(() => store.currentRound)
  const selfId = computed(() => store.ownUserId)
  const participant = computed(() => isParticipant(match.value, selfId.value))
  const isBlind = computed(
    () =>
      match.value?.gameId === 'blind-xiangqi' ||
      Boolean(round.value?.firstUserId && round.value?.blindBoard?.length),
  )
  const firstSideUserId = computed(() => {
    if (!round.value) return ''
    return isBlind.value
      ? round.value.firstUserId ?? round.value.blackUserId ?? ''
      : round.value.blackUserId
  })
  const secondSideUserId = computed(() => {
    if (!round.value) return ''
    return isBlind.value
      ? round.value.secondUserId ?? round.value.whiteUserId ?? ''
      : round.value.whiteUserId
  })
  const firstSideName = computed(() =>
    firstSideUserId.value ? nicknameFor(firstSideUserId.value) : '待定',
  )
  const secondSideName = computed(() =>
    secondSideUserId.value ? nicknameFor(secondSideUserId.value) : '待定',
  )
  /** 当前小局双方已损失棋子；被吃棋身份在吃子时已公开。 */
  const lostByColor = computed(() => lostPiecesByColor(round.value?.moves ?? []))
  const player1BlindColor = computed(() =>
    isBlind.value
      ? colorOfPlayer(
          match.value?.player1UserId ?? '',
          firstSideUserId.value,
          secondSideUserId.value,
        )
      : null,
  )
  const player2BlindColor = computed(() =>
    isBlind.value
      ? colorOfPlayer(
          match.value?.player2UserId ?? '',
          firstSideUserId.value,
          secondSideUserId.value,
        )
      : null,
  )
  const gameId = computed(
    () => round.value?.gameId || match.value?.gameId || 'heatmap-gomoku',
  )
  /** 两个实时竞技场共用一套窗口，但棋盘、HUD 与操作面板完全不同。 */
  const arenaMode = computed(() => isArenaScript(gameId.value))
  const arenaState = computed(() => (arenaMode.value ? (round.value?.state ?? null) : null))
  const heatmapState = computed<HeatmapState | null>(() =>
    gameId.value === 'log-hotspot-arena'
      ? ((arenaState.value as HeatmapState | null) ?? null)
      : null,
  )
  const topologyState = computed<TopologyState | null>(() =>
    gameId.value === 'topology-arena'
      ? ((arenaState.value as TopologyState | null) ?? null)
      : null,
  )
  const exerciseState = computed<ExerciseState | null>(() =>
    gameId.value === 'cluster-patrol-arena'
      ? ((arenaState.value as ExerciseState | null) ?? null)
      : null,
  )
  const exerciseSelf = computed(
    () =>
      exerciseState.value?.actors.find((actor) => actor.userId === selfId.value) ?? null,
  )
  const playerNames = computed<Record<string, string>>(() => {
    const names: Record<string, string> = {}
    const value = match.value
    if (!value) return names
    if (value.player1UserId) {
      names[value.player1UserId] = value.player1Nickname || value.player1UserId
    }
    if (value.player2UserId) {
      names[value.player2UserId] = value.player2Nickname || value.player2UserId
    }
    return names
  })
  const isBlack = computed(() => Boolean(round.value && round.value.blackUserId === selfId.value))
  const myColor = computed(() => {
    if (!participant.value || !round.value) return ''
    if (isBlind.value) {
      if (firstSideUserId.value === selfId.value) return '红方'
      if (secondSideUserId.value === selfId.value) return '黑方'
      return ''
    }
    if (!arenaMode.value) return isBlack.value ? '先手' : '后手'
    if (gameId.value === 'topology-arena') {
      return round.value.attackerUserId === selfId.value ? '故障注入方' : '稳态保障方'
    }
    if (gameId.value === 'cluster-patrol-arena') {
      const team = exerciseSelf.value?.team
      return team ? `${team} 队巡检员` : '巡检员'
    }
    return '排查方'
  })
  const arenaRemaining = computed(() => {
    const endsAt = arenaState.value?.endsAt ?? round.value?.endsAt
    if (!endsAt) return 0
    return Math.max(0, Math.ceil((endsAt - now.value) / 1000))
  })
  const arenaInteractive = computed(
    () =>
      participant.value &&
      store.status === 'online' &&
      match.value?.status === 'RUNNING' &&
      round.value?.status === 'RUNNING' &&
      Boolean(arenaState.value) &&
      !arenaState.value?.finished,
  )
  const blackName = computed(() =>
    match.value && round.value
      ? playerName(round.value.blackUserId, nicknameFor(round.value.blackUserId))
      : '待定',
  )
  const whiteName = computed(() =>
    match.value && round.value
      ? playerName(round.value.whiteUserId, nicknameFor(round.value.whiteUserId))
      : '待定',
  )
  const turnName = computed(() =>
    match.value && round.value?.turnUserId
      ? nicknameFor(round.value.turnUserId)
      : '',
  )
  const isMyTurn = computed(
    () =>
      participant.value &&
      round.value?.status === 'RUNNING' &&
      round.value.turnUserId === selfId.value,
  )
  const boardInteractive = computed(
    () => isMyTurn.value && match.value?.status === 'RUNNING',
  )
  const readyUserIds = computed(() => round.value?.readyUserIds ?? [])
  const canReady = computed(
    () =>
      participant.value &&
      store.status === 'online' &&
      (match.value?.status === 'READY' ||
        (match.value?.status === 'RUNNING' && round.value?.status === 'REST')),
  )
  const restSeconds = computed(() => {
    if (!round.value?.restUntil) return 0
    return Math.max(0, Math.ceil((round.value.restUntil - now.value) / 1000))
  })
  const moveSeconds = computed(() => {
    if (!round.value || round.value.status !== 'RUNNING' || !round.value.turnUserId) return 0
    return Math.max(
      0,
      Math.ceil((round.value.lastMoveAt + MOVE_TIMEOUT_SECONDS * 1000 - now.value) / 1000),
    )
  })
  const maxGames = computed(() => {
    if (match.value?.stage === 'LEAGUE') return 1
    const format = tournament.value?.format ?? 'BO1'
    return format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1
  })
  const gameLabel = computed(() => {
    if (!round.value) return maxGames.value > 1 ? `BO${maxGames.value}` : 'BO1'
    if (isBlind.value) return `第 ${round.value.gameNo} 局`
    return `第 ${round.value.gameNo} / ${maxGames.value} 阶段`
  })
  const stateLabel = computed(() => {
    if (!match.value) return ''
    if (match.value.status === 'FINISHED') return '已结束'
    if (match.value.status === 'READY') return '等待双方就绪'
    if (round.value?.status === 'REST') return '阶段间隔'
    if (round.value?.status === 'RUNNING') return '执行中'
    return '就绪中'
  })
  const winnerName = computed(() => {
    const value = match.value
    const winnerId = arenaState.value?.winnerUserId || value?.winnerUserId
    if (!winnerId) return ''
    if (!value) return playerNames.value[winnerId] ?? winnerId
    if (winnerId === value.player1UserId) return value.player1Nickname || winnerId
    if (winnerId === value.player2UserId) return value.player2Nickname || winnerId
    return playerNames.value[winnerId] ?? winnerId
  })
  const resultReason = computed(
    () => arenaState.value?.finishReason || store.lastResult?.reason || '',
  )
  const blindActionText = computed(() => {
    const event = store.lastBlindAction
    const value = match.value
    if (!isBlind.value || !event || !value || event.matchId !== value.id) return ''
    const actor = nicknameFor(event.userId)
    if (event.action === 'REVEAL') {
      return `${actor} 翻开了 ${pieceLabel(event.pieceColor, event.pieceType)}`
    }
    const moved = pieceLabel(event.pieceColor, event.pieceType)
    const captured =
      event.capturedPieceType && event.capturedPieceColor
        ? `，吃掉 ${pieceLabel(event.capturedPieceColor, event.capturedPieceType)}`
        : ''
    const result =
      event.result === 'WIN'
        ? ' · 将帅被吃'
        : event.result === 'DRAW'
          ? ' · 将帅见面'
          : ''
    return `${actor} 移动 ${moved}${captured}${result}`
  })
  const chatClosed = computed(
    () =>
      tournament.value?.status === 'FINISHED' || tournament.value?.status === 'CANCELLED',
  )
  const chatMessages = computed(() =>
    store.chatMessages.filter((message) => message.channel === channel.value),
  )
  const privateTabVisible = computed(() => participant.value)
  const chatHint = computed(() => {
    if (chatClosed.value) return '演练已结束，聊天记录仅供回看'
    if (channel.value === 'PLAYER_DM') return '仅双方成员可见，结束后仍可回看'
    return '公开频道 · 所有查看者可见'
  })
  const chatPlaceholder = computed(() => {
    if (chatClosed.value) return '演练已结束，无法发送消息'
    if (channel.value === 'PLAYER_DM') return '与对方私聊…'
    return '和频道里的成员聊聊…'
  })
  const readyState = computed(() => {
    if (!match.value) return ''
    if (match.value.status === 'READY') {
      return isBlind.value
        ? '双方确认就绪后开始，随机分配红黑'
        : '双方确认就绪后开始执行，随机分配先手'
    }
    if (round.value?.status === 'REST') {
      return readyUserIds.value.length
        ? `已就绪：${readyUserIds.value.map(nicknameFor).join('、')}`
        : '双方可选择立即继续，或等待间隔结束'
    }
    return ''
  })
  const firstGameLabel = computed(() =>
    match.value?.firstGameId ? scriptShortLabel(match.value.firstGameId) : '待抽取',
  )
  const ownsFirstGame = computed(
    () =>
      Boolean(
        match.value &&
          selfId.value &&
          match.value.gameChooserUserId === selfId.value &&
          !match.value.startedAt &&
          (match.value.status === 'READY' || match.value.status === 'PENDING'),
      ),
  )
  const bothReady = computed(() => {
    const value = match.value
    if (!value) return false
    return (
      readyUserIds.value.includes(value.player1UserId ?? '') &&
      readyUserIds.value.includes(value.player2UserId ?? '')
    )
  })

  function nicknameFor(userId: string | null): string {
    if (!userId) return '待定'
    const value = match.value
    if (value?.player1UserId === userId) return value.player1Nickname || userId
    if (value?.player2UserId === userId) return value.player2Nickname || userId
    return userId
  }

  function colorFor(userId: string | null): string {
    if (!userId || !round.value) return ''
    if (isBlind.value) {
      if (firstSideUserId.value === userId) return '红'
      if (secondSideUserId.value === userId) return '黑'
      return ''
    }
    if (gameId.value === 'topology-arena') {
      return round.value.attackerUserId === userId ? '攻' : '守'
    }
    if (gameId.value === 'cluster-patrol-arena') {
      return (
        exerciseState.value?.actors.find((actor) => actor.userId === userId)?.team ??
        (round.value.blackUserId === userId ? '1' : '2')
      )
    }
    if (arenaMode.value) {
      return round.value.blackUserId === userId ? '1' : '2'
    }
    if (round.value.blackUserId === userId) return 'A'
    if (round.value.whiteUserId === userId) return 'B'
    return ''
  }

  function chipClass(userId: string | null): string {
    if (!userId || !round.value) return ''
    if (isBlind.value) {
      if (firstSideUserId.value === userId) return 'is-red'
      if (secondSideUserId.value === userId) return 'is-black-side'
      return ''
    }
    if (round.value.blackUserId === userId) return 'is-black'
    if (round.value.whiteUserId === userId) return 'is-white'
    return ''
  }

  function hasReady(userId: string | null): boolean {
    return Boolean(userId && readyUserIds.value.includes(userId))
  }

  function isWinner(userId: string | null): boolean {
    return Boolean(userId && match.value?.winnerUserId === userId)
  }

  async function scrollChat() {
    await nextTick()
    if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight
  }

  function sendChat() {
    const text = chatInput.value.trim()
    if (!text || chatClosed.value) return
    actionError.value = ''
    void store.sendChat(text, channel.value).then((ok) => {
      if (ok) {
        chatInput.value = ''
        void scrollChat()
      }
    })
  }

  function ready() {
    actionError.value = ''
    if (!store.ready()) actionError.value = store.lastError
  }

  function chooseGame() {
    if (!drawChoice.value) return
    actionError.value = ''
    if (!store.chooseGame(drawChoice.value)) actionError.value = store.lastError
  }

  function place(x: number, y: number) {
    if (!boardInteractive.value) return
    actionError.value = ''
    if (!store.placeStone(x, y)) actionError.value = store.lastError
  }

  function arenaAction(action: GameArenaAction) {
    if (!arenaInteractive.value) return
    actionError.value = ''
    if (!store.sendArenaAction(action)) actionError.value = store.lastError
  }

  function exerciseInput(input: ExerciseInput) {
    if (!arenaInteractive.value) return
    actionError.value = ''
    if (!store.sendExerciseInput(input)) actionError.value = store.lastError
  }

  function openBoardWindow() {
    boardExpanded.value = true
  }

  function closeBoardWindow() {
    boardExpanded.value = false
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !boardExpanded.value) return
    event.preventDefault()
    closeBoardWindow()
  }

  function reveal(x: number, y: number) {
    if (!boardInteractive.value) return
    actionError.value = ''
    if (!store.revealPiece(x, y)) actionError.value = store.lastError
  }

  function move(fromX: number, fromY: number, toX: number, toY: number) {
    if (!boardInteractive.value) return
    actionError.value = ''
    if (!store.movePiece(fromX, fromY, toX, toY)) actionError.value = store.lastError
  }

  function resign() {
    if (!participant.value || resigning.value) return
    if (!window.confirm('确认终止本轮？本轮将判定为失败。')) return
    resigning.value = true
    actionError.value = ''
    if (!store.resign()) {
      actionError.value = store.lastError
      resigning.value = false
    }
  }

  watch(
    () => match.value?.status,
    (status) => {
      if (status === 'FINISHED') resigning.value = false
    },
  )

  watch(
    () => match.value?.firstGameId,
    (gameId) => {
      // 服务端抽签结果变化时同步下拉选中项；不覆盖用户已选但未提交的剧本。
      if (gameId && !drawChoice.value) drawChoice.value = gameId
    },
    { immediate: true },
  )

  watch(
    () => [channel.value, chatMessages.value.length],
    () => void scrollChat(),
  )

  watch(privateTabVisible, (visible) => {
    if (!visible && channel.value === 'PLAYER_DM') channel.value = 'PUBLIC'
  })

  onMounted(() => {
    clockTimer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
    window.addEventListener('keydown', onKeydown)
    void scrollChat()
  })

  onBeforeUnmount(() => {
    if (clockTimer) clearInterval(clockTimer)
    window.removeEventListener('keydown', onKeydown)
  })

  return {
    store,
    match,
    isDuel,
    matchLoading,
    matchError,
    chatLoading,
    chatError,
    tournament,
    round,
    selfId,
    participant,
    isBlind,
    firstSideName,
    secondSideName,
    lostByColor,
    player1BlindColor,
    player2BlindColor,
    gameId,
    arenaMode,
    arenaState,
    heatmapState,
    topologyState,
    exerciseState,
    playerNames,
    myColor,
    arenaRemaining,
    arenaInteractive,
    blackName,
    whiteName,
    turnName,
    isMyTurn,
    boardInteractive,
    canReady,
    restSeconds,
    moveSeconds,
    maxGames,
    gameLabel,
    stateLabel,
    winnerName,
    resultReason,
    blindActionText,
    chatClosed,
    chatMessages,
    privateTabVisible,
    chatHint,
    chatPlaceholder,
    readyState,
    firstGameLabel,
    ownsFirstGame,
    bothReady,
    isWinner,
    colorFor,
    chipClass,
    hasReady,
    sendChat,
    ready,
    chooseGame,
    place,
    arenaAction,
    exerciseInput,
    openBoardWindow,
    closeBoardWindow,
    reveal,
    move,
    resign,
    DRAW_OPTIONS,
    drawChoice,
    resigning,
    boardExpanded,
    actionError,
    channel,
    chatInput,
    chatBody,
    formatClock,
    formatDuration,
    formatLabel,
    playerName,
    scriptLabel,
  }
}
