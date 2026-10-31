import { clearAuth, getAuthToken } from './authToken'

export const AUTH_EXPIRED_EVENT = 'fm:auth-expired'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly traceId?: string
  readonly requestId?: string
  readonly timestamp?: string
  readonly details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    traceId?: string,
    requestId?: string,
    timestamp?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.traceId = traceId
    this.requestId = requestId
    this.timestamp = timestamp
    this.details = details
  }
}

interface ErrorBody {
  error?: string
  message?: string
  traceId?: string
  requestId?: string
  timestamp?: string
  details?: Record<string, unknown>
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
    body.details,
  )
}

/**
 * 参数校验失败时服务端把逐字段提示放在 `details.fields` 里，
 * 顶层 message 只是笼统的"请求参数校验未通过"。取第一条字段提示，避免提示变含糊。
 */
function firstFieldMessage(details: Record<string, unknown> | undefined): string {
  const fields = details?.fields
  if (!fields || typeof fields !== 'object') return ''
  for (const value of Object.values(fields as Record<string, unknown>)) {
    if (typeof value === 'string' && value) return value
  }
  return ''
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
  if (error instanceof ApiError) {
    const message = firstFieldMessage(error.details) || error.message || fallback
    return appendErrorReference(message, error)
  }
  const message = error instanceof Error && error.message ? error.message : fallback
  return appendErrorReference(message, error)
}

export function appendErrorReference(message: string, error: unknown): string {
  const reference = errorReference(error)
  return reference ? `${message}（编号 ${reference}）` : message
}

/** 身份接口自身返回 401 才算登录态失效。 */
function isAuthEntry(path: string): boolean {
  return path.startsWith('/api/v1/user/auth/')
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body !== undefined && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('Authorization')) {
    const token = getAuthToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

/**
 * 业务服务返回 401 时先回用户中台确认会话是否真的失效。
 *
 * 服务重启、身份签名密钥不一致时，下游会把有效会话也判成 401；
 * 这种情况下清本地登录态会让用户"刚登录就被登出"，所以只以用户中台为准。
 */
async function sessionExpired(token: string | null): Promise<boolean> {
  if (!token) return true
  try {
    const response = await fetch('/api/v1/user/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.status === 401
  } catch {
    // 网络异常时保留本地登录态，避免后端闪断把用户踢下线
    return false
  }
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sentToken = getAuthToken()
  const headers = buildHeaders(init)

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    if (response.status === 401) {
      // 旧请求晚到（期间已经重新登录）时忽略，避免清掉新会话
      const stillSameToken = getAuthToken() === sentToken
      if (stillSameToken && (isAuthEntry(path) || (await sessionExpired(sentToken)))) {
        clearAuth()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
        }
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
 * 页面正在销毁时使用的请求。`keepalive` 让浏览器在页面卸载后继续把请求发完，
 * 这是"关标签页丢数据"的正解。
 *
 * 不用 `navigator.sendBeacon`：beacon 无法携带 `Authorization` 头，网关会直接返回 401，
 * 而本项目身份走 Bearer token 而不是 Cookie。
 *
 * 限制：keepalive 请求体上限约 64KB，只用于进度上报这类小体量数据。
 */
export function keepaliveRequest(path: string, init: RequestInit = {}): boolean {
  try {
    void fetch(path, { ...init, headers: buildHeaders(init), keepalive: true })
    return true
  } catch {
    return false
  }
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

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

export function postForm<T>(path: string, body: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body })
}
