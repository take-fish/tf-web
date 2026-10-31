import { authFetch, deleteJson, getJson, patchJson, postForm, postJson, putJson, toApiError } from '@/lib/http'
import { getAuthToken } from '@/lib/authToken'

const BASE = '/api/v1/agent'

export interface AgentEvent {
  type: 'start' | 'delta' | 'tool' | 'confirm_required' | 'usage' | 'done' | 'error'
  text?: string
  name?: string
  call_id?: string
  status?: 'running' | 'done' | 'error'
  args?: Record<string, unknown>
  tool?: string
  data?: Record<string, unknown>
  rows?: number
  ms?: number
  message?: string
  ok?: boolean
  description?: string
  confirm_id?: string
  expires_in?: number
  session_id?: string
  pending_confirm?: boolean
  trace_id?: string
  tools?: string[]
  usage?: Record<string, number>
}

export interface ChatPayload {
  message: string
  session_id?: string
  scene?: string
  env?: 'prod' | 'test'
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** 用 fetch + ReadableStream 消费 SSE（EventSource 不能带 Authorization 头）。 */
export async function streamChat(
  payload: ChatPayload,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  // 走统一请求封装：带上 Authorization、401 会触发登录态失效流程、错误体按标准信封解析
  const response = await authFetch(`${BASE}/chat`, { method: 'POST', body: JSON.stringify(payload), signal })
  if (!response.ok) throw await toApiError(response)
  if (!response.body) throw new Error('当前浏览器不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const chunk = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          onEvent(JSON.parse(line.slice(6)) as AgentEvent)
        } catch {
          // 半截 JSON 忽略，等下一个分片
        }
      }
      index = buffer.indexOf('\n\n')
    }
  }
}

export interface ConfirmResult {
  ok: boolean
  text: string
  events: AgentEvent[]
}

/** 确认写操作（发布/重启），返回服务端的执行结果。 */
export async function confirmAction(confirmId: string): Promise<ConfirmResult> {
  const response = await fetch(`${BASE}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ confirm_id: confirmId }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`确认失败（HTTP ${response.status}）${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  const raw = await response.text()
  const events: AgentEvent[] = []
  let text = ''
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const event = JSON.parse(line.slice(6)) as AgentEvent
      events.push(event)
      if (event.type === 'done' && event.text) text = event.text
      if (event.type === 'error' && event.message) text = event.message
    } catch {
      // 忽略坏行
    }
  }
  return { ok: events.some((e) => e.type === 'done'), text, events }
}

export interface StatusInfo {
  llm: { ok: boolean; model: string; base_url: string; error: string }
  db: { ok: boolean }
  /** 向量库状态：backend 目前固定 es（Qdrant 已下线） */
  vector?: { backend: string; endpoint: string; index: string; ok: boolean; hybrid: boolean }
  /** 旧字段，后端保留兼容；新代码读 vector */
  qdrant?: { ok: boolean; url: string }
  tools: number
  embedding: { model: string; dim: number }
}

export function fetchStatus(): Promise<{ code: number; data: StatusInfo }> {
  return getJson('/api/v1/agent/status')
}

/** Agent 展示配置：名称 / 3D 形象 / 问候语 / 推荐问题 */
export interface AgentAvatarConfig {
  style: 'orb' | 'cube' | 'ring'
  primary: string
  accent: string
  size: number
  spin: boolean
}

export interface AgentProfile {
  name: string
  tagline: string
  avatar: AgentAvatarConfig
  greeting: string
  suggestions: string[]
  theme: string
  show_status_bar: boolean
}

export function fetchProfile(): Promise<{ code: number; data: AgentProfile }> {
  return getJson(`${BASE}/profile`)
}

export function saveProfile(profile: AgentProfile): Promise<{ code: number; data: AgentProfile }> {
  return putJson(`${BASE}/profile`, profile)
}
export function fetchScenes(): Promise<{ code: number; data: { name: string; title: string; tools: string[] }[] }> {
  return getJson('/api/v1/agent/scenes')
}

// ---------------- 知识库 ----------------

export interface KbItem {
  id: string
  name: string
  description: string
  embedding_model: string
  dim: number
  doc_count: number
  approved_count: number
  pending_review: number
  created_at: string | null
}

export interface KbCategory {
  id: string
  name: string
  description: string
  sort: number
  doc_count: number
  created_at: string | null
}

/** 索引状态（status）与审核状态（review_status）是两个维度。 */
export type KbDocStatus =
  | 'waiting'
  | 'pending'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'failed'
  | 'rejected'

export interface KbDoc {
  id: string
  kb_id: string
  category_id: string | null
  title: string
  source?: string
  format: string
  size_bytes: number
  status: KbDocStatus
  review_status: 'pending' | 'approved' | 'rejected'
  review_note: string
  reviewed_by: number | null
  reviewed_at: string | null
  chunk_count: number
  error: string
  created_by: number | null
  created_at: string | null
  /** 详情接口才返回的正文 */
  content?: string
  /** 对普通用户是否可见（默认 true），仅管理员可改 */
  visible?: boolean
}

export interface KbChunk {
  id: string
  seq: number
  text: string
  tokens: number
}

export interface KbHit {
  doc_id: string
  kb_id: string
  title: string
  seq: number
  text: string
  score: number
}

export function listKbs(): Promise<{ code: number; data: KbItem[] }> {
  return getJson(`${BASE}/kb`)
}

