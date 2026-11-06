import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { fetchTournamentRoom } from '@/modules/drill/api/rooms'
import { useTournamentStore } from '@/stores/tournament'
import type { GameMatch, GameNotification } from '@/types/games'

import GameNotificationCenter from '../GameNotificationCenter.vue'

const fetchTournamentRoomMock = vi.mocked(fetchTournamentRoom)

vi.mock('@/modules/chat/chatApi', () => ({
  fetchOnline: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/modules/games/gameApi', () => ({
  fetchActiveMatches: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchDuel: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchDuels: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchGameNotifications: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchInvitations: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchMatch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchTournament: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  fetchTournaments: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/modules/drill/api/rooms', () => ({
  fetchTournamentRoom: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/modules/games/gameSocket', () => ({
  GameSocketClient: class {
    connect = vi.fn<() => Promise<void>>(() => Promise.resolve())
    close = vi.fn<() => void>()
  },
}))

function finalNotification(overrides: Partial<GameNotification> = {}): GameNotification {
  return {
    id: 'n1',
    type: 'FINAL_START',
    tournamentId: 't1',
    matchId: 'm1',
    title: 'The final begins',
    message: 'Alice vs Bob',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  }
}

function matchStub(overrides: Partial<GameMatch> = {}): GameMatch {
  return {
    id: 'm1',
    player1UserId: 'u1',
    player2UserId: 'u2',
    ...overrides,
  } as GameMatch
}

function click(selector: string) {
  const element = document.body.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`missing ${selector}`)
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('GameNotificationCenter', () => {
  let wrapper: VueWrapper | undefined
  let router: Router
  let pinia: Pinia

  beforeEach(async () => {
    fetchTournamentRoomMock.mockReset()
    pinia = createPinia()
    setActivePinia(pinia)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/games', component: { template: '<div />' } },
        { path: '/games/autochess', component: { template: '<div />' } },
        { path: '/games/autochess/run', component: { template: '<div />' } },
      ],
    })
    await router.push('/games/autochess/run')
    await router.isReady()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  async function mountWith(notification: GameNotification | null) {
    const store = useTournamentStore()
    store.finalNotification = notification
    wrapper = mount(GameNotificationCenter, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    return store
  }

  it('不渲染决赛弹窗当没有通知', async () => {
    await mountWith(null)
    expect(document.body.querySelector('.game-notify__final')).toBeNull()
  })

  it('点击「稍后」关闭弹窗', async () => {
    const store = await mountWith(finalNotification())
    expect(document.body.querySelector('#game-final-title')?.textContent).toContain(
      'The final begins',
    )

    click('.game-notify__ghost')

    expect(store.finalNotification).toBeNull()
  })

  it('按 Esc 关闭弹窗', async () => {
    const store = await mountWith(finalNotification())

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(store.finalNotification).toBeNull()
  })

  it('点击遮罩关闭，但点击面板内部不关闭', async () => {
    const store = await mountWith(finalNotification())

    click('.game-notify__final-panel')
    expect(store.finalNotification).not.toBeNull()

    click('.game-notify__final')
    expect(store.finalNotification).toBeNull()
  })

  it('已经在执行页看该对局时不再弹出全屏通知', async () => {
    await router.push('/games/autochess/run?match=m1')
    const store = await mountWith(finalNotification())

    expect(store.finalNotification).toBeNull()
    expect(document.body.querySelector('.game-notify__final')).toBeNull()
  })

  it('正在观战该对局时不再弹出全屏通知', async () => {
    await router.push('/games?watch=m1')
    const store = await mountWith(finalNotification())

    expect(store.finalNotification).toBeNull()
    expect(document.body.querySelector('.game-notify__final')).toBeNull()
  })

  it('本人是决赛选手时不弹全屏通知', async () => {
    const store = useTournamentStore()
    store.selfUserId = 'u1'
    store.activeMatches = [matchStub()]

    const same = await mountWith(finalNotification())

    expect(same.finalNotification).toBeNull()
    expect(document.body.querySelector('.game-notify__final')).toBeNull()
  })

  it('执行页看的是其它对局时照常弹出', async () => {
    await router.push('/games/autochess/run?match=other')
    const store = await mountWith(finalNotification())

    expect(store.finalNotification).not.toBeNull()
    expect(document.body.querySelector('.game-notify__final')).not.toBeNull()
  })

  it('点击「查看执行」跳转到观战窗口', async () => {
    const store = await mountWith(finalNotification())

    click('.game-notify__primary')
    await flushPromises()

    expect(store.finalNotification).toBeNull()
    expect(router.currentRoute.value.path).toBe('/games')
    expect(router.currentRoute.value.query.watch).toBe('m1')
  })

  it('良跑跑决赛通知点击「进入房间」按赛事查询排位赛房间', async () => {
    fetchTournamentRoomMock.mockResolvedValue({ id: 'room1' } as never)
    const store = await mountWith(finalNotification({ matchId: null }))

    expect(document.body.querySelector('.game-notify__primary')?.textContent).toContain(
      '进入房间',
    )
    click('.game-notify__primary')
    await flushPromises()

    expect(fetchTournamentRoomMock).toHaveBeenCalledWith('t1')
    expect(store.finalNotification).toBeNull()
    expect(router.currentRoute.value.path).toBe('/games/autochess')
    expect(router.currentRoute.value.query.room).toBe('room1')
  })

  it('已经在排位赛房间页时不再弹出良跑跑决赛通知', async () => {
    await router.push('/games/autochess?room=room1')
    const store = await mountWith(finalNotification({ matchId: null }))

    expect(store.finalNotification).toBeNull()
    expect(document.body.querySelector('.game-notify__final')).toBeNull()
  })
})
