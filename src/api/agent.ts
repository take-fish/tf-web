import { deleteJson, getJson, postForm, postJson, putJson } from '@/lib/http'
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
  const response = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`对话请求失败（HTTP ${response.status}）${text ? `：${text.slice(0, 200)}` : ''}`)
  }
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
  qdrant: { ok: boolean; url: string }
  tools: number
  embedding: { model: string; dim: number }
}

export function fetchStatus(): Promise<{ code: number; data: StatusInfo }> {
  return getJson('/api/v1/agent/status')
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
  created_at: string | null
}

export interface KbDoc {
  id: string
  title: string
  format: string
  size_bytes: number
  status: 'pending' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'failed'
  chunk_count: number
  error: string
  created_at: string | null
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

export function removeKb(kbId: string): Promise<{ code: number; msg: string }> {
  return deleteJson(`${BASE}/kb/${kbId}`)
}

export function listDocs(kbId: string): Promise<{ code: number; data: KbDoc[] }> {
  return getJson(`${BASE}/kb/${kbId}/docs`)
}

export function uploadDoc(kbId: string, file: File, title = ''): Promise<{ code: number; data: { id: string } }> {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title || file.name.replace(/\.[^.]+$/, ''))
  return postForm(`${BASE}/kb/${kbId}/docs`, form)
}

export function rebuildDoc(kbId: string, docId: string): Promise<{ code: number }> {
  return postJson(`${BASE}/kb/${kbId}/docs/${docId}/rebuild`, {})
}

export function removeDoc(kbId: string, docId: string): Promise<{ code: number }> {
  return deleteJson(`${BASE}/kb/${kbId}/docs/${docId}`)
}

export function listChunks(kbId: string, docId: string): Promise<{ code: number; data: KbChunk[] }> {
  return getJson(`${BASE}/kb/${kbId}/docs/${docId}/chunks`)
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
