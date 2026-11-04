<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'

interface ChatMessage {
  id: number
  who: string
  text: string
  at: number
}

const auth = useAuthStore()
const open = ref(true)
const draft = ref('')
const listEl = ref<HTMLElement | null>(null)
let nextId = 1

const messages = ref<ChatMessage[]>([
  {
    id: 0,
    who: '系统',
    text: '同局临时频道，消息只保留本局，最多最近 50 条。',
    at: Date.now(),
  },
])

function send(): void {
  const text = draft.value.trim()
  if (!text) return
  messages.value = [
    ...messages.value,
    { id: nextId++, who: auth.user?.nickname ?? '我', text: text.slice(0, 200), at: Date.now() },
  ]
  if (messages.value.length > 50) messages.value = messages.value.slice(-50)
  draft.value = ''
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
      <b>同局频道</b>
      <button type="button" class="drill__chat-toggle" @click="open = !open">
        {{ open ? '收起' : '展开' }}
      </button>
    </header>

    <template v-if="open">
      <ul ref="listEl" class="drill__chat-list">
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
