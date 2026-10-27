import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/modules/auth/types'
import type {
  GameArenaStateEvent,
  GameMatch,
  GameRound,
  GameTournament,
  HeatmapState,
} from '@/modules/games/types'
import { useTournamentStore } from '@/stores/tournament'

const { socketState, MockGameSocketClient } = vi.hoisted(() => {
  interface SocketStub {
    sendArenaAction: ReturnType<typeof vi.fn>
    chooseGame: ReturnType<typeof vi.fn>
  }
  const state: {
    handlers: Record<string, (...args: unknown[]) => void> | null
    socket: SocketStub | null
  } = { handlers: null, socket: null }
  class MockGameSocketClient {
    constructor(handlers: Record<string, (...args: unknown[]) => void>) {
      state.handlers = handlers
      state.socket = this
    }

    connect = vi.fn<() => Promise<void>>(() => Promise.resolve())
    close = vi.fn<() => void>()
    refreshLobby = vi.fn<() => boolean>(() => true)
    watchMatch = vi.fn<() => boolean>(() => true)
    leaveMatch = vi.fn<() => boolean>(() => true)
    ready = vi.fn<() => boolean>(() => true)
    placeStone = vi.fn<() => boolean>(() => true)
    resign = vi.fn<() => boolean>(() => true)
    sendArenaAction = vi.fn(() => true)
    chooseGame = vi.fn<() => boolean>(() => true)
    sendChat = vi.fn<() => boolean>(() => true)
  }
  return { socketState: state, MockGameSocketClient }
})

const api = vi.hoisted(() => {
  const mock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>()
  return {
    acceptDuel: mock(),
    acceptTournament: mock(),
    cancelDuel: mock(),
    cancelTournament: mock(),
    createDuel: mock(),
    createTournament: mock(),
    declineDuel: mock(),
    declineTournament: mock(),
    deleteTournament: mock(),
    fetchActiveMatches: mock(),
    fetchDuel: mock(),
    fetchDuels: mock(),
    fetchGameNotifications: mock(),
    fetchInvitations: mock(),
    fetchMatch: mock(),
    fetchMatchChat: mock(),
    fetchOnline: mock(),
    fetchTournament: mock(),
    fetchTournaments: mock(),
    sendMatchChat: mock(),
  }
})

vi.mock('@/modules/games/gameApi', () => api)
vi.mock('@/modules/chat/chatApi', () => ({ fetchOnline: api.fetchOnline }))
vi.mock('@/modules/games/gameSocket', () => ({
  GameSocketClient: MockGameSocketClient,
}))

const USER: AuthUser = {
  id: 1,
  username: 'alice',
  nickname: 'Alice',
  role: 'USER',
  status: 'ACTIVE',
}

function duel(overrides: Partial<GameTournament> = {}): GameTournament {
  return {
    id: 'd1',
    name: '一对一约战',
    gameId: 'heatmap-gomoku',
    kind: 'DUEL',
    format: 'BO3',
    bracketType: 'KNOCKOUT',
    status: 'INVITING',
    creatorUserId: 'u1',
    creatorNickname: 'Alice',
    targetPlayers: 2,
    inviteDeadline: 0,
    currentRound: 0,
    totalRounds: 1,
    championUserId: null,
    championNickname: null,
    runnerUpUserId: null,
    runnerUpNickname: null,
    createdAt: 0,
    startedAt: null,
    finishedAt: null,
    players: [
      { userId: 'u1', nickname: 'Alice', seed: 1, status: 'ACCEPTED' },
      { userId: 'u2', nickname: 'Bob', seed: 2, status: 'INVITED' },
    ],
    matches: [],
    ...overrides,
  }
}

