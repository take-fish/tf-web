import { describe, expect, it } from 'vitest'

import { buildLogLines } from '../buildLog'

const base = {
  positionSec: 0,
  durationSec: 120,
  trackTitle: '静夜思（Demo）',
  lyrics: ['床前明月光', '疑是地上霜'],
  status: 'building' as const,
}

describe('buildLogLines', () => {
  it('构建开始时输出启动行', () => {
    const lines = buildLogLines({ ...base, progress: 0 })
    expect(lines[0]?.text).toContain('Started by user')
    expect(lines.some((line) => line.text.includes('BUILD SUCCESS'))).toBe(false)
  })

  it('进度推进后逐步输出日志与歌词', () => {
    const early = buildLogLines({ ...base, progress: 0.2 })
    const later = buildLogLines({ ...base, progress: 0.8 })

    expect(later.length).toBeGreaterThan(early.length)
    expect(later.some((line) => line.text.includes('[lyric]'))).toBe(true)
    expect(later.some((line) => line.text.includes('Running unit tests'))).toBe(true)
  })

  it('构建完成输出 BUILD SUCCESS', () => {
    const lines = buildLogLines({ ...base, progress: 1, positionSec: 120, status: 'success' })
    expect(lines[lines.length - 1]?.level).toBe('SUCCESS')
    expect(lines[lines.length - 1]?.text).toBe('BUILD SUCCESS')
  })

  it('暂停与失败输出对应日志', () => {
    const paused = buildLogLines({ ...base, progress: 0.4, status: 'paused' })
    expect(paused[paused.length - 1]?.text).toContain('Build paused')
    const failed = buildLogLines({ ...base, progress: 0.4, status: 'failed' })
    expect(failed[failed.length - 1]?.level).toBe('ERROR')
    expect(failed[failed.length - 1]?.text).toContain('BUILD FAILED')
  })

  it('时间戳随构建进度推进', () => {
    const lines = buildLogLines({ ...base, progress: 0.8, positionSec: 96 })
    const times = lines.map((line) => line.time)
    expect(times[0]).toBe('00:00.0')
    expect(times[times.length - 1]).not.toBe('00:00.0')
  })
})
