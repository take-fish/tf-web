import type { AuthUser } from '@/types/auth'

export const AUTH_STORAGE_KEY = 'fm.auth.v1'

export interface StoredAuth {
  token: string
  user: AuthUser
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
    return { token: parsed.token, user: parsed.user }
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
