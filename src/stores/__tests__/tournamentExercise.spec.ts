import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/modules/auth/types'
import type {
  ExerciseActor,
  ExerciseRoom,
  ExerciseStanding,
  ExerciseState,
  GameExerciseFinishedEvent,
  GameExerciseStateEvent,
  GameMatch,
  GameRound,
} from '@/modules/games/types'
import { useTournamentStore } from '@/stores/tournament'

const { socketState, MockGameSocketClient } = vi.hoisted(() => {
  const state: {
    handlers: Record<string, (...args: unknown[]) => void> | null
    socket: Record<string, ReturnType<typeof vi.fn>> | null
  } = { handlers: null, socket: null }
  class MockGameSocketClient {
    constructor(handlers: Record<string, (...args: unknown[]) => void>) {
      state.handlers = handlers
      state.socket = this as unknown as Record<string, ReturnType<typeof vi.fn>>
    }

    connect = vi.fn<() => Promise<void>>(() => Promise.resolve())
    close = vi.fn<() => void>()
    refreshLobby = vi.fn<() => boolean>(() => true)
    watchMatch = vi.fn<() => boolean>(() => true)
    leaveMatch = vi.fn<() => boolean>(() => true)
    ready = vi.fn<() => boolean>(() => true)
    placeStone = vi.fn<() => boolean>(() => true)
    resign = vi.fn<() => boolean>(() => true)
    sendArenaAction = vi.fn<() => boolean>(() => true)
    chooseGame = vi.fn<() => boolean>(() => true)
    sendChat = vi.fn<() => boolean>(() => true)
    joinExercise = vi.fn<() => boolean>(() => true)
    leaveExercise = vi.fn<() => boolean>(() => true)
    readyExercise = vi.fn<() => boolean>(() => true)
    refreshExerciseRooms = vi.fn<() => boolean>(() => true)
    sendExerciseInput = vi.fn<() => boolean>(() => true)
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
    createExerciseRoom: mock(),
    createTournament: mock(),
    declineDuel: mock(),
    declineTournament: mock(),
    deleteTournament: mock(),
    fetchActiveMatches: mock(),
    fetchDuel: mock(),
    fetchDuels: mock(),
    fetchExerciseResults: mock(),
    fetchExerciseRooms: mock(),
    fetchGameNotifications: mock(),
    fetchInvitations: mock(),
    fetchMatch: mock(),
    fetchMatchChat: mock(),
    fetchOnline: mock(),
    fetchTournament: mock(),
    fetchTournaments: mock(),
    joinExerciseRoom: mock(),
    leaveExerciseRoom: mock(),
    readyExerciseRoom: mock(),
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

function actor(overrides: Partial<ExerciseActor> = {}): ExerciseActor {
  return {
    userId: 'u1',
    nickname: 'Alice',
    team: null,
    bot: false,
    x: 100,
    y: 100,
    aim: 0,
    hp: 100,
    alive: true,
    respawnAt: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    shots: 0,
    hits: 0,
    lastFireAt: 0,
    lastInputAt: 0,
    inputX: 0,
    inputY: 0,
    scanUntil: 0,
    shieldUntil: 0,
    speedUntil: 0,
    cooldowns: {},
    damageAt: {},
    ...overrides,
  }
}

function exerciseState(
  seq = 1,
  overrides: Partial<ExerciseState> = {},
): ExerciseState {
  return {
    gameId: 'cluster-patrol-arena',
    players: ['u1', 'u2'],
    startedAt: 0,
    endsAt: 180_000,
    finishedAt: 0,
    serverTime: seq,
    seed: 1,
    seq,
    finished: false,
    winnerUserId: null,
    finishReason: null,
    events: [],
    roomId: 'room-1',
    mode: 'FFA',
    status: 'RUNNING',
    winnerTeam: null,
    lastTickAt: seq,
    seedValue: 1,
    width: 1280,
    height: 720,
    actors: [actor(), actor({ userId: 'u2', nickname: 'Bob' })],
    obstacles: [],
    points: [],
    tracers: [],
    ...overrides,
  }
}

function room(overrides: Partial<ExerciseRoom> = {}): ExerciseRoom {
  return {
    roomId: 'room-1',
    roomCode: 'FM-1010',
    mode: 'FFA',
    source: 'CASUAL',
    status: 'WAITING',
    matchId: null,
    ownerUserId: 'u1',
    maxPlayers: 4,
    durationSeconds: 180,
    createdAt: 0,
    startedAt: null,
    members: [
      { userId: 'u1', nickname: 'Alice', team: null, ready: true, bot: false },
    ],
    ...overrides,
  }
}

function standing(overrides: Partial<ExerciseStanding> = {}): ExerciseStanding {
  return {
    rank: 1,
    userId: 'u1',
    nickname: 'Alice',
    team: null,
    score: 18,
    kills: 3,
    deaths: 1,
    assists: 1,
    winner: true,
    ...overrides,
  }
}

function exerciseStateEvent(
  seq: number,
  roomId = 'room-1',
  you: string | null = 'u1',
): GameExerciseStateEvent {
  return {
    type: 'exercise_state',
    roomId,
    roomCode: roomId === 'r1' ? 'MATCH-1' : 'FM-1010',
    mode: 'FFA',
    matchId: roomId === 'r1' ? 'm1' : null,
    seq,
    serverTime: seq,
    you,
    state: exerciseState(seq, { roomId }),
  }
}

function exerciseFinishedEvent(roomId = 'room-1'): GameExerciseFinishedEvent {
  return {
    type: 'exercise_finished',
    roomId,
    roomCode: 'FM-1010',
    mode: 'FFA',
    matchId: null,
    winnerUserId: 'u1',
    winnerTeam: null,
    reason: '巡检积分领先',
    standings: [standing()],
    state: exerciseState(9, { finished: true, winnerUserId: 'u1' }),
  }
}

function arenaRound(overrides: Partial<GameRound> = {}): GameRound {
  return {
    id: 'r1',
    gameId: 'cluster-patrol-arena',
    gameNo: 1,
    status: 'RUNNING',
    blackUserId: 'u1',
    whiteUserId: 'u2',
    attackerUserId: null,
    turnUserId: null,
    winnerUserId: null,
    moveCount: 0,
    lastMoveAt: 0,
    restUntil: null,
    readyUserIds: ['u1', 'u2'],
    startedAt: 0,
    endsAt: 180_000,
    finishedAt: null,
    seq: 2,
    state: exerciseState(2, { roomId: 'r1' }),
    moves: [],
    ...overrides,
  }
}

function match(overrides: Partial<GameMatch> = {}): GameMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    gameId: 'cluster-patrol-arena',
    kind: 'TOURNAMENT',
    roundNo: 1,
    slotNo: 1,
    stage: 'PAGE_PLAYOFF',
    status: 'RUNNING',
    player1UserId: 'u1',
    player1Nickname: 'Alice',
    player2UserId: 'u2',
    player2Nickname: 'Bob',
    player1Score: 0,
    player2Score: 0,
    winnerUserId: null,
    nextMatchId: null,
    firstGameId: 'cluster-patrol-arena',
    gameChooserUserId: null,
    createdAt: 0,
    startedAt: 0,
    finishedAt: null,
    currentRound: arenaRound(),
    ...overrides,
  }
}

function fire(name: string, ...args: unknown[]) {
  const handler = socketState.handlers?.[name]
  if (!handler) throw new Error(`缺少 socket handler: ${name}`)
  handler(...args)
}

async function bootStore() {
  writeAuth({ token: 'exercise-token', user: USER })
  setActivePinia(createPinia())
  api.fetchTournaments.mockResolvedValue([])
  api.fetchInvitations.mockResolvedValue([])
  api.fetchDuels.mockResolvedValue([])
  api.fetchActiveMatches.mockResolvedValue([])
  api.fetchGameNotifications.mockResolvedValue([])
  api.fetchOnline.mockResolvedValue([])
  api.fetchExerciseRooms.mockResolvedValue([])
  api.fetchExerciseResults.mockResolvedValue([])
  const store = useTournamentStore()
  store.start()
  await vi.waitFor(() => expect(store.lobbyLoading).toBe(false))
  return store
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  socketState.handlers = null
  socketState.socket = null
  vi.clearAllMocks()
})

