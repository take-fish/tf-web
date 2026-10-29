import type { AuthUser } from '@/types/auth'

export const AUTH_STORAGE_KEY = 'fm.auth.v1'

export interface StoredAuth {
  token: string
  user: AuthUser
  /** 刷新令牌：访问令牌过期时用它静默换新 token。旧数据没有这个字段。 */
  refreshToken?: string
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Partial<AuthUser>
  return (
    typeof user.id === 'number' &&
    typeof user.username === 'string' &&
    typeof user.nickname === 'string' &&
    typeof user.role === 'string' &&
    typeof user.status === 'string'
  )
}

export function readAuth(): StoredAuth | null {
  const raw = storage()?.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuth>
    if (typeof parsed.token !== 'string' || !parsed.token || !isAuthUser(parsed.user)) {
      return null
    }
    return {
      token: parsed.token,
      user: parsed.user,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
    }
  } catch {
    return null
  }
}

export function writeAuth(auth: StoredAuth): void {
  try {
    storage()?.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
  } catch {
    // ignore
  }
}

export function clearAuth(): void {
  try {
    storage()?.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function getAuthToken(): string | null {
  return readAuth()?.token ?? null
}

export function getRefreshToken(): string | null {
  return readAuth()?.refreshToken ?? null
}

/** 静默刷新成功后只换访问令牌，用户信息与刷新令牌保持不变。 */
export function updateAuthToken(token: string): void {
  const current = readAuth()
  if (!current) return
  writeAuth({ ...current, token })
}
