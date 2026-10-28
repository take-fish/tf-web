import { deleteJson, getJson, postForm, postJson, request } from '@/lib/http'
import type {
  AppMeta,
  AuthUser,
  Credentials,
  LoginResponse,
  RegisterResponse,
} from '@/types/auth'

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

export function fetchMeta(): Promise<AppMeta> {
  return getJson<AppMeta>('/api/v1/user/meta')
}

export function uploadAvatar(file: File): Promise<AuthUser> {
  const body = new FormData()
  body.append('file', file)
  return postForm<AuthUser>(`${BASE}/avatar`, body)
}

export function removeAvatar(): Promise<AuthUser> {
  return deleteJson<AuthUser>(`${BASE}/avatar`)
}
