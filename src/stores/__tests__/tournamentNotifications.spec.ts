import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameNotification } from '@/types/games'

const api = vi.hoisted(() => ({
  fetchGameNotifications:
    vi.fn<(after: number, limit: number) => Promise<GameNotification[]>>(),
}))
vi.mock('@/modules/games/gameApi', () => api)

import { createNotificationModule } from '@/stores/tournament/notifications'

function notification(overrides: Partial<GameNotification> = {}): GameNotification {
  const now = Date.now()
  return {
    id: 'n1',
    type: 'FINAL_START',
    tournamentId: 't1',
    matchId: 'm1',
    title: 'The final begins',
    message: 'Alice vs Bob',
    createdAt: now,
    expiresAt: now + 600_000,
    ...overrides,
  }
}

describe('tournament notifications', () => {
  beforeEach(() => {
    api.fetchGameNotifications.mockReset()
  })

  it('实时通知触发决赛弹窗', () => {
    const module = createNotificationModule({ hasToken: () => true })

    module.consumeNotification(notification())

    expect(module.finalNotification.value?.id).toBe('n1')
  })

  it('silent 消费只进列表，不触发弹窗', () => {
    const module = createNotificationModule({ hasToken: () => true })

    module.consumeNotification(notification(), { silent: true })

    expect(module.notifications.value).toHaveLength(1)
    expect(module.finalNotification.value).toBeNull()
  })

  it('启动补拉历史通知不弹窗', async () => {
    api.fetchGameNotifications.mockResolvedValue([notification()])
    const module = createNotificationModule({ hasToken: () => true })

    await module.loadRecentNotifications()

    expect(module.notifications.value).toHaveLength(1)
    expect(module.finalNotification.value).toBeNull()
    expect(module.notificationCursor.value).toBeGreaterThan(0)
  })

  it('轮询到的新通知仍然弹窗', async () => {
    api.fetchGameNotifications.mockResolvedValue([notification({ id: 'n2' })])
    const module = createNotificationModule({ hasToken: () => true })

    await module.pollNotifications()

    expect(module.finalNotification.value?.id).toBe('n2')
  })

  it('冠军通知同样受 silent 约束', async () => {
    api.fetchGameNotifications.mockResolvedValue([notification({ type: 'CHAMPION' })])
    const module = createNotificationModule({ hasToken: () => true })

    await module.loadRecentNotifications()

    expect(module.championNotification.value).toBeNull()
  })
})
