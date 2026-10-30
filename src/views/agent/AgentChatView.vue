<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import {
  confirmAction,
  fetchScenes,
  fetchStatus,
  streamChat,
  type AgentEvent,
  type StatusInfo,
} from '@/api/agent'

defineOptions({ name: 'AgentChatView' })

interface ToolCard {
  callId: string
  name: string
  status: 'running' | 'done' | 'error'
  args: Record<string, unknown>
  rows?: number
  ms?: number
  ok?: boolean
  message?: string
  expanded: boolean
}

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  traceId?: string
  tools: ToolCard[]
  error?: string
  pending?: boolean
  confirm?: {
    confirmId: string
    description: string
    tool: string
    expiresIn: number
    state: 'waiting' | 'running' | 'done' | 'failed'
    result?: string
  }
}

const messages = ref<ChatMessage[]>([])
const input = ref('')
const sending = ref(false)
const sessionId = ref('')
const scene = ref('ops')
const env = ref<'prod' | 'test'>('prod')
const status = ref<StatusInfo | null>(null)
const scenes = ref<{ name: string; title: string; tools: string[] }[]>([])
const scroller = ref<HTMLElement | null>(null)
let controller: AbortController | null = null
let msgSeq = 1

const statusText = computed(() => {
  if (!status.value) return '检测中…'
  const parts: string[] = []
  parts.push(status.value.llm.ok ? `模型 ${status.value.llm.model}` : '模型不可用')
  parts.push(status.value.db.ok ? '审计库 OK' : '审计库不可用')
  parts.push(status.value.qdrant.ok ? '向量库 OK' : '向量库不可用')
  return parts.join(' · ')
})

const canSend = computed(() => input.value.trim().length > 0 && !sending.value)

function scrollToBottom() {
  void nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

async function loadMeta() {
  try {
    status.value = (await fetchStatus()).data
  } catch {
    status.value = null
  }
  try {
    scenes.value = (await fetchScenes()).data
  } catch {
    scenes.value = []
  }
}

void loadMeta()

function newAssistant(): ChatMessage {
  const message: ChatMessage = { id: msgSeq++, role: 'assistant', content: '', tools: [], pending: true }
  messages.value.push(message)
  return message
}

function applyEvent(message: ChatMessage, event: AgentEvent) {
  switch (event.type) {
    case 'start':
      message.traceId = event.trace_id
      break
    case 'delta':
      message.content += event.text ?? ''
      scrollToBottom()
      break
    case 'tool': {
      const callId = event.call_id ?? event.name ?? ''
      const existing = message.tools.find((tool) => tool.callId === callId && tool.name === event.name)
      if (!existing) {
        message.tools.push({
          callId,
          name: event.name ?? 'tool',
          status: (event.status as ToolCard['status']) ?? 'running',
          args: event.args ?? {},
          rows: event.rows,
          ms: event.ms,
          ok: event.ok,
          message: event.message,
          expanded: false,
        })
      } else {
        existing.status = (event.status as ToolCard['status']) ?? existing.status
        if (event.args) existing.args = event.args
        if (event.rows !== undefined) existing.rows = event.rows
        if (event.ms !== undefined) existing.ms = event.ms
        if (event.ok !== undefined) existing.ok = event.ok
        if (event.message) existing.message = event.message
      }
      scrollToBottom()
      break
    }
    case 'confirm_required':
      message.confirm = {
        confirmId: event.confirm_id ?? '',
        description: event.description ?? '',
        tool: event.tool ?? '',
        expiresIn: event.expires_in ?? 60,
        state: 'waiting',
      }
      break
    case 'usage':
      break
    case 'error':
      message.error = event.message ?? '未知错误'
      break
    case 'done':
      if (event.session_id) sessionId.value = event.session_id
      break
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  sending.value = true
  messages.value.push({ id: msgSeq++, role: 'user', content: text, tools: [] })
  const assistant = newAssistant()
  scrollToBottom()

  controller = new AbortController()
  try {
    await streamChat(
      { message: text, session_id: sessionId.value, scene: scene.value, env: env.value },
      (event) => applyEvent(assistant, event),
      controller.signal,
    )
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      assistant.error = (error as Error).message
    }
  } finally {
    assistant.pending = false
    sending.value = false
    controller = null
    scrollToBottom()
  }
}

function stop() {
  controller?.abort()
}

async function doConfirm(message: ChatMessage) {
  if (!message.confirm) return
  message.confirm.state = 'running'
  try {
    const result = await confirmAction(message.confirm.confirmId)
    message.confirm.state = result.ok ? 'done' : 'failed'
    message.confirm.result = result.text || (result.ok ? '已执行' : '执行失败')
  } catch (error) {
    message.confirm.state = 'failed'
    message.confirm.result = (error as Error).message
  }
  scrollToBottom()
}

function cancelConfirm(message: ChatMessage) {
  if (!message.confirm) return
  message.confirm.state = 'failed'
  message.confirm.result = '已取消，未执行'
}

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey) return
  event.preventDefault()
  void send()
}