export function createKb(name: string, description = ''): Promise<{ code: number; data: { id: string } }> {
  return postJson(`${BASE}/kb`, { name, description })
}

export function updateKb(
  kbId: string,
  payload: { name?: string; description?: string },
): Promise<{ code: number; data: { id: string; name: string; description: string; visible: boolean } }> {
  return patchJson(`${BASE}/kb/${kbId}`, payload)
}

export function removeKb(kbId: string): Promise<{ code: number; msg: string }> {
  return deleteJson(`${BASE}/kb/${kbId}`)
}

export function listDocs(kbId: string, review = ''): Promise<{ code: number; data: KbDoc[] }> {
  const suffix = review ? `?review=${encodeURIComponent(review)}` : ''
  return getJson(`${BASE}/kb/${kbId}/docs${suffix}`)
}

export function uploadDoc(
  kbId: string,
  file: File,
  title = '',
  categoryId = '',
): Promise<{ code: number; data: { id: string; status: string; review_status: string } }> {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title || file.name.replace(/\.[^.]+$/, ''))
  if (categoryId) form.append('category_id', categoryId)
  return postForm(`${BASE}/kb/${kbId}/docs`, form)
}

/** 管理员审核：approve 通过后自动建索引，reject 驳回后不进知识库。 */
export function reviewDoc(
  kbId: string,
  docId: string,
  action: 'approve' | 'reject',
  note = '',
): Promise<{ code: number; data: { id: string; review_status: string } }> {
  return postJson(`${BASE}/kb/${kbId}/docs/${docId}/review`, { action, note })
}

/** 管理员：整库重建索引（只重建审核通过的文档）。 */
export function reindexKb(kbId: string): Promise<{ code: number; data: { queued: number } }> {
  return postJson(`${BASE}/kb/${kbId}/reindex`, {})
}

export function rebuildDoc(kbId: string, docId: string): Promise<{ code: number }> {
  return postJson(`${BASE}/kb/${kbId}/docs/${docId}/rebuild`, {})
}

export function getDoc(kbId: string, docId: string): Promise<{ code: number; data: KbDoc }> {
  return getJson(`${BASE}/kb/${kbId}/docs/${docId}`)
}

export function updateDoc(
  kbId: string,
  docId: string,
  payload: { title?: string; content?: string; visible?: boolean },
): Promise<{ code: number; data: KbDoc }> {
  return putJson(`${BASE}/kb/${kbId}/docs/${docId}`, payload)
}

export function removeDoc(kbId: string, docId: string): Promise<{ code: number }> {
  return deleteJson(`${BASE}/kb/${kbId}/docs/${docId}`)
}

export function listChunks(kbId: string, docId: string): Promise<{ code: number; data: KbChunk[] }> {
  return getJson(`${BASE}/kb/${kbId}/docs/${docId}/chunks`)
}

export function listCategories(): Promise<{ code: number; data: KbCategory[] }> {
  return getJson(`${BASE}/kb/categories`)
}

export function createCategory(
  name: string,
  description = '',
  sort = 0,
): Promise<{ code: number; data: { id: string } }> {
  return postJson(`${BASE}/kb/categories`, { name, description, sort })
}

export function updateCategory(
  id: string,
  payload: { name?: string; description?: string; sort?: number },
): Promise<{ code: number }> {
  return patchJson(`${BASE}/kb/categories/${id}`, payload)
}

export function removeCategory(id: string): Promise<{ code: number }> {
  return deleteJson(`${BASE}/kb/categories/${id}`)
}

export function searchKb(query: string, kbIds: string[] = [], topK = 8): Promise<{ code: number; data: KbHit[] }> {
  return postJson(`${BASE}/kb/search`, { query, kb_ids: kbIds, top_k: topK })
}

// ---------------- 管理台 ----------------

export interface ToolCallRow {
  id: number
  trace_id: string
  user_id: number
  scene: string
  env: string
  tool: string
  args_digest: string
  ok: boolean
  rows_affected: number | null
  ms: number
  need_confirm: boolean
  confirmed_by: number | null
  created_at: string | null
}

export interface ToolConfigRow {
  name: string
  description: string
  read_only: boolean
  enabled: boolean
  timeout_ms: number
  roles: string[]
  configured: boolean
}

export interface AdminStats {
  total_calls: number
  failed_calls: number
  sessions: number
  by_tool: Record<string, number>
}

export function listToolCalls(params: {
  limit?: number
  tool?: string
  onlyFailed?: boolean
  traceId?: string
}): Promise<{ code: number; data: { total: number; items: ToolCallRow[] } }> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 50))
  if (params.tool) query.set('tool', params.tool)
  if (params.onlyFailed) query.set('only_failed', 'true')
  if (params.traceId) query.set('trace_id', params.traceId)
  return getJson(`${BASE}/admin/tool-calls?${query.toString()}`)
}

export function listToolConfigs(): Promise<{ code: number; data: ToolConfigRow[] }> {
  return getJson(`${BASE}/admin/tools`)
}

export function updateToolConfig(
  name: string,
  payload: { enabled?: boolean; timeout_ms?: number; roles?: string[] },
): Promise<{ code: number }> {
  return putJson(`${BASE}/admin/tools/${name}`, payload)
}

export function fetchAdminStats(): Promise<{ code: number; data: AdminStats }> {
  return getJson(`${BASE}/admin/stats`)
}
