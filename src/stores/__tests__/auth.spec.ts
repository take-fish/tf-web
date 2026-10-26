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
  uploadAvatar: vi.fn<(file: File) => Promise<AuthUser>>(),
  removeAvatar: vi.fn<() => Promise<AuthUser>>(),
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

  it('权限集合来自用户中台并可判断能力', async () => {
    const privileged: AuthUser = {
      ...USER,
      role: 'USER',
      roles: ['USER', 'CONTENT_ADMIN'],
      permissions: ['reader.public.upload', 'reader.private.manage'],
    }
    api.login.mockResolvedValue({ token: 'tok-perm', user: privileged })

    const store = useAuthStore()
    await store.login({ username: '摸鱼小明', password: 'secret1' })

    expect(store.permissions).toEqual(['reader.public.upload', 'reader.private.manage'])
    expect(store.hasPermission('reader.public.upload')).toBe(true)
    expect(store.hasPermission('reader.category.manage')).toBe(false)
    expect(store.isAdmin).toBe(false)
  })

  it('多角色包含 ADMIN 时视为管理员', () => {
    const admin: AuthUser = {
      ...USER,
      role: 'USER',
      roles: ['ADMIN'],
      permissions: ['reader.category.manage'],
    }
    writeAuth({ token: 'tok-admin', user: admin })
    setActivePinia(createPinia())

    const store = useAuthStore()

    expect(store.isAdmin).toBe(true)
    expect(store.hasPermission('reader.category.manage')).toBe(true)
  })

  it('注册成功不建立会话', async () => {
    api.register.mockResolvedValue({ id: 12, status: 'PENDING', message: '等待通过中' })

    const store = useAuthStore()
    const result = await store.register({ username: '新人', password: 'secret1' })

    expect(result.id).toBe(12)
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

  it('上传头像后刷新用户缓存并持久化版本地址', async () => {
    const next: AuthUser = { ...USER, avatarUrl: '/api/v1/user/avatars/7?v=1' }
    api.uploadAvatar.mockResolvedValue(next)
    const store = seedSession()
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })

    await store.uploadAvatar(file)

    expect(api.uploadAvatar).toHaveBeenCalledWith(file)
    expect(store.user?.avatarUrl).toBe(next.avatarUrl)
    expect(readAuth()?.user.avatarUrl).toBe(next.avatarUrl)
  })

  it('移除头像后回到无头像状态', async () => {
    api.removeAvatar.mockResolvedValue({ ...USER, avatarUrl: null })
    const store = seedSession()

    await store.removeAvatar()

    expect(api.removeAvatar).toHaveBeenCalledTimes(1)
    expect(store.user?.avatarUrl).toBeNull()
    expect(readAuth()?.user.avatarUrl).toBeNull()
  })

  it('收到全局会话失效事件时清空内存登录态', async () => {
    const store = seedSession()

    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    await Promise.resolve()

    expect(store.hasToken).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })
})
