import { ref } from 'vue'

import { fetchGameNotifications } from '@/modules/games/gameApi'
import type { GameNotification } from '@/types/games'

const NOTIFICATION_FRESH_MS = 120_000

export interface NotificationModuleDeps {
  hasToken: () => boolean
}

export interface ConsumeNotificationOptions {
  /**
   * 启动补拉的历史通知只记入列表，不触发全屏弹窗。
   * 否则任何人刷新页面/重新进入应用，只要 2 分钟内有过决赛通知，
   * 一进来就会被全屏“决赛开始”拦住。
   */
  silent?: boolean
}

/** 全站赛程通知：增量拉取、去重与决赛/冠军弹窗。 */
export function createNotificationModule(deps: NotificationModuleDeps) {
  const notifications = ref<GameNotification[]>([])
  const finalNotification = ref<GameNotification | null>(null)
  const championNotification = ref<GameNotification | null>(null)
  const notificationCursor = ref(0)
  const seenNotifications = new Set<string>()

  function consumeNotification(
    notification: GameNotification,
    options: ConsumeNotificationOptions = {},
  ) {
    if (!notification || seenNotifications.has(notification.id)) return
    seenNotifications.add(notification.id)
    notificationCursor.value = Math.max(
      notificationCursor.value,
      notification.createdAt,
    )
    if (notification.expiresAt && notification.expiresAt < Date.now()) return
    notifications.value.unshift(notification)
    if (notifications.value.length > 50) notifications.value.length = 50
    if (options.silent) return
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
        // 历史补拉只入库；只有实时推送/轮询到的新通知才允许弹窗。
        consumeNotification(notification, { silent: true })
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
