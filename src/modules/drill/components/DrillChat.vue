<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useDrillRoomStore } from '../stores/room'

interface ChatMessage {
  id: number | string
  who: string
  text: string
  at: number
}

const auth = useAuthStore()
const room = useDrillRoomStore()
const open = ref(true)
const draft = ref('')
const listEl = ref<HTMLElement | null>(null)
let nextId = 1

const localMessages = ref<ChatMessage[]>([
  {
    id: 0,
    who: '系统',
    text: '同局临时频道，消息只保留本局，最多最近 50 条。',
    at: Date.now(),
  },
])

const messages = computed<ChatMessage[]>(() => {
  if (room.active) {
    return (room.room?.chats ?? []).map((chat, index) => ({
      id: `${chat.at}-${chat.userId}-${index}`,
      who: chat.nickname || chat.userId,
      text: chat.text,
      at: chat.at,
    }))
  }
  return localMessages.value
})

function send(): void {
  const text = draft.value.trim()
  if (!text) return
  const body = text.slice(0, 200)
  draft.value = ''
  if (room.active) {
    void room.chat(body)
    return
  }
  localMessages.value = [
    ...localMessages.value,
    { id: nextId++, who: auth.user?.nickname ?? '我', text: body, at: Date.now() },
  ]
  if (localMessages.value.length > 50) localMessages.value = localMessages.value.slice(-50)
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  },
)
</script>

<template>
  <section class="drill__chat" :class="{ 'is-closed': !open }" aria-label="同局临时聊天">
    <header class="drill__chat-head">
      <b>{{ room.active ? `房间 ${room.room?.id}` : '同局频道' }}</b>
      <button type="button" class="drill__chat-toggle" @click="open = !open">
        {{ open ? '收起' : '展开' }}
      </button>
    </header>

    <template v-if="open">
      <ul ref="listEl" class="drill__chat-list">
        <li v-if="messages.length === 0" class="drill__chat-row">
          <span class="drill__chat-text">还没有人说话，打个招呼吧。</span>
        </li>
        <li v-for="message in messages" :key="message.id" class="drill__chat-row">
          <span class="drill__chat-who">{{ message.who }}</span>
          <span class="drill__chat-text">{{ message.text }}</span>
        </li>
      </ul>
      <form class="drill__chat-input" @submit.prevent="send()">
        <input v-model="draft" type="text" maxlength="200" placeholder="说点什么…" />
        <button type="submit" class="drill__chat-send">发送</button>
      </form>
    </template>
  </section>
</template>
