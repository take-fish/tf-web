export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  error?: string
  message?: string
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
  )
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body !== undefined && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
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