describe('巡检休闲房间', () => {
  it('单人训练创建即开局，不登记重连房间，输入直接上报', async () => {
    const store = await bootStore()
    api.createExerciseRoom.mockResolvedValue(
      room({
        mode: 'TRAINING',
        status: 'RUNNING',
        maxPlayers: 1,
        startedAt: 1,
        state: exerciseState(1, { mode: 'TRAINING', status: 'RUNNING' }),
      }),
    )

    const created = await store.createExercise('TRAINING')

    expect(api.createExerciseRoom).toHaveBeenCalledWith('TRAINING', undefined)
    expect(created?.roomId).toBe('room-1')
    expect(store.exerciseInRoom).toBe(true)
    expect(store.exerciseState?.you).toBe('u1')
    expect(socketState.socket?.joinExercise).not.toHaveBeenCalled()

    const input = { moveX: 1, moveY: 0, aim: 0.5, fire: true }
    expect(store.sendExerciseInput(input)).toBe(true)
    expect(socketState.socket?.sendExerciseInput).toHaveBeenCalledWith('room-1', input)
    store.stop()
  })

  it('自由对抗房间加入后等待准备，开局帧切换为进行中并在结束后清理', async () => {
    const store = await bootStore()
    api.createExerciseRoom.mockResolvedValue(room())

    await store.createExercise('FFA', 4)

    expect(api.createExerciseRoom).toHaveBeenCalledWith('FFA', 4)
    expect(socketState.socket?.joinExercise).toHaveBeenCalledWith('room-1')
    expect(store.exerciseRunning).toBe(false)

    fire('onExerciseRoom', {
      room: room({
        status: 'RUNNING',
        startedAt: 2,
        state: exerciseState(3),
      }),
    })

    expect(store.exerciseRoom?.status).toBe('RUNNING')
    expect(store.exerciseState?.seq).toBe(3)
    expect(store.exerciseRunning).toBe(true)

    fire('onExerciseFinished', exerciseFinishedEvent())
    expect(store.exerciseFinished?.roomId).toBe('room-1')
    expect(store.exerciseRoom?.status).toBe('FINISHED')
    expect(store.exerciseState?.finished).toBe(true)
    expect(store.exerciseState?.you).toBe('u1')
    await vi.waitFor(() => expect(api.fetchExerciseResults).toHaveBeenCalled())
    store.stop()
  })

  it('离开房间会通知调度通道并调用 REST 清理本地状态', async () => {
    const store = await bootStore()
    api.createExerciseRoom.mockResolvedValue(room())
    api.leaveExerciseRoom.mockResolvedValue({ left: true })
    await store.createExercise('FFA')

    await store.leaveExercise()

    expect(socketState.socket?.leaveExercise).toHaveBeenCalledWith('room-1')
    expect(api.leaveExerciseRoom).toHaveBeenCalledWith('room-1')
    expect(store.exerciseRoomId).toBeNull()
    expect(store.exerciseRoom).toBeNull()
    expect(store.exerciseState).toBeNull()
    store.stop()
  })
})

describe('巡检赛事小局', () => {
  it('赛事帧写入当前小局并忽略回退 seq，输入使用小局房间号', async () => {
    const store = await bootStore()
    store.currentMatchId = 'm1'
    store.currentMatch = match()

    fire('onExerciseState', exerciseStateEvent(5, 'r1'))

    expect(store.currentRound?.seq).toBe(5)
    expect(store.currentRound?.gameId).toBe('cluster-patrol-arena')
    expect(store.currentRound?.state?.seq).toBe(5)
    expect(store.currentRound?.lastMoveAt).toBe(5)

    fire('onExerciseState', exerciseStateEvent(4, 'r1'))
    expect(store.currentRound?.seq).toBe(5)

    const input = { moveX: 0, moveY: -1, aim: 1.2, fire: false, skill: 'scan' }
    expect(store.sendExerciseInput(input)).toBe(true)
    expect(socketState.socket?.sendExerciseInput).toHaveBeenCalledWith('r1', input)
    store.stop()
  })
})