function resetSession() {
  sessionId.value = ''
  messages.value = []
}

onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="agent">
    <header class="agent__bar">
      <div class="agent__title">
        <span class="agent__dot" :class="{ 'is-off': !status?.llm?.ok }" />
        <strong>FishMatrix Agent</strong>
        <span class="agent__sub">{{ statusText }}</span>
      </div>
      <div class="agent__controls">
        <select v-model="scene" class="agent__select" title="场景">
          <option v-for="item in scenes" :key="item.name" :value="item.name">{{ item.title }}</option>
        </select>
        <select v-model="env" class="agent__select" title="目标环境">
          <option value="prod">prod</option>
          <option value="test">test</option>
        </select>
        <button class="agent__ghost" title="新建会话" @click="resetSession">新会话</button>
      </div>
    </header>

    <div ref="scroller" class="agent__stream">
      <div v-if="messages.length === 0" class="agent__empty">
        <p>可以问我：</p>
        <ul>
          <li>tf-game 最近半小时有报错吗？trace_id 是 7d3f…</li>
          <li>发布流程是什么？回滚怎么做？</li>
          <li>tf-web 最新的流水线跑成功了吗？</li>
        </ul>
      </div>

      <article v-for="message in messages" :key="message.id" class="msg" :class="`msg--${message.role}`">
        <div class="msg__role">{{ message.role === 'user' ? '我' : 'Agent' }}</div>
        <div class="msg__body">
          <p v-if="message.content" class="msg__text">{{ message.content }}</p>
          <p v-else-if="message.pending" class="msg__text msg__text--muted">思考中…</p>

          <div v-for="(tool, index) in message.tools" :key="`${tool.callId}-${index}`" class="tool" :class="`tool--${tool.status}`">
            <button class="tool__head" @click="tool.expanded = !tool.expanded">
              <span class="tool__icon">{{ tool.status === 'running' ? '◐' : tool.status === 'error' || tool.ok === false ? '✕' : '✓' }}</span>
              <code>{{ tool.name }}</code>
              <span class="tool__meta">
                <template v-if="tool.status === 'running'">执行中…</template>
                <template v-else>
                  <template v-if="tool.rows !== undefined">{{ tool.rows }} 行</template>
                  <template v-if="tool.ms !== undefined"> · {{ tool.ms }}ms</template>
                </template>
              </span>
              <span class="tool__caret">{{ tool.expanded ? '▾' : '▸' }}</span>
            </button>
            <pre v-if="tool.expanded" class="tool__args">{{ JSON.stringify(tool.args, null, 2) }}</pre>
            <p v-if="tool.message" class="tool__error">{{ tool.message }}</p>
          </div>

          <div v-if="message.confirm" class="confirm" :class="`confirm--${message.confirm.state}`">
            <div class="confirm__head">⚠ 需要确认：{{ message.confirm.description }}</div>
            <div class="confirm__hint">确认后才会真正执行，{{ message.confirm.expiresIn }} 秒内有效</div>
            <div v-if="message.confirm.state === 'waiting'" class="confirm__actions">
              <button class="btn btn--danger" @click="doConfirm(message)">确认执行</button>
              <button class="btn" @click="cancelConfirm(message)">取消</button>
            </div>
            <p v-else-if="message.confirm.state === 'running'" class="confirm__hint">执行中…</p>
            <p v-else class="confirm__result">{{ message.confirm.result }}</p>
          </div>

          <p v-if="message.error" class="msg__error">{{ message.error }}</p>
          <div v-if="message.traceId" class="msg__trace">trace {{ message.traceId }}</div>
        </div>
      </article>
    </div>

    <footer class="agent__composer">
      <textarea
        v-model="input"
        class="agent__input"
        rows="3"
        placeholder="描述你的问题，Enter 发送，Shift+Enter 换行"
        @keydown.enter="onEnter"
      />
      <div class="agent__send">
        <button v-if="sending" class="btn btn--ghost" @click="stop">停止</button>
        <button class="btn btn--primary" :disabled="!canSend" @click="send">发送</button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.agent {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--fm-bg, #1e1e1e);
  color: var(--fm-fg, #d4d4d4);
}

.agent__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--fm-border, #3c3c3c);
  background: var(--fm-panel, #252526);
}

.agent__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.agent__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3fb950;
  display: inline-block;
}

