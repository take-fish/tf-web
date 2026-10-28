<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

import type { GameChatChannel, GameChatMessage } from '@/types/games'
import { formatClock } from '../lib/gameFormat'

const props = defineProps<{
  channel: GameChatChannel
  messages: GameChatMessage[]
  loading: boolean
  error: string
  closed: boolean
  sending: boolean
  hint: string
  placeholder: string
  privateTabVisible: boolean
  selfId: string
}>()

const emit = defineEmits<{
  'update:channel': [channel: GameChatChannel]
  send: [text: string]
}>()

const draft = ref('')
const body = ref<HTMLElement | null>(null)

async function scrollToEnd() {
  await nextTick()
  if (body.value) body.value.scrollTop = body.value.scrollHeight
}

function submit() {
  const text = draft.value.trim()
  if (!text || props.closed || props.sending) return
  emit('send', text)
}

function clearDraft() {
  draft.value = ''
  void scrollToEnd()
}

// 发送失败时保留草稿，由父组件在成功后调用 clearDraft。
defineExpose({ clearDraft })

watch(
  () => [props.channel, props.messages.length],
  () => void scrollToEnd(),
)

onMounted(() => void scrollToEnd())
</script>

<template>
  <aside class="match-window__chat">
    <header class="match-window__chat-head">
      <div class="match-window__tabs">
        <button
          type="button"
          :class="{ 'is-active': channel === 'PUBLIC' }"
          @click="emit('update:channel', 'PUBLIC')"
        >
          公开频道
        </button>
        <button
          v-if="privateTabVisible"
          type="button"
          :class="{ 'is-active': channel === 'PLAYER_DM' }"
          @click="emit('update:channel', 'PLAYER_DM')"
        >
          双方私聊
        </button>
      </div>
      <span class="match-window__chat-hint">{{ hint }}</span>
    </header>

    <div ref="body" class="match-window__messages">
      <div v-if="loading" class="match-window__chat-empty">正在同步聊天记录…</div>
      <div v-else-if="messages.length === 0" class="match-window__chat-empty">
        {{ channel === 'PLAYER_DM' ? '还没有私聊消息，先和对方打个招呼吧' : '暂时没有消息' }}
      </div>
      <div
        v-for="message in messages"
        :key="message.id"
        class="match-window__message"
        :class="{ 'is-self': message.fromUserId === selfId }"
      >
        <div class="match-window__message-meta">
          <b>{{ message.fromNickname }}</b>
          <span>{{ formatClock(message.createdAt) }}</span>
        </div>
        <p>{{ message.content }}</p>
      </div>
      <p v-if="error" class="match-window__chat-error">{{ error }}</p>
    </div>

    <form class="match-window__composer" @submit.prevent="submit">
      <input
        v-model="draft"
        type="text"
        :placeholder="placeholder"
        :disabled="closed || sending"
        maxlength="1000"
      />
      <button type="submit" class="match-window__send" :disabled="closed || sending || !draft.trim()">
        发送
      </button>
    </form>
  </aside>
</template>

<style scoped src="./match-chat-panel.css"></style>
