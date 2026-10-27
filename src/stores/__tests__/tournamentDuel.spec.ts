import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/modules/auth/types'
import type {
  GameBlindActionEvent,
  GameMatch,
  GameTournament,
} from '@/modules/games/types'
import { useTournamentStore } from '@/stores/tournament'

const { socketState, MockGameSocketClient } = vi.hoisted(() => {
  const state: {
    handlers: Record<string, (...args: unknown[]) => void> | null
  } = { handlers: null }
  class MockGameSocketClient {
    constructor(handlers: Record<string, (...args: unknown[]) => void>) {
      state.handlers = handlers
    }

    connect = vi.fn<() => Promise<void>>(() => Promise.resolve())
    close = vi.fn<() => void>()
    refreshLobby = vi.fn<() => boolean>(() => true)
    watchMatch = vi.fn<() => boolean>(() => true)
    leaveMatch = vi.fn<() => boolean>(() => true)
    ready = vi.fn<() => boolean>(() => true)
    placeStone = vi.fn<() => boolean>(() => true)
    revealPiece = vi.fn<() => boolean>(() => true)
    movePiece = vi.fn<() => boolean>(() => true)
    resign = vi.fn<() => boolean>(() => true)
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
    createdAt: 0,
    startedAt: 0,
    finishedAt: null,
    currentRound: null,
    ...overrides,
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
    })
    expect(result.id).toBe('d1')
    expect(store.duels.map((entry) => entry.id)).toEqual(['d1'])
    store.stop()
  })

  it('发起盲棋约战会带上 gameId 与 blindLayout', async () => {
    const store = await bootStore()
    api.createDuel.mockResolvedValue(
      duel({ gameId: 'blind-xiangqi', blindLayout: 'FULL_RANDOM' }),
    )

    const result = await store.createDuelFor(
      { userId: 'u2', nickname: 'Bob' },
      'BO1',
      'blind-xiangqi',
      'FULL_RANDOM',
    )

    expect(api.createDuel).toHaveBeenCalledWith({
      opponentUserId: 'u2',
      opponentNickname: 'Bob',
      format: 'BO1',
      gameId: 'blind-xiangqi',
      blindLayout: 'FULL_RANDOM',
    })
    expect(result.gameId).toBe('blind-xiangqi')
    expect(result.blindLayout).toBe('FULL_RANDOM')
    store.stop()
  })

  it('盲棋动作帧会写入 lastBlindAction', async () => {
    const store = await bootStore()
    const event: GameBlindActionEvent = {
      type: 'blind_action',
      matchId: 'm1',
      roundId: 'r1',
      moveNo: 1,
      userId: 'u1',
      action: 'REVEAL',
      fromX: null,
      fromY: null,
      toX: 4,
      toY: 5,
      pieceType: 'CANNON',
      pieceColor: 'RED',
      capturedPieceType: null,
      capturedPieceColor: null,
      turnUserId: 'u2',
      moveCount: 1,
      result: null,
    }

    fire('onBlindAction', event)

    expect(store.lastBlindAction).toEqual(event)
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