.agent__dot.is-off {
  background: #f85149;
}

.agent__sub {
  font-size: 12px;
  color: #8b949e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent__controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.agent__select,
.agent__ghost {
  background: #2d2d30;
  color: inherit;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
}

.agent__stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent__empty {
  margin: auto;
  max-width: 520px;
  color: #8b949e;
  font-size: 13px;
  line-height: 1.8;
}

.agent__empty ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.msg {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
}

.msg__role {
  font-size: 12px;
  color: #8b949e;
  padding-top: 2px;
}

.msg--assistant .msg__role {
  color: #4ea1ff;
}

.msg__body {
  min-width: 0;
}

.msg__text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  font-size: 13px;
}

.msg__text--muted {
  color: #8b949e;
}

.msg__error {
  margin: 8px 0 0;
  color: #f85149;
  font-size: 12px;
}

.msg__trace {
  margin-top: 6px;
  font-size: 11px;
  color: #6e7681;
}

.tool {
  margin-top: 8px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
  overflow: hidden;
}

.tool--running {
  border-color: #1f6feb;
}

.tool--error {
  border-color: #f85149;
}

.tool__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.tool__icon {
  color: #3fb950;
}

.tool--running .tool__icon {
  color: #4ea1ff;
}

.tool--error .tool__icon {
  color: #f85149;
}

.tool__meta {
  color: #8b949e;
  margin-left: auto;
}

.tool__caret {
  color: #6e7681;
}

.tool__args {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid #3c3c3c;
  font-size: 11px;
  color: #9cdcfe;
  overflow-x: auto;
}

.tool__error {
  margin: 0;
  padding: 6px 10px;
  color: #f85149;
  font-size: 12px;
}

.confirm {
  margin-top: 10px;
  border: 1px solid #d29922;
  border-radius: 6px;
  padding: 10px 12px;
  background: rgba(210, 153, 34, 0.08);
}

.confirm--done {
  border-color: #3fb950;
  background: rgba(63, 185, 80, 0.08);
}

.confirm--failed {
  border-color: #f85149;
  background: rgba(248, 81, 73, 0.08);
}

.confirm__head {
  font-size: 13px;
  font-weight: 600;
}

.confirm__hint {
  font-size: 12px;
  color: #8b949e;
  margin-top: 4px;
}

.confirm__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.confirm__result {
  margin: 8px 0 0;
  font-size: 12px;
  white-space: pre-wrap;
}

.agent__composer {
  border-top: 1px solid var(--fm-border, #3c3c3c);
  padding: 10px 16px 14px;
  background: var(--fm-panel, #252526);
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.agent__input {
  flex: 1;
  resize: none;
  background: #1e1e1e;
  color: inherit;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
}

.agent__send {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn {
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: inherit;
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  background: #0e639c;
  border-color: #1177bb;
  color: #fff;
}

.btn--danger {
  background: #a1260d;
  border-color: #c33;
  color: #fff;
}

.btn--ghost {
  background: transparent;
}
</style>
