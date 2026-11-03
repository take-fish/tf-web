/** 轻量全局提示：任何地方都能 push，ToastHost 负责渲染。 */
import { reactive } from 'vue'

import { errorReference, formatApiError } from './http'

export type ToastKind = 'error' | 'success' | 'info'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  code: string
}

export const toasts = reactive<ToastItem[]>([])

let seq = 0
const lastShownAt = new Map<string, number>()
const DEDUPE_MS = 4000
const MAX_VISIBLE = 4

export function dismissToast(id: number): void {
  const index = toasts.findIndex((item) => item.id === id)
  if (index >= 0) toasts.splice(index, 1)
}

/** 同类文案 4 秒内只弹一次，避免并发请求同时失败时刷屏。 */
export function pushToast(message: string, kind: ToastKind = 'error', code = ''): void {
  if (!message) return
  const now = Date.now()
  if (now - (lastShownAt.get(message) ?? 0) < DEDUPE_MS) return
  lastShownAt.set(message, now)

  const item: ToastItem = { id: ++seq, message, kind, code }
  toasts.push(item)
  if (toasts.length > MAX_VISIBLE) toasts.splice(0, toasts.length - MAX_VISIBLE)
  setTimeout(() => dismissToast(item.id), kind === 'error' ? 8000 : 4000)
}

export function toastError(error: unknown, fallback = '操作失败'): void {
  pushToast(formatApiError(error, fallback), 'error', errorReference(error))
}
