import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { AUTH_EXPIRED_EVENT, ApiError } from '@/lib/http'
import { clearAuth, readAuth, writeAuth, type StoredAuth } from '@/lib/authToken'
import {
  fetchMe as fetchMeRequest,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  removeAvatar as removeAvatarRequest,
  uploadAvatar as uploadAvatarRequest,
} from '@/modules/auth/authApi'
import type {
  AuthUser,
  Credentials,
  LoginResponse,
  RegisterResponse,
} from '@/modules/auth/types'

export const useAuthStore = defineStore('auth', () => {
  const saved = readAuth()
  const token = ref(saved?.token ?? '')
  const user = ref<AuthUser | null>(saved?.user ?? null)
  const validated = ref(false)
  const loading = ref(false)

  const hasToken = computed(() => token.value.length > 0)
  const isAuthenticated = computed(() => hasToken.value && user.value !== null)
  const isAdmin = computed(
    () => user.value?.role === 'ADMIN' || Boolean(user.value?.roles?.includes('ADMIN')),
  )
  const permissions = computed(() => user.value?.permissions ?? [])

  /** 与服务端 @RequirePermission 对齐的前端能力判断，仅用于隐藏入口，不替代后端校验。 */
  function hasPermission(code: string): boolean {
    return permissions.value.includes(code)
  }

  function clear() {
    token.value = ''
    user.value = null
    validated.value = false
    clearAuth()
  }

  function syncFromStorage(): boolean {
    const stored = readAuth()
    if (!stored) {
      token.value = ''
      user.value = null
      validated.value = false
      return false
    }
    if (stored.token !== token.value) {
      token.value = stored.token
      user.value = stored.user
      validated.value = false
    }
    return true
  }

  function apply(next: StoredAuth) {
    token.value = next.token
    user.value = next.user
    validated.value = true
    writeAuth(next)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_EXPIRED_EVENT, () => {
      token.value = ''
      user.value = null
      validated.value = false
    })
  }

  async function login(credentials: Credentials): Promise<LoginResponse> {
    loading.value = true
    try {
      const result = await loginRequest(credentials)
      apply({ token: result.token, user: result.user })
      return result
    } finally {
      loading.value = false
    }
  }

  async function register(credentials: Credentials): Promise<RegisterResponse> {
    loading.value = true
    try {
      return await registerRequest(credentials)
    } finally {
      loading.value = false
    }
  }

  function applyUser(next: AuthUser) {
    user.value = next
    validated.value = true
    if (token.value) writeAuth({ token: token.value, user: next })
  }

  async function fetchMe(): Promise<AuthUser> {
    const me = await fetchMeRequest()
    applyUser(me)
    return me
  }

  async function uploadAvatar(file: File): Promise<AuthUser> {
    const next = await uploadAvatarRequest(file)
    applyUser(next)
    return next
  }

  async function removeAvatar(): Promise<AuthUser> {
    const next = await removeAvatarRequest()
    applyUser(next)
    return next
  }

  /**
   * 校验本地会话。返回 false 表示没有可用登录态；
   * 网络/服务异常时抛出，由调用方决定是否沿用本地缓存。
   */
  async function ensureSession(): Promise<boolean> {
    if (!syncFromStorage()) return false
    if (validated.value && user.value) return true
    try {
      await fetchMe()
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clear()
        return false
      }
      throw error
    }
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) await logoutRequest()
    } catch {
      // 退出以本地清理为准
    }
    clear()
  }

  return {
    token,
    user,
    loading,
    hasToken,
    isAuthenticated,
    isAdmin,
    permissions,
    hasPermission,
    login,
    register,
    fetchMe,
    uploadAvatar,
    removeAvatar,
    ensureSession,
    logout,
    clear,
  }
})
