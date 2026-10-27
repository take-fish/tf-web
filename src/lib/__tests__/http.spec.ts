import { describe, expect, it } from 'vitest'

import { ApiError, appendErrorReference, errorReference, formatApiError } from '../http'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'

describe('ApiError 链路编号', () => {
  it('优先使用 traceId，缺失时回退 requestId', () => {
    expect(errorReference(new ApiError(500, 'INTERNAL_ERROR', '服务异常', TRACE_ID))).toBe(TRACE_ID)
    expect(errorReference(new ApiError(502, 'BAD_GATEWAY', '网关异常', undefined, TRACE_ID))).toBe(
      TRACE_ID,
    )
    expect(errorReference(new Error('network'))).toBe('')
  })

  it('错误文案附带可复制的编号', () => {
    const error = new ApiError(429, 'RATE_LIMITED', '发送过于频繁', TRACE_ID, TRACE_ID)
    expect(formatApiError(error)).toBe(`发送过于频繁（编号 ${TRACE_ID}）`)
    expect(appendErrorReference('请稍后再试', error)).toBe(`请稍后再试（编号 ${TRACE_ID}）`)
    expect(appendErrorReference('请稍后再试', new Error('x'))).toBe('请稍后再试')
  })

  it('非 ApiError 使用兜底文案', () => {
    expect(formatApiError(undefined, '操作失败')).toBe('操作失败')
  })

  it('参数校验失败时展示逐字段提示，而不是笼统的顶层文案', () => {
    const error = new ApiError(
      400,
      'VALIDATION_FAILED',
      '请求参数校验未通过',
      TRACE_ID,
      undefined,
      undefined,
      {
        fields: { title: '书名不能超过 255 个字符' },
      },
    )
    expect(formatApiError(error)).toBe(`书名不能超过 255 个字符（编号 ${TRACE_ID}）`)
  })

  it('没有字段提示时仍用顶层文案', () => {
    const error = new ApiError(400, 'BAD_REQUEST', '分类不存在', TRACE_ID, undefined, undefined, {})
    expect(formatApiError(error)).toBe(`分类不存在（编号 ${TRACE_ID}）`)
  })
})
