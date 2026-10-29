import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '../authToken'
import {
  ApiError,
  AUTH_EXPIRED_EVENT,
  appendErrorReference,
  errorReference,
  formatApiError,
  request,
} from '../http'

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

const USER = { id: 2, username: 'u2', nickname: '良一深', role: 'USER', status: 'ACTIVE' }

function storeAuth(token: string, refreshToken?: string) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user: USER, refreshToken }))
}

function storedToken(): string {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { token: string }).token : ''
}

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('业务服务返回 401 时不误判登录态', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('下游服务 401 但用户中台会话有效时保留登录态', async () => {
    storeAuth('tok-live')
    const expired = vi.fn<() => void>()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        if (path === '/api/v1/user/auth/me') return response(200, USER)
        return response(401, { error: 'INVALID_IDENTITY', message: '身份信息无效，请重新登录' })
      }),
    )

    await expect(request('/api/v1/reader/me/stats')).rejects.toBeInstanceOf(ApiError)

    expect(storedToken()).toBe('tok-live')
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })

  it('用户中台确认会话失效时清登录态并广播', async () => {
    storeAuth('tok-dead')
    const expired = vi.fn<() => void>()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(401, { error: 'UNAUTHORIZED', message: '请先登录' })),
    )

    await expect(request('/api/v1/chat/conversations')).rejects.toBeInstanceOf(ApiError)

    expect(storedToken()).toBe('')
    expect(expired).toHaveBeenCalledTimes(1)
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })

  it('重新登录后旧请求的 401 不会清掉新会话', async () => {
    storeAuth('tok-old')
    const expired = vi.fn<() => void>()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        // 旧请求在途时用户已完成重新登录
        if (path === '/api/v1/reader/me/stats') {
          storeAuth('tok-new')
          return response(401, { error: 'INVALID_IDENTITY', message: '身份信息无效' })
        }
        return response(200, USER)
      }),
    )

    await expect(request('/api/v1/reader/me/stats')).rejects.toBeInstanceOf(ApiError)

    expect(storedToken()).toBe('tok-new')
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })

  it('身份接口自身 401 立即清登录态', async () => {
    storeAuth('tok-expired')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(401, { error: 'UNAUTHORIZED' })),
    )

    await expect(request('/api/v1/user/auth/me')).rejects.toBeInstanceOf(ApiError)

    expect(storedToken()).toBe('')
  })
})

describe('访问令牌静默刷新', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('401 时用刷新令牌换新 access 并重放原请求', async () => {
    storeAuth('stale-token', 'refresh-1')
    const calls: string[] = []
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input, init) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/api/v1/user/auth/refresh')) {
          return response(200, { token: 'fresh-token' })
        }
        const auth = new Headers(init?.headers).get('Authorization')
        return auth === 'Bearer fresh-token'
          ? response(200, { ok: true })
          : response(401, { error: 'UNAUTHORIZED', message: '请先登录' })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await request<{ ok: boolean }>('/api/v1/chat/rooms')

    expect(result.ok).toBe(true)
    expect(calls).toEqual(['/api/v1/chat/rooms', '/api/v1/user/auth/refresh', '/api/v1/chat/rooms'])
    expect(storedToken()).toBe('fresh-token')
  })

  it('并发 401 只打一次刷新接口', async () => {
    storeAuth('stale-token', 'refresh-1')
    let refreshCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/v1/user/auth/refresh')) {
          refreshCalls += 1
          await new Promise((resolve) => setTimeout(resolve, 5))
          return response(200, { token: 'fresh-token' })
        }
        const auth = new Headers(init?.headers).get('Authorization')
        return auth === 'Bearer fresh-token' ? response(200, { ok: true }) : response(401, {})
      }),
    )

    const results = await Promise.all([
      request('/api/v1/chat/rooms'),
      request('/api/v1/chat/friends'),
    ])

    expect(results).toHaveLength(2)
    expect(refreshCalls).toBe(1)
  })

  it('没有刷新令牌时直接清空登录态', async () => {
    storeAuth('stale-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(401, { error: 'UNAUTHORIZED', message: '请先登录' })),
    )

    await expect(request('/api/v1/chat/rooms')).rejects.toBeInstanceOf(ApiError)
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('刷新被拒时以用户中台的判定为准，不误踢有效会话', async () => {
    storeAuth('stale-token', 'refresh-dead')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/v1/user/auth/refresh')) {
          return response(401, { error: 'INVALID_REFRESH_TOKEN' })
        }
        if (url === '/api/v1/user/auth/me') return response(200, USER)
        return response(401, { error: 'INVALID_IDENTITY', message: '身份信息无效' })
      }),
    )

    await expect(request('/api/v1/reader/me/stats')).rejects.toBeInstanceOf(ApiError)

    expect(storedToken()).toBe('stale-token')
  })
})
