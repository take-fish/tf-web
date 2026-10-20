import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, AUTH_EXPIRED_EVENT } from '@/lib/http'
import { AUTH_STORAGE_KEY, readAuth, writeAuth } from '@/lib/authToken'
import { useAuthStore } from '@/stores/auth'
import type {
  AuthUser,
  Credentials,
  LoginResponse,
  RegisterResponse,
} from '@/modules/auth/types'

const api = vi.hoisted(() => ({
  login: vi.fn<(credentials: Credentials) => Promise<LoginResponse>>(),
  register: vi.fn<(credentials: Credentials) => Promise<RegisterResponse>>(),
  fetchMe: vi.fn<() => Promise<AuthUser>>(),
  logout: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/modules/auth/authApi', () => api)

const USER: AuthUser = {
  id: 7,
  username: '摸鱼小明',
  nickname: '小明',
  role: 'USER',
  status: 'ACTIVE',
}

function seedSession(token = 'seed-token') {
  writeAuth({ token, user: USER })
  setActivePinia(createPinia())
  return useAuthStore()
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('登录后写入 token 与用户并持久化', async () => {
    api.login.mockResolvedValue({ token: 'tok-login', user: USER })

    const store = useAuthStore()
    const result = await store.login({ username: '摸鱼小明', password: 'secret1' })

    expect(result.user.id).toBe(7)
    expect(store.isAuthenticated).toBe(true)
    expect(store.isAdmin).toBe(false)

    const stored = readAuth()
    expect(stored?.token).toBe('tok-login')
    expect(stored?.user.username).toBe('摸鱼小明')
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!).token).toBe('tok-login')
  })

  it('注册成功不建立会话', async () => {
    api.register.mockResolvedValue({ status: 'PENDING', message: '等待通过中' })

    const store = useAuthStore()
    const result = await store.register({ username: '新人', password: 'secret1' })

    expect(result.status).toBe('PENDING')
    expect(store.hasToken).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('退出登录清空本地会话', async () => {
    api.logout.mockResolvedValue(undefined)
    const store = seedSession('tok-logout')

    await store.logout()

    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(store.hasToken).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('退出接口失败也以本地清理为准', async () => {
    api.logout.mockRejectedValue(new Error('offline'))
    const store = seedSession()

    await store.logout()

    expect(store.hasToken).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('会话失效（401）时清除登录态', async () => {
    api.fetchMe.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '登录已过期'))
    const store = seedSession()

    await expect(store.ensureSession()).resolves.toBe(false)

    expect(store.hasToken).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('服务异常时保留本地会话并抛出，交给路由沿用缓存', async () => {
    api.fetchMe.mockRejectedValue(new ApiError(503, 'DATABASE_UNAVAILABLE', '数据库暂不可用'))
    const store = seedSession()

    await expect(store.ensureSession()).rejects.toBeInstanceOf(ApiError)
    expect(store.hasToken).toBe(true)
    expect(readAuth()?.token).toBe('seed-token')
  })

  it('校验成功后刷新用户缓存且只请求一次', async () => {
    api.fetchMe.mockResolvedValue({ ...USER, nickname: '新昵称' })
    const store = seedSession()

    await expect(store.ensureSession()).resolves.toBe(true)
    await expect(store.ensureSession()).resolves.toBe(true)

    expect(api.fetchMe).toHaveBeenCalledTimes(1)
    expect(store.user?.nickname).toBe('新昵称')
    expect(readAuth()?.user.nickname).toBe('新昵称')
  })

  it('收到全局会话失效事件时清空内存登录态', async () => {
    const store = seedSession()

    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    await Promise.resolve()

    expect(store.hasToken).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })
})
