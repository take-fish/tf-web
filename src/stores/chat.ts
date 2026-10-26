import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'

export const DEFAULT_CHAT_GROUP_ID = 'dev-group'
export const CHAT_GROUP_STORAGE_PREFIX = 'fm.chat.group.v1'

const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function chatGroupStorageKey(userId: string | number | null | undefined): string {
  const normalized = userId === null || userId === undefined ? '' : String(userId).trim()
  return `${CHAT_GROUP_STORAGE_PREFIX}:${normalized || 'anonymous'}`
}

export function sanitizeChatGroupId(value: unknown): string | null {
  return typeof value === 'string' && GROUP_ID_PATTERN.test(value) ? value : null
}

export function readStoredChatGroupId(
  userId: string | number | null | undefined,
): string | null {
  const store = storage()
  if (!store) return null
  try {
    return sanitizeChatGroupId(store.getItem(chatGroupStorageKey(userId)))
  } catch {
    return null
  }
}

export function chooseChatGroupId(
  availableIds: readonly string[],
  storedId: string | null,
): string {
  if (storedId && (availableIds.length === 0 || availableIds.includes(storedId))) {
    return storedId
  }
  if (availableIds.includes(DEFAULT_CHAT_GROUP_ID)) return DEFAULT_CHAT_GROUP_ID
  return availableIds[0] ?? DEFAULT_CHAT_GROUP_ID
}

export const useChatStore = defineStore('chat', () => {
  const auth = useAuthStore()
  const selectedGroupId = ref(DEFAULT_CHAT_GROUP_ID)
  const storageKey = computed(() => chatGroupStorageKey(auth.user?.id))

  function persist() {
    const store = storage()
    if (!store) return
    try {
      store.setItem(storageKey.value, selectedGroupId.value)
    } catch {
      // 本地存储不可用时仅失去持久化能力，不影响聊天。
    }
  }

  function loadForCurrentUser() {
    selectedGroupId.value =
      readStoredChatGroupId(auth.user?.id) ?? DEFAULT_CHAT_GROUP_ID
  }

  function restoreGroup(availableIds: readonly string[]): string {
    const stored = readStoredChatGroupId(auth.user?.id) ?? selectedGroupId.value
    selectedGroupId.value = chooseChatGroupId(availableIds, stored)
    persist()
    return selectedGroupId.value
  }

  function setGroup(groupId: string) {
    const next = sanitizeChatGroupId(groupId)
    if (!next) return
    selectedGroupId.value = next
    persist()
  }

  watch(
    () => auth.user?.id,
    () => {
      loadForCurrentUser()
    },
    { immediate: true },
  )

  return { selectedGroupId, storageKey, restoreGroup, setGroup }
})
