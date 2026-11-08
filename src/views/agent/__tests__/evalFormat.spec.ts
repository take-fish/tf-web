import { describe, expect, it } from 'vitest'

import { formatPercent, formatTime, labelText } from '../evalFormat'

describe('evalFormat', () => {
  it('格式化指标百分比并处理无分母', () => {
    expect(formatPercent(0.6667)).toBe('67%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(undefined)).toBe('—')
  })

  it('标注文案覆盖 0/1/2 与未标注', () => {
    expect(labelText(0)).toBe('不相关')
    expect(labelText(1)).toBe('部分相关')
    expect(labelText(2)).toBe('高度相关')
    expect(labelText(null)).toBe('未标注')
  })

  it('时间只保留到分钟', () => {
    expect(formatTime('2026-11-08T10:30:45.123')).toBe('2026-11-08 10:30')
    expect(formatTime(null)).toBe('—')
  })
})
