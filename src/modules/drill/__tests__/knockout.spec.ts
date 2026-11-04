import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGame } from '../core/engine'
import type { KnockoutMatch, KnockoutView } from '../api/knockout'
import { useDrillKnockoutStore } from '../stores/knockout'

function match(patch: Partial<KnockoutMatch> = {}): KnockoutMatch {
  return {
    id: 'm1',
    round: 0,
    slot: 0,
    bestOf: 3,
    game: 1,
    seed: 42,
    prepEndsAt: Date.now() + 35_000,
    playerA: { userId: 'u1', nickname: '我' },
    playerB: { userId: 'u2', nickname: '对手' },
    winsA: 0,
    winsB: 0,
    reportedA: false,
    reportedB: false,
    winner: null,
    phase: 'PREP',
    ...patch,
  }
}

function bracket(patch: Partial<KnockoutView> = {}): KnockoutView {
  return {
    id: 'b1',
    roomId: 'room001',
    status: 'RUNNING',
    champion: null,
    serverTime: Date.now(),
    rounds: [[match()], [], []],
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
  const fn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input, init) => handler(String(input), init),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('淘汰赛 store 与一轮对局', () => {
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
  })

  afterEach(() => {
    useDrillKnockoutStore().leave()
    vi.unstubAllGlobals()
  })

  it('还没开赛时返回空看板，不报错', async () => {
    mockFetch(() => respond({ error: 'NOT_FOUND', message: '淘汰赛尚未开始' }, 404))

    const knockout = useDrillKnockoutStore()
    const ok = await knockout.load('room001')

    expect(ok).toBe(false)
    expect(knockout.active).toBe(false)
    expect(knockout.error).toBeNull()
  })

  it('开赛后定位自己的场次并上报一局', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.endsWith('/knockout')) return respond(bracket())
      if (url.endsWith('/report')) {
        return respond(
          bracket({
            rounds: [[match({ winsA: 1, game: 2, reportedA: false, reportedB: false })], [], []],
          }),
        )
      }
      return respond(bracket())
    })

    const knockout = useDrillKnockoutStore()
    await knockout.start('room001')

    expect(knockout.active).toBe(true)
    expect(knockout.selfMatch?.id).toBe('m1')

    const current = knockout.selfMatch
    expect(current).toBeTruthy()
    await knockout.report(current!, {
      game: 1,
      wins: 8,
      losses: 2,
      draws: 0,
      sli: 100,
      survivors: 6,
    })

    expect(knockout.selfMatch?.winsA).toBe(1)
    expect(knockout.selfMatch?.game).toBe(2)
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/report'))
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      game: 1,
      wins: 8,
      losses: 2,
      sli: 100,
      survivors: 6,
    })
  })

  it('输掉后没有自己的场次时标记已淘汰', async () => {
    mockFetch(() =>
      respond(
        bracket({
          rounds: [[match({ winner: 'u2' })], [], []],
        }),
      ),
    )

    const knockout = useDrillKnockoutStore()
    await knockout.load('room001')

    expect(knockout.selfMatch).toBeNull()
    expect(knockout.hasLost).toBe(true)
  })

  it('一局只打一轮', () => {
    const state = createGame(7, { tournament: true, rounds: 1 })
    expect(state.totalRounds).toBe(1)
    expect(state.tournament).toBe(true)
  })

  it('淘汰赛下一局带入等级/经验/配额/阵容/装备/强化，商店重刷', () => {
    const previous = createGame(1, { tournament: true, rounds: 1 })
    previous.level = 7
    previous.xp = 12
    previous.quotas = 33
    previous.picks = ['G3']
    previous.annotations = previous.annotations.map((item, index) =>
      index === 0 ? { ...item, kind: 'tx' } : item,
    )
    previous.units = [
      { uid: 'u1', defId: 'api', star: 2, zone: 'board', slot: 0, annotations: ['cache'] },
    ]

    const next = createGame(2, { tournament: true, rounds: 1, carry: previous })

    expect(next.level).toBe(7)
    expect(next.xp).toBe(12)
    expect(next.quotas).toBe(33)
    expect(next.picks).toEqual(['G3'])
    expect(next.annotations[0]?.kind).toBe('tx')
    expect(next.units).toEqual(previous.units)
    expect(next.units).not.toBe(previous.units)
    expect(next.round).toBe(1)
    expect(next.totalRounds).toBe(1)
    // 商店与战绩每局重刷
    expect(next.shop.length).toBeGreaterThan(0)
    expect(next.record).toEqual({ wins: 0, losses: 0, draws: 0 })
  })

  it('连续多局：准备阶段的提升进入下一局，可以没有提升', () => {
    const first = createGame(11, { tournament: true, rounds: 1 })
    first.level = 5
    first.xp = 6
    first.quotas = 21

    const second = createGame(12, { tournament: true, rounds: 1, carry: first })
    // 准备阶段升一级、花配额，阵容再加一个单位
    second.level = 6
    second.quotas -= 6
    second.units = [
      ...second.units,
      { uid: 'prep-1', defId: 'api', star: 1, zone: 'bench', slot: 0, annotations: [] },
    ]

    const third = createGame(13, { tournament: true, rounds: 1, carry: second })
    expect(third.level).toBe(6)
    expect(third.quotas).toBe(second.quotas)
    expect(third.units.some((unit) => unit.uid === 'prep-1')).toBe(true)
    expect(third.round).toBe(1)
    expect(third.rewardOnEnd).toBe(true)
    expect(createGame(14, { tournament: true, rounds: 1, rewardOnEnd: false }).rewardOnEnd).toBe(
      false,
    )
  })
})