function duelMatch(overrides: Partial<GameMatch> = {}): GameMatch {
  return {
    id: 'm1',
    tournamentId: 'd1',
    gameId: 'heatmap-gomoku',
    kind: 'DUEL',
    roundNo: 1,
    slotNo: 1,
    stage: 'KNOCKOUT',
    status: 'RUNNING',
    player1UserId: 'u1',
    player1Nickname: 'Alice',
    player2UserId: 'u2',
    player2Nickname: 'Bob',
    player1Score: 0,
    player2Score: 0,
    winnerUserId: null,
    nextMatchId: null,
    firstGameId: null,
    gameChooserUserId: null,
    createdAt: 0,
    startedAt: 0,
    finishedAt: null,
    currentRound: null,
    ...overrides,
  }
}

function arenaRound(overrides: Partial<GameRound> = {}): GameRound {
  return {
    id: 'r1',
    gameId: 'log-hotspot-arena',
    gameNo: 1,
    status: 'RUNNING',
    blackUserId: 'u1',
    whiteUserId: 'u2',
    attackerUserId: 'u1',
    turnUserId: null,
    winnerUserId: null,
    moveCount: 0,
    lastMoveAt: 0,
    restUntil: null,
    readyUserIds: ['u1', 'u2'],
    startedAt: 0,
    endsAt: 120_000,
    finishedAt: null,
    seq: 0,
    state: null,
    moves: [],
    ...overrides,
  }
}

function heatmapState(seq: number, endsAt = 120_000): HeatmapState {
  return {
    gameId: 'log-hotspot-arena',
    players: ['u1', 'u2'],
    startedAt: 0,
    endsAt,
    finishedAt: 0,
    serverTime: seq,
    seed: 7,
    seq,
    finished: false,
    winnerUserId: null,
    finishReason: null,
    events: [],
    rows: 8,
    cols: 12,
    lastIncomeAt: 0,
    lastHeatShiftAt: 0,
    heatShiftIndex: 0,
    cells: [],
    scores: { u1: 0, u2: 0 },
    energy: { u1: 30, u2: 30 },
    cooldowns: {},
  }
}

function arenaStateEvent(seq: number, endsAt = 120_000): GameArenaStateEvent {
  return {
    type: 'arena_state',
    matchId: 'm1',
    roundId: 'r1',
    gameId: 'log-hotspot-arena',
    seq,
    serverTime: seq,
    state: heatmapState(seq, endsAt),
  }
}

function fire(name: string, ...args: unknown[]) {
  const handler = socketState.handlers?.[name]
  if (!handler) throw new Error(`缺少 socket handler: ${name}`)
  handler(...args)
}

async function bootStore() {
  writeAuth({ token: 'duel-token', user: USER })
  setActivePinia(createPinia())
  api.fetchTournaments.mockResolvedValue([])
  api.fetchInvitations.mockResolvedValue([])
  api.fetchDuels.mockResolvedValue([])
  api.fetchActiveMatches.mockResolvedValue([])
  api.fetchGameNotifications.mockResolvedValue([])
  api.fetchOnline.mockResolvedValue([])
  const store = useTournamentStore()
  store.start()
  await vi.waitFor(() => expect(store.lobbyLoading).toBe(false))
  return store
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  socketState.handlers = null
  vi.clearAllMocks()
})

