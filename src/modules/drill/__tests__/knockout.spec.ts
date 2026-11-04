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
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('淘汰赛 store 与 10 轮对局', () => {
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

  it('10 轮对局只打 10 轮', () => {
    const state = createGame(7, { tournament: true, rounds: 10 })
    expect(state.totalRounds).toBe(10)
    expect(state.tournament).toBe(true)
  })
})
