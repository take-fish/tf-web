import { clearAuth, getAuthToken } from './authToken'

export const AUTH_EXPIRED_EVENT = 'fm:auth-expired'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly traceId?: string
  readonly requestId?: string
  readonly timestamp?: string

  constructor(
    status: number,
    code: string,
    message: string,
    traceId?: string,
    requestId?: string,
    timestamp?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.traceId = traceId
    this.requestId = requestId
    this.timestamp = timestamp
  }
}

interface ErrorBody {
  error?: string
  message?: string
  traceId?: string
  requestId?: string
  timestamp?: string
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {}
  try {
    body = (await response.json()) as ErrorBody
  } catch {
    // 非 JSON 错误体
  }
  return new ApiError(
    response.status,
    body.error ?? `HTTP_${response.status}`,
    body.message ?? `请求失败（HTTP ${response.status}）`,
    body.traceId ?? response.headers.get('X-Trace-ID') ?? undefined,
    body.requestId ?? response.headers.get('X-Request-ID') ?? undefined,
    body.timestamp,
  )
}

/** 返回可用于日志检索的错误编号，没有编号时返回空串。 */
export function errorReference(error: unknown): string {
  if (error instanceof ApiError) {
    return error.traceId ?? error.requestId ?? ''
  }
  return ''
}

/** 错误文案统一附带可复制的链路编号。 */
export function formatApiError(error: unknown, fallback = '操作失败'): string {
  const message = error instanceof Error && error.message ? error.message : fallback
  return appendErrorReference(message, error)
}

export function appendErrorReference(message: string, error: unknown): string {
  const reference = errorReference(error)
  return reference ? `${message}（编号 ${reference}）` : message
}

function isAuthEntry(path: string): boolean {
  return path.startsWith('/api/v1/user/auth/login') || path.startsWith('/api/v1/user/auth/register')
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body !== undefined && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('Authorization')) {
    const token = getAuthToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    if (response.status === 401 && !isAuthEntry(path)) {
      clearAuth()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
    }
    throw await parseError(response)
  }
  return response
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authFetch(path, init)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * 下载二进制资源（例如私聊图片）。浏览器 <img> 无法携带 Authorization，
 * 因此先带 token 取回 Blob，再由调用方生成 object URL。
 */
export async function getBlob(path: string): Promise<Blob> {
  const response = await authFetch(path)
  return response.blob()
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function putJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function deleteJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

export function postForm<T>(path: string, body: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body })
}