describe('约战状态', () => {
  it('待响应邀请计数与未读角标仅在面板关闭时累加', async () => {
    const first = duel({
      id: 'd1',
      creatorUserId: 'u2',
      creatorNickname: 'Bob',
      players: [
        { userId: 'u2', nickname: 'Bob', seed: 1, status: 'ACCEPTED' },
        { userId: 'u1', nickname: 'Alice', seed: 2, status: 'INVITED' },
      ],
    })
    const second = duel({
      id: 'd2',
      creatorUserId: 'u3',
      creatorNickname: 'Carol',
      players: [
        { userId: 'u3', nickname: 'Carol', seed: 1, status: 'ACCEPTED' },
        { userId: 'u1', nickname: 'Alice', seed: 2, status: 'INVITED' },
      ],
    })
    const store = await bootStore()
    fire('onReady', {
      user: { userId: 'u1', nickname: 'Alice' },
      duels: [first],
    })

    expect(store.duels).toHaveLength(1)
    expect(store.pendingDuelInvitationCount).toBe(1)
    expect(store.duelInviteUnread).toBe(1)

    // 打开面板会刷新大厅数据，服务端此时已能看到第一条邀请。
    api.fetchDuels.mockResolvedValue([first])
    store.openDuelPanel()
    expect(store.duelInviteUnread).toBe(0)
    await vi.waitFor(() => expect(store.lobbyLoading).toBe(false))

    fire('onDuelInvitation', second)
    expect(store.duels.map((entry) => entry.id)).toEqual(['d2', 'd1'])
    expect(store.duelInviteUnread).toBe(0)
    store.stop()
  })

  it('发起约战会调用接口并将结果并入列表', async () => {
    const store = await bootStore()
    api.createDuel.mockResolvedValue(duel())

    const result = await store.createDuelFor({ userId: 'u2', nickname: 'Bob' }, 'BO3')

    expect(api.createDuel).toHaveBeenCalledWith({
      opponentUserId: 'u2',
      opponentNickname: 'Bob',
      format: 'BO3',
      gameId: 'heatmap-gomoku',
    })
    expect(result.id).toBe('d1')
    expect(store.duels.map((entry) => entry.id)).toEqual(['d1'])
    store.stop()
  })

  it('进行中的约战只包含 INVITING / RUNNING，等待创建者响应不算邀请', async () => {
    const store = await bootStore()
    fire('onReady', {
      user: { userId: 'u1', nickname: 'Alice' },
      duels: [
        duel({ id: 'waiting' }),
        duel({
          id: 'running',
          status: 'RUNNING',
          matches: [duelMatch({ tournamentId: 'running' })],
        }),
        duel({ id: 'finished', status: 'FINISHED' }),
      ],
    })

    expect(store.activeDuels.map((entry) => entry.id)).toEqual(['waiting', 'running'])
    expect(store.pendingDuelInvitations).toHaveLength(0)
    store.stop()
  })

  it('打开新对局时丢弃上一场残留的 WS 错误', async () => {
    const store = await bootStore()
    const current = duel({ matches: [duelMatch()] })
    fire('onReady', {
      user: { userId: 'u1', nickname: 'Alice' },
      duels: [current],
    })
    fire('onError', '比赛不存在')
    expect(store.lastError).toBe('比赛不存在')
    api.fetchMatch.mockResolvedValue(duelMatch())

    await store.watch('m1')

    expect(store.lastError).toBe('')
    expect(store.currentMatch?.id).toBe('m1')
    store.stop()
  })

  it('在线成员优先展示比赛通道下发的用户中台名号', async () => {
    const store = await bootStore()
    fire('onReady', {
      user: { userId: 'u1', nickname: 'Alice' },
      onlineUserIds: ['u1', 'u2'],
      onlineMembers: [
        { userId: 'u1', nickname: 'Alice' },
        { userId: 'u2', nickname: '良一情' },
      ],
    })
    api.fetchOnline.mockResolvedValue([
      {
        groupId: null,
        userId: 'u2',
        nickname: 'u2',
        node: 'test',
        joinedAt: 0,
      },
    ])

    await store.refreshLobby()

    expect(store.lobbyOnline).toEqual([
      { userId: 'u1', nickname: 'Alice' },
      { userId: 'u2', nickname: '良一情' },
    ])
    store.stop()
  })
})

