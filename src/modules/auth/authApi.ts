import { getJson, postJson, request } from '@/lib/http'
import type { AuthUser, Credentials, LoginResponse, RegisterResponse } from './types'

const BASE = '/api/v1/user/auth'

export function register(credentials: Credentials): Promise<RegisterResponse> {
  return postJson<RegisterResponse>(`${BASE}/register`, credentials)
}

export function login(credentials: Credentials): Promise<LoginResponse> {
  return postJson<LoginResponse>(`${BASE}/login`, credentials)
}

export function fetchMe(): Promise<AuthUser> {
  return getJson<AuthUser>(`${BASE}/me`)
}

export function logout(): Promise<void> {
  return request<void>(`${BASE}/logout`, { method: 'POST' })
}
