import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/types/auth'
import type { GameTournament } from '@/types/games'
import { useTournamentStore } from '@/stores/tournament'

import TournamentLobby from '../TournamentLobby.vue'

const { api, MockGameSocketClient } = vi.hoisted(() => {
  const mock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>()
  class SocketStub {
    connect = vi.fn<() => Promise<void>>(() => Promise.resolve())
    close = vi.fn<() => void>()
  }
  return {
    api: {
      createTournament: mock(),
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

function createdTournament(): GameTournament {
  return {
    id: 't-new',
    name: 'S赛演练',
    gameId: 'random',
    kind: 'TOURNAMENT',
    format: 'BO1',
    bracketType: 'TBD',
    status: 'INVITING',
    creatorUserId: 'u1',
    creatorNickname: 'Alice',
    targetPlayers: 2,
    inviteDeadline: Date.now() + 60_000,
    currentRound: 0,
    totalRounds: 0,
    championUserId: null,
    championNickname: null,
    runnerUpUserId: null,
    runnerUpNickname: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    players: [],
    matches: [],
  }
}

interface CreatePayload {
  gameId?: string
  gamePool?: string[]
  blindLayout?: string
}

function payloadOf(index = 0): CreatePayload {
  return (api.createTournament.mock.calls[index]?.[0] ?? {}) as CreatePayload
}

function mountLobby() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/games', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  return mount(TournamentLobby, {
    global: { plugins: [router], stubs: { UserAvatar: true } },
  })
}

async function selectMemberAndCreate(wrapper: ReturnType<typeof mountLobby>) {
  await flushPromises()
  const member = wrapper.find('.lobby__member:not(.is-self)')
  expect(member.exists()).toBe(true)
  await member.trigger('click')
  await wrapper.find('.lobby__button--lg').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  writeAuth({ token: 'lobby-token', user: USER })
  api.fetchTournaments.mockResolvedValue([])
  api.fetchInvitations.mockResolvedValue([])
  api.fetchDuels.mockResolvedValue([])
  api.fetchActiveMatches.mockResolvedValue([])
  api.fetchOnline.mockResolvedValue([{ userId: 'u2', nickname: 'Bob' }])
  api.createTournament.mockResolvedValue(createdTournament())
})

describe('调度台赛事类型', () => {
  it('默认创建 S赛，提交全部启用剧本与盲棋摆法', async () => {
    const wrapper = mountLobby()
    await selectMemberAndCreate(wrapper)

    expect(api.createTournament).toHaveBeenCalledTimes(1)
    expect(payloadOf()).toMatchObject({
      gameId: 'random',
      gamePool: [
        'heatmap-gomoku',
        'log-hotspot-arena',
        'topology-arena',
        'cluster-patrol-arena',
        'blind-xiangqi',
      ],
      blindLayout: 'STANDARD_SHUFFLE',
    })

    wrapper.unmount()
  })

  it('取消勾选盲棋后，S赛池不含盲棋且不提交摆法', async () => {
    const wrapper = mountLobby()
    await flushPromises()

    const blind = wrapper
      .findAll('.lobby__pool-item')
      .find((item) => item.text().includes('盲棋'))
    expect(blind).toBeDefined()
    await blind!.trigger('click')

    await selectMemberAndCreate(wrapper)

    const payload = payloadOf()
    expect(payload.gameId).toBe('random')
    expect(payload.gamePool).not.toContain('blind-xiangqi')
    expect(payload.blindLayout).toBeUndefined()

    wrapper.unmount()
  })

  it('从游戏卡片进入时预选锦标赛剧本', async () => {
    const store = useTournamentStore()
    store.openLobby('topology-arena')
    const wrapper = mountLobby()
    await flushPromises()

    const modeButtons = wrapper.findAll('.lobby__games')[0]!.findAll('.lobby__format')
    expect(modeButtons[1]!.text()).toContain('锦标赛')
    expect(modeButtons[1]!.classes()).toContain('is-active')

    const gameButtons = wrapper.findAll('.lobby__games')[1]!.findAll('.lobby__format')
    const topology = gameButtons.find((button) => button.text().includes('拓扑攻防'))
    expect(topology?.classes()).toContain('is-active')

    await selectMemberAndCreate(wrapper)

    const payload = payloadOf()
    expect(payload.gameId).toBe('topology-arena')
    expect(payload.gamePool).toBeUndefined()
    expect(payload.blindLayout).toBeUndefined()

    wrapper.unmount()
  })
})
