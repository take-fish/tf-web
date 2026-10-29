import { afterEach, describe, expect, it } from 'vitest'

import type { ReadingProgress } from '@/types/reader'
import {
  PROGRESS_STORAGE_PREFIX,
  clearLocalProgress,
  newerProgress,
  readLocalProgress,
  writeLocalProgress,
} from '../lib/progressCache'

function remote(chapterIndex: number, scrollRatio: number, updatedAt: string): ReadingProgress {
  return { chapterIndex, scrollRatio, updatedAt }
}

describe('progressCache', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('写入后能读回，并夹紧越界的滚动比例', () => {
    writeLocalProgress(7, 3, 1.8)
    const local = readLocalProgress(7)
    expect(local).not.toBeNull()
    expect(local?.chapterIndex).toBe(3)
    expect(local?.scrollRatio).toBe(1)

    writeLocalProgress(7, 3, -0.5)
    expect(readLocalProgress(7)?.scrollRatio).toBe(0)
  })

  it('不同书互不干扰，清除只影响指定书', () => {
    writeLocalProgress(1, 10, 0.5)
    writeLocalProgress(2, 20, 0.6)
    clearLocalProgress(1)
    expect(readLocalProgress(1)).toBeNull()
    expect(readLocalProgress(2)?.chapterIndex).toBe(20)
  })

  it('存储内容损坏时按没有本地进度处理，不抛异常', () => {
    window.localStorage.setItem(`${PROGRESS_STORAGE_PREFIX}9`, '{not json')
    expect(readLocalProgress(9)).toBeNull()

    window.localStorage.setItem(
      `${PROGRESS_STORAGE_PREFIX}9`,
      JSON.stringify({ chapterIndex: 'x', scrollRatio: 0, updatedAt: '' }),
    )
    expect(readLocalProgress(9)).toBeNull()
  })

  it('本地比服务端新时采用本地（关页面后请求没送达的场景）', () => {
    writeLocalProgress(5, 8, 0.75)
    const local = readLocalProgress(5)
    const result = newerProgress(local, remote(4, 0.1, '2020-01-01T00:00:00.000Z'))
    expect(result?.chapterIndex).toBe(8)
    expect(result?.scrollRatio).toBe(0.75)
  })

  it('服务端比本地新时采用服务端（换了设备继续读的场景）', () => {
    writeLocalProgress(5, 8, 0.75)
    const local = readLocalProgress(5)
    const ahead = new Date(Date.now() + 60_000).toISOString()
    const result = newerProgress(local, remote(4, 0.1, ahead))
    expect(result?.chapterIndex).toBe(4)
    expect(result?.scrollRatio).toBe(0.1)
  })

  it('只有一侧有数据时用有数据的那侧', () => {
    expect(newerProgress(null, remote(2, 0.3, '2026-01-01T00:00:00.000Z'))?.chapterIndex).toBe(2)
    writeLocalProgress(5, 6, 0.2)
    expect(newerProgress(readLocalProgress(5), null)?.chapterIndex).toBe(6)
    expect(newerProgress(null, null)).toBeNull()
  })

  it('服务端时间无法解析时退回本地', () => {
    writeLocalProgress(5, 6, 0.2)
    const result = newerProgress(readLocalProgress(5), remote(1, 0, 'not-a-date'))
    expect(result?.chapterIndex).toBe(6)
  })
})
