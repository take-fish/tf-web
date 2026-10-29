import { ref } from 'vue'

import { fetchGameNotifications } from '@/modules/games/gameApi'
import type { GameNotification } from '@/types/games'

const NOTIFICATION_FRESH_MS = 120_000

export interface NotificationModuleDeps {
  hasToken: () => boolean
}

/** 全站赛程通知：增量拉取、去重与决赛/冠军弹窗。 */
export function createNotificationModule(deps: NotificationModuleDeps) {
  const notifications = ref<GameNotification[]>([])
  const finalNotification = ref<GameNotification | null>(null)
  const championNotification = ref<GameNotification | null>(null)
  const notificationCursor = ref(0)
  const seenNotifications = new Set<string>()

  function consumeNotification(notification: GameNotification) {
    if (!notification || seenNotifications.has(notification.id)) return
    seenNotifications.add(notification.id)
    notificationCursor.value = Math.max(
      notificationCursor.value,
      notification.createdAt,
    )
    if (notification.expiresAt && notification.expiresAt < Date.now()) return
    notifications.value.unshift(notification)
    if (notifications.value.length > 50) notifications.value.length = 50
    const fresh = Date.now() - notification.createdAt <= NOTIFICATION_FRESH_MS
    if (!fresh) return
    if (notification.type === 'FINAL_START') finalNotification.value = notification
    if (notification.type === 'CHAMPION') championNotification.value = notification
  }

  async function loadRecentNotifications() {
    try {
      const entries = await fetchGameNotifications(0, 20)
      for (const notification of [...entries].sort(
        (left, right) => left.createdAt - right.createdAt,
      )) {
        consumeNotification(notification)
      }
      const newest = entries.reduce(
        (latest, entry) => Math.max(latest, entry.createdAt),
        notificationCursor.value,
      )
      notificationCursor.value = newest
    } catch {
      // 通知为增强能力，失败不影响大厅
    }
  }

  async function pollNotifications() {
    if (!deps.hasToken()) return
    try {
      const entries = await fetchGameNotifications(notificationCursor.value, 20)
      for (const notification of [...entries].sort(
        (left, right) => left.createdAt - right.createdAt,
      )) {
        consumeNotification(notification)
      }
      const newest = entries.reduce(
        (latest, entry) => Math.max(latest, entry.createdAt),
        notificationCursor.value,
      )
      notificationCursor.value = newest
    } catch {
      // 轮询失败等下一轮
    }
  }

  function dismissFinal() {
    finalNotification.value = null
  }

  function dismissChampion() {
    championNotification.value = null
  }

  return {
    notifications,
    finalNotification,
    championNotification,
    notificationCursor,
    consumeNotification,
    loadRecentNotifications,
    pollNotifications,
    dismissFinal,
    dismissChampion,
  }
}
