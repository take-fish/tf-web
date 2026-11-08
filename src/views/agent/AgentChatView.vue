<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  confirmAction,
  fetchProfile,
  fetchStatus,
  getSession,
  listSessions,
  removeSession,
  streamChat,
  type AgentEvent,
  type AgentProfile,
  type SessionSummary,
  type StatusInfo,
} from '@/api/agent'
import AgentAvatar from '@/components/agent/AgentAvatar.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { formatApiError } from '@/lib/http'
import { pushToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/auth'

import { parseRetrievalMetrics, type RetrievalMetrics } from './retrievalMetrics'
import { useAgentImages, type DraftImage } from './useAgentImages'

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
  images?: DraftImage[]
  traceId?: string
  tools: ToolCard[]
  error?: string
  pending?: boolean
  /** 本次回答的知识库检索近似指标（最后一次 search_kb 的结果） */
  retrieval?: RetrievalMetrics | null
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
const status = ref<StatusInfo | null>(null)
const profile = ref<AgentProfile | null>(null)
const auth = useAuthStore()
const metaError = ref('')
const sessions = ref<SessionSummary[]>([])
const showHistory = ref(false)
const historyLoading = ref(false)
const scroller = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const router = useRouter()
let controller: AbortController | null = null
let msgSeq = 1

const {
  images: draftImages,
  preview: imagePreview,
  busy: imageBusy,
  addFiles,
  removeImage,
  clearImages,
  openPreview,
  closePreview,
  toChatImages,
  formatBytes,
} = useAgentImages()

const DEFAULT_IMAGE_PROMPT = '请识别并说明这些图片的内容。'


const statusText = computed(() => {
  if (!status.value) return '检测中…'
  const parts: string[] = []
  parts.push(status.value.db.ok ? '审计库 OK' : '审计库不可用')
  parts.push((status.value.vector ?? status.value.qdrant)?.ok ? '向量库 OK' : '向量库不可用')
  return parts.join(' · ')
})

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

const FALLBACK_SUGGESTIONS = [
  '发布流程是什么？回滚怎么做？',
  '测试环境出问题，第一步看什么？',
  'tf-game 最近半小时有报错吗？',
  '把 tf-game 在测试环境重启一下',
]

const emptySuggestions = computed(() => {
  const configured = profile.value?.suggestions ?? []
  return configured.length ? configured : FALLBACK_SUGGESTIONS
})

const canSend = computed(
  () =>
    (input.value.trim().length > 0 || draftImages.value.length > 0) &&
    !sending.value &&
    !imageBusy.value,
)

function scrollToBottom() {
  void nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

async function loadMeta() {
  metaError.value = ''
  try {
    status.value = (await fetchStatus()).data
  } catch (error) {
    status.value = null
    metaError.value = formatApiError(error, '模型状态获取失败')
  }
  try {
    profile.value = (await fetchProfile()).data
  } catch {
    profile.value = null
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
      if (event.name === 'search_kb' && event.status === 'done') {
        message.retrieval = parseRetrievalMetrics(event.data)
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

async function send(preset?: string) {
  if (sending.value || imageBusy.value) return
  const text = (preset ?? input.value).trim()
  const attachments = draftImages.value
  if (!text && attachments.length === 0) return
  const message = text || DEFAULT_IMAGE_PROMPT
  const payloadImages = toChatImages()
  const sentImages = attachments.length ? [...attachments] : undefined

  input.value = ''
  clearImages()
  sending.value = true
  messages.value.push({ id: msgSeq++, role: 'user', content: message, images: sentImages, tools: [] })
  const assistant = newAssistant()
  scrollToBottom()

  controller = new AbortController()
  try {
    await streamChat(
      {
        message,
        session_id: sessionId.value,
        ...(payloadImages.length ? { images: payloadImages } : {}),
      },
      (event) => applyEvent(assistant, event),
      controller.signal,
    )
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      assistant.error = formatApiError(error, '对话失败')
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
    message.confirm.result = formatApiError(error, '执行失败')
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

function pickImages() {
  fileInput.value?.click()
}

async function onFilesPicked(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  target.value = ''
  if (files.length) await addFiles(files)
}

/** 从剪贴板取出图片文件；普通文本粘贴不受影响。 */
function clipboardImageFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData
  if (!data) return []
  const files: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (!files.length && data.files?.length) {
    files.push(...Array.from(data.files).filter((file) => file.type.startsWith('image/')))
  }
  return files
}

async function onPasteImages(event: ClipboardEvent) {
  const files = clipboardImageFiles(event)
  if (!files.length) return
  event.preventDefault()
  await addFiles(files)
}

function onPreviewMessageImage(image: DraftImage, index: number) {
  openPreview(image, `图片 ${index + 1} · ${image.name}`)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && imagePreview.value) closePreview()
}

function resetSession() {
  sessionId.value = ''
  messages.value = []
  clearImages()
  closePreview()
}

/** 打开/关闭历史会话抽屉。 */
async function openHistory() {
  showHistory.value = !showHistory.value
  if (!showHistory.value) return
  historyLoading.value = true
  try {
    sessions.value = (await listSessions(30)).data
  } catch (err) {
    pushToast(formatApiError(err, '历史会话加载失败'))
    sessions.value = []
  } finally {
    historyLoading.value = false
  }
}

/** 载入历史会话，继续在同一个 session 里对话。 */
async function resumeSession(item: SessionSummary) {
  try {
    const { data } = await getSession(item.id)
    sessionId.value = data.id
    messages.value = data.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        id: msgSeq++,
        role: message.role as 'user' | 'assistant',
        content: message.content,
        tools: [],
      }))
    showHistory.value = false
    scrollToBottom()
  } catch (err) {
    pushToast(formatApiError(err, '会话载入失败'))
  }
}

async function deleteSession(item: SessionSummary) {
  try {
    await removeSession(item.id)
    sessions.value = sessions.value.filter((session) => session.id !== item.id)
    if (sessionId.value === item.id) resetSession()
    pushToast('会话已删除', 'success')
  } catch (err) {
    pushToast(formatApiError(err, '删除会话失败'))
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  controller?.abort()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section class="agent">
    <header class="agent__bar">
      <div class="agent__title">
        <span class="agent__dot" :class="{ 'is-off': !status?.llm?.ok }" />
        <strong>{{ profile?.name || 'FishMatrix Agent' }}</strong>
        <span v-if="profile?.show_status_bar !== false" class="agent__sub">{{ statusText }}</span>
      </div>
      <div class="agent__controls">
        <button class="agent__ghost" title="历史会话" @click="openHistory">历史会话</button>
        <button class="agent__ghost" title="知识库管理" @click="router.push('/agent/kb')">知识库</button>
        <button v-if="auth.hasPermission('agent.kb.manage')" class="agent__ghost" title="知识库检索评测" @click="router.push('/agent/eval')">评测</button>
        <button v-if="auth.hasPermission('agent.profile.manage')" class="agent__ghost" title="试衣间：改 Agent 的样子" @click="router.push('/agent/profile')">试衣间</button>
        <button class="agent__ghost" title="新建会话" @click="resetSession">新会话</button>
      </div>
    </header>

    <div v-if="showHistory" class="history">
      <header class="history__head">
        <strong>历史会话</strong>
        <span class="history__hint">{{ sessions.length }} 条</span>
        <button class="btn btn--sm" @click="showHistory = false">关闭</button>
      </header>
      <p v-if="historyLoading" class="history__empty">加载中…</p>
      <p v-else-if="!sessions.length" class="history__empty">还没有历史会话，聊一句就会出现在这里。</p>
      <ul v-else class="history__list">
        <li v-for="item in sessions" :key="item.id" :class="{ 'is-active': item.id === sessionId }">
          <button class="history__item" @click="resumeSession(item)">
            <span class="history__title">{{ item.title }}</span>
            <span class="history__meta">
              {{ item.message_count }} 条消息 · {{ item.updated_at?.replace('T', ' ').slice(0, 16) }}
            </span>
          </button>
          <button class="history__del" title="删除会话" @click="deleteSession(item)">×</button>
        </li>
      </ul>
    </div>

    <ErrorBanner v-if="metaError" :message="metaError" retryable @retry="loadMeta" @close="metaError = ''" />

    <div ref="scroller" class="agent__stream">
      <div v-if="messages.length === 0" class="agent__empty">
        <AgentAvatar
          v-if="profile"
          :style="profile.avatar.style"
          :primary="profile.avatar.primary"
          :accent="profile.avatar.accent"
          :size="profile.avatar.size"
          :spin="profile.avatar.spin"
        />
        <p v-if="profile?.tagline" class="agent__tagline">{{ profile.tagline }}</p>
        <p class="agent__greeting">
          {{ profile?.greeting || '你可以直接说想查什么、想做什么，我来判断用哪个工具。' }}
        </p>
        <div class="agent__chips">
          <button v-for="(item, index) in emptySuggestions" :key="index" class="agent__chip" :title="item" @click="send(item)">
            {{ item }}
          </button>
        </div>
      </div>

      <article v-for="message in messages" :key="message.id" class="msg" :class="`msg--${message.role}`">
        <div class="msg__role">{{ message.role === 'user' ? '我' : 'Agent' }}</div>
        <div class="msg__body">
          <div v-if="message.images?.length" class="msg__images">
            <button
              v-for="(image, index) in message.images"
              :key="image.id"
              type="button"
              class="msg__image"
              :title="`查看 ${image.name}`"
              @click="onPreviewMessageImage(image, index)"
            >
              <img :src="image.dataUrl" :alt="image.name" />
            </button>
          </div>
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

          <div
            v-if="message.role === 'assistant' && !message.pending && message.retrieval"
            class="answer-metrics"
            aria-label="知识库检索指标"
          >
            <div
              class="answer-metrics__tile"
              title="召回率 = 系统找回的相关片段 ÷ 知识库里所有相关片段（当前按关键词覆盖规则判定）"
            >
              <span class="answer-metrics__label">召回率</span>
              <strong class="answer-metrics__value">{{ percent(message.retrieval.recall) }}</strong>
              <span class="answer-metrics__hint">全库相关 {{ message.retrieval.relevant }} 条</span>
            </div>
            <div
              class="answer-metrics__tile"
              title="精确率 = 系统找回的相关片段 ÷ 系统本次找回的片段总数"
            >
              <span class="answer-metrics__label">精确率</span>
              <strong class="answer-metrics__value">{{ percent(message.retrieval.precision) }}</strong>
              <span class="answer-metrics__hint">{{ message.retrieval.matched }}/{{ message.retrieval.retrieved }} 片段相关</span>
            </div>
            <p class="answer-metrics__note">
              召回率 = 系统找回的相关片段 ÷ 知识库里所有相关片段；精确率 = 系统找回的相关片段 ÷
              系统本次找回的片段总数。相关由关键词覆盖规则判定。
            </p>
          </div>
        </div>
      </article>
    </div>

    <footer class="agent__composer">
      <div v-if="draftImages.length || imageBusy" class="agent__attachments" aria-label="待发送图片">
        <div v-for="(image, index) in draftImages" :key="image.id" class="attach">
          <button
            type="button"
            class="attach__open"
            :title="`预览 ${image.name}`"
            @click="openPreview(image, `图片 ${index + 1} · ${image.name}`)"
          >
            <img :src="image.dataUrl" :alt="image.name" />
          </button>
          <span class="attach__meta">{{ formatBytes(image.bytes) }}</span>
          <button type="button" class="attach__remove" title="移除图片" @click="removeImage(image.id)">×</button>
        </div>
        <span v-if="imageBusy" class="agent__hint">处理中…</span>
      </div>
      <div class="agent__composer-row">
        <button
          class="agent__attach"
          type="button"
          aria-label="添加图片"
          title="添加图片（也可直接 Ctrl+V 粘贴）"
          :disabled="sending || imageBusy"
          @click="pickImages"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9" r="1.5" />
            <path d="m21 15-4.5-4.5L7 20" />
          </svg>
        </button>
        <input
          ref="fileInput"
          class="agent__file"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          @change="onFilesPicked"
        />
        <textarea
          v-model="input"
          class="agent__input"
          rows="3"
          placeholder="描述你的问题，Enter 发送，Shift+Enter 换行；可直接 Ctrl+V 粘贴截图"
          @keydown.enter="onEnter"
          @paste="onPasteImages"
        />
        <div class="agent__send">
          <button v-if="sending" class="btn btn--ghost" @click="stop">停止</button>
          <button class="btn btn--primary" :disabled="!canSend" @click="send()">发送</button>
        </div>
      </div>
    </footer>

    <div v-if="imagePreview" class="agent-preview" @click.self="closePreview">
      <figure class="agent-preview__frame">
        <img :src="imagePreview.src" alt="图片预览" />
        <figcaption>{{ imagePreview.label }}</figcaption>
      </figure>
      <button class="agent-preview__close" @click="closePreview">关闭</button>
    </div>
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

.agent__ghost {
  background: #2d2d30;
  color: inherit;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
}

.agent__ghost {
  cursor: pointer;
}

.agent__ghost:hover {
  border-color: #4a4a4a;
  background: #333337;
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
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #8b949e;
  font-size: 13px;
  line-height: 1.8;
  text-align: center;
  padding: 12px 0 4px;
}

.agent__tagline {
  margin: 0;
  font-size: 12px;
  color: #6e7681;
  letter-spacing: 0.04em;
}

.agent__greeting {
  margin: 0;
  max-width: 460px;
  color: #b8c0c8;
}

.agent__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

.agent__chip {
  border: 1px solid #30363d;
  background: #161b22;
  color: #b8c0c8;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.agent__chip:hover {
  border-color: #58a6ff;
  color: #e6edf3;
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
  flex-direction: column;
  gap: 8px;
}

.agent__composer-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.agent__attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.attach {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.attach__open {
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  overflow: hidden;
  background: #1e1e1e;
  cursor: zoom-in;
}

.attach__open img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.attach__meta {
  font-size: 10px;
  color: #8b949e;
}

.attach__remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: #d4d4d4;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.attach__remove:hover {
  color: #f85149;
  border-color: #f85149;
}

.agent__hint {
  font-size: 11px;
  color: #8b949e;
}

.agent__file {
  display: none;
}

.agent__attach {
  flex: 0 0 auto;
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #8b949e;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.agent__attach:hover:not(:disabled) {
  border-color: #3c3c3c;
  background: #2d2d30;
  color: #d4d4d4;
}

.agent__attach:focus-visible {
  outline: 2px solid #4ea1ff;
  outline-offset: 1px;
}

.agent__attach:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.answer-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.answer-metrics__tile {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 118px;
  padding: 7px 12px 8px;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #1b1f24;
}

.answer-metrics__label {
  font-size: 11px;
  color: #8b949e;
}

.answer-metrics__value {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.25;
  color: #e6edf3;
  font-variant-numeric: tabular-nums;
}

.answer-metrics__hint {
  font-size: 10px;
  color: #6e7681;
}

.answer-metrics__note {
  flex-basis: 100%;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: #6e7681;
}

.msg__images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.msg__image {
  width: 120px;
  height: 120px;
  padding: 0;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  overflow: hidden;
  background: #1e1e1e;
  cursor: zoom-in;
}

.msg__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.msg__image:hover {
  border-color: #58a6ff;
}

.agent-preview {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
}

.agent-preview__frame {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: min(92vw, 1400px);
  max-height: 82vh;
}

.agent-preview__frame img {
  max-width: 92vw;
  max-height: 76vh;
  object-fit: contain;
  border-radius: 6px;
  background: #111;
}

.agent-preview__frame figcaption {
  font-size: 12px;
  color: #b8c0c8;
  word-break: break-all;
}

.agent-preview__close {
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: inherit;
  border-radius: 4px;
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
}

.agent-preview__close:hover {
  border-color: #4a4a4a;
  background: #333337;
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
.history {
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  background: #252526;
  margin: 10px 16px 0;
  padding: 10px 12px;
  max-height: 280px;
  overflow: auto;
}

.history__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
}

.history__hint {
  color: #8b8b8b;
  font-size: 11px;
  flex: 1;
}

.history__empty {
  margin: 0;
  color: #8b8b8b;
  font-size: 12px;
}

.history__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history__list li {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 6px 8px;
}

.history__list li.is-active {
  border-color: #58a6ff;
}

.history__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.history__title {
  font-size: 13px;
  color: #dbe3ea;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.history__meta {
  font-size: 11px;
  color: #8b8b8b;
}

.history__del {
  border: 1px solid #3c3c3c;
  background: transparent;
  color: #9da7b3;
  border-radius: 4px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  line-height: 1;
}

.history__del:hover {
  color: #f85149;
  border-color: #f85149;
}

</style>
