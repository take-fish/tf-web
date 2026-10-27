import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/modules/auth/types'
import type { GameMatch } from '@/modules/games/types'

import TournamentLobby from '../TournamentLobby.vue'

const { api, MockGameSocketClient } = vi.hoisted(() => {
  const mock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>()
  class SocketStub {
    connect = vi.fn<() => Promise<void>>(() => Promise.resolve())
    close = vi.fn<() => void>()
  }
  return {
    api: {
      fetchActiveMatches: mock(),
      fetchDuels: mock(),
      fetchGameNotifications: mock(),
      fetchInvitations: mock(),
      fetchOnline: mock(),
      fetchTournament: mock(),
      fetchTournaments: mock(),
    },
    MockGameSocketClient: SocketStub,
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

function activeMatch(overrides: Partial<GameMatch> = {}): GameMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    gameId: 'heatmap-gomoku',
    kind: 'TOURNAMENT',
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

function mountLobby() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/games', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  return { router }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  api.fetchTournaments.mockResolvedValue([])
  api.fetchInvitations.mockResolvedValue([])
  api.fetchDuels.mockResolvedValue([])
  api.fetchActiveMatches.mockResolvedValue([])
  api.fetchOnline.mockResolvedValue([])
})

describe('演练调度台', () => {
  it('查看执行只打开对局窗口，不关闭调度台', async () => {
    writeAuth({ token: 'lobby-token', user: USER })
    api.fetchActiveMatches.mockResolvedValue([activeMatch()])
    const { router } = mountLobby()
    await router.push('/games')
    await router.isReady()

    const wrapper = mount(TournamentLobby, {
      global: { plugins: [router], stubs: { UserAvatar: true } },
    })
    await flushPromises()

    const entry = wrapper.find('.lobby__active-match')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    await flushPromises()

    // 调度台必须保持挂载，对局关闭后由上层（GameView）自然回到这里。
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/games')
    expect(router.currentRoute.value.query.watch).toBe('m1')

    wrapper.unmount()
  })
})
