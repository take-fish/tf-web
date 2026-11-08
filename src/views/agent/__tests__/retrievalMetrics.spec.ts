import { describe, expect, it } from 'vitest'

import { parseRetrievalMetrics } from '../retrievalMetrics'

describe('parseRetrievalMetrics', () => {
  it('解析后端返回的全库指标', () => {
    expect(
      parseRetrievalMetrics({
        metrics: {
          recall: 0.75,
          precision: 0.5,
          matched: 4,
          retrieved: 8,
          relevant: 6,
          terms: 5,
        },
      }),
    ).toEqual({
      recall: 0.75,
      precision: 0.5,
      matched: 4,
      retrieved: 8,
      relevant: 6,
      terms: 5,
    })
  })

  it('没有 metrics 时返回 null', () => {
    expect(parseRetrievalMetrics({ chunks: [], query: '发布流程' })).toBeNull()
    expect(parseRetrievalMetrics(undefined)).toBeNull()
  })

  it('比例缺失或非数字时返回 null，计数做兜底', () => {
    expect(parseRetrievalMetrics({ metrics: { recall: 0.5 } })).toBeNull()
    expect(parseRetrievalMetrics({ metrics: { precision: 0.5 } })).toBeNull()
    expect(
      parseRetrievalMetrics({
        metrics: { recall: 0.5, precision: 0.5, matched: '4', retrieved: -1 },
      }),
    ).toMatchObject({ matched: 0, retrieved: 0 })
  })
})