describe('竞技场剧本', () => {
  it('创建演练与约战都会携带选定剧本', async () => {
    const store = await bootStore()
    api.createTournament.mockResolvedValue(
      duel({ id: 't1', kind: 'TOURNAMENT', gameId: 'topology-arena' }),
    )

    await store.create({
      name: '混沌演练',
      format: 'BO1',
      players: [{ userId: 'u1', nickname: 'Alice' }],
      gameId: 'topology-arena',
    })

    expect(api.createTournament).toHaveBeenCalledWith({
      name: '混沌演练',
      format: 'BO1',
      players: [{ userId: 'u1', nickname: 'Alice' }],
      gameId: 'topology-arena',
    })

    api.createDuel.mockResolvedValue(duel({ gameId: 'log-hotspot-arena' }))
    await store.createDuelFor({ userId: 'u2', nickname: 'Bob' }, 'BO1', 'log-hotspot-arena')

    expect(api.createDuel).toHaveBeenLastCalledWith({
      opponentUserId: 'u2',
      opponentNickname: 'Bob',
      format: 'BO1',
      gameId: 'log-hotspot-arena',
    })
    store.stop()
  })

  it('增量帧只接受更新的 seq，并写入权威状态', async () => {
    const store = await bootStore()
    store.currentMatchId = 'm1'
    store.currentMatch = duelMatch({ currentRound: arenaRound({ seq: 10 }) })

    fire('onArenaState', arenaStateEvent(12, 90_000))

    expect(store.currentRound?.seq).toBe(12)
    expect(store.currentRound?.state?.endsAt).toBe(90_000)
    expect(store.currentRound?.gameId).toBe('log-hotspot-arena')
    expect(store.currentRound?.lastMoveAt).toBe(12)

    fire('onArenaState', arenaStateEvent(11, 200_000))

    expect(store.currentRound?.seq).toBe(12)
    expect(store.currentRound?.state?.endsAt).toBe(90_000)
    store.stop()
  })

  it('详情接口返回旧快照时保留本地更新的竞技场状态', async () => {
    const store = await bootStore()
    store.currentMatchId = 'm1'
    store.currentMatch = duelMatch({ currentRound: arenaRound({ seq: 10 }) })
    fire('onArenaState', arenaStateEvent(15, 80_000))

    fire(
      'onMatch',
      duelMatch({
        currentRound: arenaRound({
          seq: 9,
          endsAt: 120_000,
          state: heatmapState(9),
        }),
      }),
    )

    expect(store.currentMatch?.currentRound?.seq).toBe(15)
    expect(store.currentMatch?.currentRound?.endsAt).toBe(80_000)
    expect(store.currentMatch?.currentRound?.state?.seq).toBe(15)
    store.stop()
  })

  it('竞技场动作通过调度通道转发，断线时给出提示', async () => {
    const store = await bootStore()
    store.currentMatchId = 'm1'
    store.currentMatch = duelMatch({ currentRound: arenaRound() })

    expect(store.sendArenaAction({ action: 'CLAIM', cell: 3 })).toBe(true)
    expect(socketState.socket?.sendArenaAction).toHaveBeenCalledWith('m1', {
      action: 'CLAIM',
      cell: 3,
    })

    socketState.socket?.sendArenaAction.mockReturnValue(false)
    expect(store.sendArenaAction({ action: 'RAID', cell: 4 })).toBe(false)
    expect(store.lastError).toBe('调度通道未连接，请稍后重试')
    store.stop()
  })

  it('首局选图经调度通道发送，断线时给出提示', async () => {
    const store = await bootStore()
    store.currentMatchId = 'm1'
    store.currentMatch = duelMatch({ currentRound: arenaRound() })

    expect(store.chooseGame('topology-arena')).toBe(true)
    expect(socketState.socket?.chooseGame).toHaveBeenCalledWith('m1', 'topology-arena')

    socketState.socket?.chooseGame.mockReturnValue(false)
    expect(store.chooseGame('random')).toBe(false)
    expect(store.lastError).toBe('调度通道未连接，请稍后重试')
    store.stop()
  })
})

describe('约战不提供聊天', () => {
  it('发送与加载聊天都被短路', async () => {
    const store = await bootStore()
    store.currentMatch = duelMatch()

    expect(await store.sendChat('hello', 'PUBLIC')).toBe(false)
    expect(store.chatError).toBe('约战不提供聊天')
    expect(api.sendMatchChat).not.toHaveBeenCalled()

    await store.loadChat()
    expect(api.fetchMatchChat).not.toHaveBeenCalled()
    expect(store.chatMessages).toEqual([])
    store.stop()
  })
})
