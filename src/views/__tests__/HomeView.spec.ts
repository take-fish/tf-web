import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { writeAuth } from '@/lib/authToken'
import type { ChatGroup, OnlineMember, SmokeState } from '@/modules/chat/types'
import type { AuthUser } from '@/modules/auth/types'

import HomeView from '../HomeView.vue'

const mocks = vi.hoisted(() => {
  interface Handlers {
    onSmokeState?: (state: SmokeState) => void
  }
  const handlersRef: { current: Handlers | null } = { current: null }
  const connect = vi.fn(async () => {})
  const close = vi.fn()
  const inviteSmoke = vi.fn(() => true)
  const acceptSmoke = vi.fn(() => true)
  const declineSmoke = vi.fn(() => true)
  const leaveSmoke = vi.fn(() => true)
  const endSmoke = vi.fn(() => true)
  const fetchGroups = vi.fn<() => Promise<ChatGroup[]>>()
  const fetchOnline = vi.fn<() => Promise<OnlineMember[]>>()
  const fetchUserStats = vi.fn<() => Promise<{ active: number; total: number }>>()

  class ChatSocketClient {
    constructor(handlers: Handlers) {
      handlersRef.current = handlers
    }

    connect = connect
    close = close
    inviteSmoke = inviteSmoke
    acceptSmoke = acceptSmoke
    declineSmoke = declineSmoke
    leaveSmoke = leaveSmoke
    endSmoke = endSmoke
  }

  return {
    handlersRef,
    connect,
    close,
    inviteSmoke,
    acceptSmoke,
    declineSmoke,
    leaveSmoke,
    endSmoke,
    fetchGroups,
    fetchOnline,
    fetchUserStats,
    ChatSocketClient,
  }
})

vi.mock('@/modules/chat/chatSocket', () => ({ ChatSocketClient: mocks.ChatSocketClient }))
vi.mock('@/modules/chat/chatApi', () => ({
  fetchGroups: mocks.fetchGroups,
  fetchOnline: mocks.fetchOnline,
}))
vi.mock('@/modules/home/homeApi', () => ({ fetchUserStats: mocks.fetchUserStats }))

const USER: AuthUser = {
  id: 7,
  username: '摸鱼小明',
  nickname: '小明',
  role: 'USER',
  status: 'ACTIVE',
}

const ONLINE: OnlineMember[] = [
  { groupId: null, userId: 'u7', nickname: '小明', node: 'dev-node-01', joinedAt: 1 },
  { groupId: null, userId: 'u2', nickname: '乙', node: 'dev-node-02', joinedAt: 2 },
]

const GROUPS: ChatGroup[] = [
  { id: 'dev-group', name: '研发协作', description: '', onlineCount: 2, unread: 0 },
  { id: 'lounge', name: '闲聊', description: '', onlineCount: 1, unread: 0 },
]

function smokeState(overrides: Partial<SmokeState> = {}): SmokeState {
  return {
    count: 0,
    smoking: [],
    online: ONLINE,
    invites: [],
    mySession: null,
    ...overrides,
  }
}

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
}

async function mountHome() {
  const wrapper = mount(HomeView, {
    global: {
      plugins: [createPinia(), router()],
      stubs: { RouterLink: true, AppIcon: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('HomeView 工作台', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    writeAuth({ token: 'token-1', user: USER })
    setActivePinia(createPinia())
    mocks.fetchGroups.mockResolvedValue(GROUPS)
    mocks.fetchOnline.mockResolvedValue(ONLINE)
    mocks.fetchUserStats.mockResolvedValue({ active: 10, total: 14 })
  })

  it('展示在线人数/总人数、群聊与在线数', async () => {
    const wrapper = await mountHome()

    const text = wrapper.text()
    expect(text).toContain('2 / 10')
    expect(text).toContain('2 个群聊 · 3 人在线')
    expect(text).toContain('研发协作 2 人')
    expect(text).toContain('闲聊 1 人')
    expect(text).toContain('冒烟测试数：0')
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('点击在线卡片弹出在线用户清单', async () => {
    const wrapper = await mountHome()

    await wrapper.findAll('.metric-item--action')[0]?.trigger('click')

    const overlay = wrapper.find('.overlay')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('在线用户')
    expect(overlay.text()).toContain('小明')
    expect(overlay.text()).toContain('ID u2')
    wrapper.unmount()
  })

  it('收到邀请显示小红点，进入冒烟弹窗后消失并可邀请他人', async () => {
    const wrapper = await mountHome()
    mocks.handlersRef.current?.onSmokeState?.(
      smokeState({
        invites: [{ sessionId: 's-1', fromUserId: 'u9', fromNickname: '丙', invitedAt: 1 }],
      }),
    )
    await flushPromises()

    expect(wrapper.find('.metric-item__dot').exists()).toBe(true)

    await wrapper.findAll('.metric-item--action')[1]?.trigger('click')
    expect(wrapper.find('.metric-item__dot').exists()).toBe(false)
    expect(wrapper.text()).toContain('丙')
    expect(wrapper.text()).toContain('接受')

    const inviteButton = wrapper
      .findAll('button.home-user--action')
      .find((button) => button.text().includes('乙'))
    await inviteButton?.trigger('click')
    expect(mocks.inviteSmoke).toHaveBeenCalledWith('u2')
    wrapper.unmount()
  })

  it('冒烟状态展示正在冒烟人数与参与者', async () => {
    const wrapper = await mountHome()
    mocks.handlersRef.current?.onSmokeState?.(
      smokeState({
        count: 2,
        smoking: [
          { sessionId: 's-1', userId: 'u7', nickname: '小明', initiator: true },
          { sessionId: 's-1', userId: 'u2', nickname: '乙', initiator: false },
        ],
        mySession: {
          id: 's-1',
          status: 'ACTIVE',
          initiatorUserId: 'u7',
          initiatorNickname: '小明',
          participants: [
            { userId: 'u7', nickname: '小明', joinedAt: 1 },
            { userId: 'u2', nickname: '乙', joinedAt: 2 },
          ],
          pendingInvites: [],
        },
      }),
    )
    await flushPromises()

    expect(wrapper.text()).toContain('冒烟测试数：2')
    expect(wrapper.text()).toContain('2 人正在冒烟')

    await wrapper.findAll('.metric-item--action')[1]?.trigger('click')
    expect(wrapper.text()).toContain('我的冒烟测试')
    expect(wrapper.text()).toContain('结束冒烟测试')

    const endButton = wrapper.findAll('button').find((button) => button.text() === '结束冒烟测试')
    await endButton?.trigger('click')
    expect(mocks.endSmoke).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
