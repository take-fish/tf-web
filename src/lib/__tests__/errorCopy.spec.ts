import { describe, expect, it } from 'vitest'

import { ApiError, formatApiError, toApiError } from '@/lib/http'

describe('错误文案分类', () => {
  it('网络错误给中文提示而不是 Failed to fetch', () => {
    expect(formatApiError(new TypeError('Failed to fetch'))).toBe('网络连接失败，请检查网络后重试')
    expect(formatApiError(new Error('Load failed'))).toBe('网络连接失败，请检查网络后重试')
  })

  it('5xx 泛化文案 + 编号', () => {
    const error = new ApiError(503, 'AGENT-503', '请求失败（HTTP 503）', 'trace-1')
    expect(formatApiError(error)).toBe('服务暂时不可用，请稍后重试（编号 trace-1）')
  })

  it('401 提示重新登录', () => {
    const error = new ApiError(401, 'AGENT-401', '请求失败（HTTP 401）', 'trace-2')
    expect(formatApiError(error)).toBe('登录已失效，请重新登录（编号 trace-2）')
  })

  it('4xx 业务错误保留后端文案', () => {
    const error = new ApiError(400, 'AGENT-KB-400', '知识库不存在', 'trace-3')
    expect(formatApiError(error)).toBe('知识库不存在（编号 trace-3）')
  })

  it('字段错误优先于顶层 message', () => {
    const error = new ApiError(422, 'AGENT-422', '请求参数校验未通过', 'trace-4', undefined, undefined, {
      fields: { query: '检索词不能为空' },
    })
    expect(formatApiError(error)).toBe('检索词不能为空（编号 trace-4）')
  })

  it('retryable 从 details 读取', () => {
    const error = new ApiError(503, 'x', 'y', undefined, undefined, undefined, { retryable: true })
    expect(error.retryable).toBe(true)
    expect(new ApiError(400, 'x', 'y').retryable).toBe(false)
  })
})

describe('toApiError 兼容 FastAPI 原生错误体', () => {
  it('detail 是字符串时取它作为文案', async () => {
    const response = new Response(JSON.stringify({ detail: '需要管理员权限' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
    const error = await toApiError(response)
    expect(error.status).toBe(403)
    expect(error.message).toBe('需要管理员权限')
  })

  it('detail 是数组时取第一条 msg', async () => {
    const response = new Response(JSON.stringify({ detail: [{ loc: ['body', 'top_k'], msg: 'Input should be an integer' }] }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
    const error = await toApiError(response)
    expect(error.message).toBe('Input should be an integer')
  })
})
