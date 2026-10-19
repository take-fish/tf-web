import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

export const IDENTITY_STORAGE_KEY = 'fm.identity.v1'

export interface IdentityState {
  userId: string
  nickname: string
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

function generateUserId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`
}

function sanitizeNickname(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 32)
  return cleaned || `摸鱼-${randomHex(4)}`
}

export function nodeNameFor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return `dev-node-${String((hash % 99) + 1).padStart(2, '0')}`
}

export function decodeIdentity(raw: string | null): IdentityState {
  const fallback = { userId: generateUserId(), nickname: `摸鱼-${randomHex(4)}` }
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<IdentityState>
    const userId =
      typeof parsed.userId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(parsed.userId)
        ? parsed.userId
        : fallback.userId
    const nickname =
      typeof parsed.nickname === 'string' ? sanitizeNickname(parsed.nickname) : fallback.nickname
    return { userId, nickname }
  } catch {
    return fallback
  }
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const useIdentityStore = defineStore('identity', () => {
  const state = reactive<IdentityState>(
    decodeIdentity(storage()?.getItem(IDENTITY_STORAGE_KEY) ?? null),
  )

  function persist() {
    try {
      storage()?.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }

  function setNickname(value: string) {
    state.nickname = sanitizeNickname(value)
  }

  watch(state, persist, { deep: true })
  persist()

  return { state, setNickname, persist, nodeName: nodeNameFor(state.userId) }
})
