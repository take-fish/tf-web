import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/modules/auth/types'
import {
  DEFAULT_CHAT_GROUP_ID,
  chatGroupStorageKey,
  chooseChatGroupId,
  readStoredChatGroupId,
  sanitizeChatGroupId,
  useChatStore,
} from '@/stores/chat'

const USER: AuthUser = {
  id: 7,
  username: '摸鱼小明',
  nickname: '小明',
  role: 'USER',
  status: 'ACTIVE',
}

function seedSession(user = USER) {
  writeAuth({ token: 'seed-token', user })
  setActivePinia(createPinia())
}

describe('chat group persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('拒绝非法群组 ID', () => {
    expect(sanitizeChatGroupId('ops-oncall')).toBe('ops-oncall')
    expect(sanitizeChatGroupId('dev/group')).toBeNull()
    expect(sanitizeChatGroupId('')).toBeNull()
    expect(sanitizeChatGroupId(null)).toBeNull()
  })

  it('优先恢复仍存在的群组，群组被删后回退默认值', () => {
    expect(chooseChatGroupId(['dev-group', 'ops-oncall'], 'ops-oncall')).toBe('ops-oncall')
    expect(chooseChatGroupId(['dev-group', 'lounge'], 'ops-oncall')).toBe(
      DEFAULT_CHAT_GROUP_ID,
    )
    expect(chooseChatGroupId([], 'ops-oncall')).toBe('ops-oncall')
    expect(chooseChatGroupId([], null)).toBe(DEFAULT_CHAT_GROUP_ID)
    expect(chooseChatGroupId(['lounge'], null)).toBe('lounge')
  })

  it('按用户恢复上次所在的群组', () => {
    seedSession()
    localStorage.setItem(chatGroupStorageKey(USER.id), 'ops-oncall')

    const store = useChatStore()
    expect(store.selectedGroupId).toBe('ops-oncall')
    expect(store.restoreGroup(['dev-group', 'ops-oncall', 'lounge'])).toBe('ops-oncall')
  })

  it('切换群组后持久化，且不同用户互不影响', () => {
    seedSession()
    const store = useChatStore()
    store.setGroup('lounge')

    expect(readStoredChatGroupId(USER.id)).toBe('lounge')
    expect(readStoredChatGroupId(8)).toBeNull()

    writeAuth({ token: 'other-token', user: { ...USER, id: 8, username: 'other' } })
    setActivePinia(createPinia())
    expect(useChatStore().selectedGroupId).toBe(DEFAULT_CHAT_GROUP_ID)

    localStorage.setItem(chatGroupStorageKey(8), 'ops-oncall')
    setActivePinia(createPinia())
    expect(useChatStore().selectedGroupId).toBe('ops-oncall')
  })
})
