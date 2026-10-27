import type { ReadingProgress } from '../types'

export const PROGRESS_STORAGE_PREFIX = 'fm.reader.progress.v1.'

/**
 * 本地阅读进度。只在两种情况下被采用：服务端还没收到最新位置（关页面时请求没发出去），
 * 或断网。服务端记录始终是权威来源，这里只是"最后一道兜底 + 更快恢复"。
 */
export interface LocalProgress {
  chapterIndex: number
  scrollRatio: number
  /** 写入时的本机时间（ISO 串），与服务端 updatedAt 比较时使用。 */
  updatedAt: string
}

export type ResumableProgress = Pick<LocalProgress, 'chapterIndex' | 'scrollRatio'>

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function key(bookId: number): string {
  return `${PROGRESS_STORAGE_PREFIX}${bookId}`
}

function isLocalProgress(value: unknown): value is LocalProgress {
  if (!value || typeof value !== 'object') return false
  const progress = value as Partial<LocalProgress>
  return (
    typeof progress.chapterIndex === 'number' &&
    Number.isInteger(progress.chapterIndex) &&
    progress.chapterIndex >= 0 &&
    typeof progress.scrollRatio === 'number' &&
    typeof progress.updatedAt === 'string'
  )
}

export function readLocalProgress(bookId: number): LocalProgress | null {
  const raw = storage()?.getItem(key(bookId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isLocalProgress(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeLocalProgress(
  bookId: number,
  chapterIndex: number,
  scrollRatio: number,
): void {
  const entry: LocalProgress = {
    chapterIndex,
    scrollRatio: Math.min(1, Math.max(0, scrollRatio)),
    updatedAt: new Date().toISOString(),
  }
  try {
    storage()?.setItem(key(bookId), JSON.stringify(entry))
  } catch {
    // 隐私模式 / 配额耗尽时 localStorage 不可写。忽略即可，服务端仍会保存进度。
  }
}

export function clearLocalProgress(bookId: number): void {
  try {
    storage()?.removeItem(key(bookId))
  } catch {
    // ignore
  }
}

/**
 * 本地与服务端进度取较新的一份。
 *
 * 两个时间来自不同机器，可能存在时钟偏差：偏差导致选错时，最坏结果是回到稍旧的位置，
 * 不会丢数据，因此这里不做额外校正，按原始时间戳比较即可。
 */
export function newerProgress(
  local: LocalProgress | null,
  remote: ReadingProgress | null,
): ResumableProgress | null {
  if (!local) return remote
  if (!remote) return local
  const localAt = Date.parse(local.updatedAt)
  const remoteAt = Date.parse(remote.updatedAt)
  if (Number.isNaN(remoteAt)) return local
  if (Number.isNaN(localAt)) return remote
  return localAt > remoteAt ? local : remote
}
