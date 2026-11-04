import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DrillRoomPlayer, DrillRoomView } from '../api/rooms'
import { useDrillRoomStore } from '../stores/room'

function player(patch: Partial<DrillRoomPlayer> = {}): DrillRoomPlayer {
  return {
    userId: 'u1',
    nickname: '我',
    seat: 0,
    ready: false,
    wins: 0,
    losses: 0,
    draws: 0,
    score: 0,
    reportedRound: 0,
    hp: 100,
    alive: true,
    placement: null,
    reward: null,
    ...patch,
  }
}

function view(patch: Partial<DrillRoomView> = {}): DrillRoomView {
  return {
    id: 'room001',
    source: 'web',
    mode: 'TOURNAMENT',
    status: 'WAITING',
    phase: 'PREP',
    seed: 42,
    round: 1,
    totalRounds: 15,
    serverTime: 1_700_000_000_000,
    prepEndsAt: 0,
    maxPlayers: 8,
    intermissionSeconds: 25,
    preludeSeconds: 35,
    players: [player()],
    carouselWins: {},
    placement: [],
    placements: {},
    skipVotes: [],
    skipGranted: false,
    chats: [],
    rewards: {},
    ...patch,
  }
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('联机演练房间 store', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(
      'fm.auth.v1',
      JSON.stringify({
        token: 'token',
        user: { id: 1, username: 'u1', nickname: '我', role: 'USER', status: 'ACTIVE' },
      }),
    )
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    useDrillRoomStore().leave()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('创建房间后进入候场，准备状态可读', async () => {
    mockFetch(() => respond(view()))

    const room = useDrillRoomStore()
    const created = await room.create('TOURNAMENT')

    expect(created?.id).toBe('room001')
    expect(room.active).toBe(true)
    expect(room.roomId).toBe('room001')
    expect(room.isTournament).toBe(true)
    expect(room.canReady).toBe(true)
    expect(room.prepRemaining).toBeNull()
  })

  it('备战倒计时按服务端时间算，本地时钟偏移不影响', async () => {
    const serverTime = 1_700_000_000_000
    mockFetch(() =>
      respond(
        view({
          status: 'RUNNING',
          phase: 'PREP',
          serverTime,
          prepEndsAt: serverTime + 20_000,
        }),
      ),
    )

    const room = useDrillRoomStore()
    await room.create('TOURNAMENT')
    expect(room.prepRemaining).toBe(20)

    vi.setSystemTime(Date.now() + 5000)
    room.tick()
    expect(room.prepRemaining).toBe(15)
  })

  it('直接开始投票后能读到自己的票与票数', async () => {
    mockFetch((url) => {
      if (url.endsWith('/skip')) {
        return respond(
          view({ status: 'RUNNING', phase: 'PREP', skipVotes: ['u1'], skipGranted: false }),
        )
      }
      return respond(view({ status: 'RUNNING', phase: 'PREP' }))
    })

    const room = useDrillRoomStore()
    await room.create('TOURNAMENT')
    await room.skip()

    expect(room.selfSkipped).toBe(true)
    expect(room.skipCount).toBe(1)
  })

  it('上报战绩把轮次与结果发给服务端', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.endsWith('/report')) {
        return respond(
          view({
            status: 'RUNNING',
            phase: 'PREP',
            players: [player({ reportedRound: 1 }), player({ userId: 'u2', seat: 1 })],
          }),
        )
      }
      return respond(view({ status: 'RUNNING', phase: 'BATTLE' }))
    })

    const room = useDrillRoomStore()
    await room.create('TOURNAMENT')
    room.setLocalRound(1)
    await room.report({ round: 1, hp: 100, result: 'WIN' })

    expect(room.selfReported).toBe(true)
    const reportCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/report'))
    expect(reportCall).toBeTruthy()
    expect(JSON.parse(String(reportCall?.[1]?.body))).toMatchObject({
      round: 1,
      result: 'WIN',
    })
  })

  it('创建失败时保留错误文案，不进入房间', async () => {
    mockFetch(() => respond({ error: 'BAD', message: '创建失败' }, 400))

    const room = useDrillRoomStore()
    const created = await room.create('CASUAL')

    expect(created).toBeNull()
    expect(room.active).toBe(false)
    expect(room.error).toBe('创建失败')
  })
})
