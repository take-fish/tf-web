import { getBlob, getJson, postForm, request } from '@/lib/http'
import type {
  ChatGroup,
  ChatImage,
  ChatMessage,
  HistoryPage,
  HistoryQuery,
  OnlineMember,
  ReadPayload,
  UnreadSummary,
  WsTicket,
} from './types'

function historyQuery(query: HistoryQuery, fallbackLimit: number): string {
  const params = new URLSearchParams({ limit: String(query.limit ?? fallbackLimit) })
  if (query.beforeSeq != null) params.set('beforeSeq', String(query.beforeSeq))
  if (query.afterSeq != null) params.set('afterSeq', String(query.afterSeq))
  return params.toString()
}

function normalizePage(page: Partial<HistoryPage> | null | undefined): HistoryPage {
  return {
    messages: page?.messages ?? [],
    hasMore: page?.hasMore ?? false,
    nextBeforeSeq: page?.nextBeforeSeq ?? null,
  }
}

export async function fetchGroups(): Promise<ChatGroup[]> {
  const data = await getJson<{ groups: ChatGroup[] }>('/api/v1/chat/groups')
  return data.groups ?? []
}

export async function fetchGroupHistory(
  groupId: string,
  query: HistoryQuery = {},
): Promise<HistoryPage> {
  const page = await getJson<HistoryPage>(
    `/api/v1/chat/groups/${encodeURIComponent(groupId)}/history?${historyQuery(query, 20)}`,
  )
  return normalizePage(page)
}

export async function fetchDirectHistory(
  peerUserId: string,
  query: HistoryQuery = {},
): Promise<HistoryPage> {
  const page = await getJson<HistoryPage>(
    `/api/v1/chat/dm/${encodeURIComponent(peerUserId)}/history?${historyQuery(query, 50)}`,
  )
  return normalizePage(page)
}

export async function searchGroup(
  groupId: string,
  keyword: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const params = new URLSearchParams({ q: keyword, limit: String(limit) })
  const data = await getJson<{ messages: ChatMessage[] }>(
    `/api/v1/chat/groups/${encodeURIComponent(groupId)}/search?${params.toString()}`,
  )
  return data.messages ?? []
}

export async function searchDirect(
  peerUserId: string,
  keyword: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const params = new URLSearchParams({ q: keyword, limit: String(limit) })
  const data = await getJson<{ messages: ChatMessage[] }>(
    `/api/v1/chat/dm/${encodeURIComponent(peerUserId)}/search?${params.toString()}`,
  )
  return data.messages ?? []
}

export async function fetchMembers(groupId: string): Promise<OnlineMember[]> {
  const data = await getJson<{ members: OnlineMember[] }>(
    `/api/v1/chat/groups/${encodeURIComponent(groupId)}/members`,
  )
  return data.members ?? []
}

export async function fetchOnline(): Promise<OnlineMember[]> {
  const data = await getJson<{ members: OnlineMember[] }>('/api/v1/chat/online')
  return data.members ?? []
}

export async function fetchUnread(): Promise<UnreadSummary> {
  const data = await getJson<UnreadSummary>('/api/v1/chat/unread')
  return {
    groups: data.groups ?? {},
    dms: data.dms ?? {},
    total: data.total ?? 0,
  }
}

export async function markRead(payload: ReadPayload): Promise<void> {
  await request<void>('/api/v1/chat/read', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function recallMessage(messageId: string): Promise<ChatMessage> {
  const data = await request<{ message: ChatMessage }>(
    `/api/v1/chat/messages/${encodeURIComponent(messageId)}/recall`,
    { method: 'POST' },
  )
  return data.message
}

export async function fetchWsTicket(): Promise<WsTicket> {
  return request<WsTicket>('/api/v1/chat/ws-ticket', { method: 'POST' })
}

/** 上传私聊图片，返回持久化元数据；随后通过 WebSocket 发送其 ID。 */
export async function uploadImage(file: File): Promise<ChatImage> {
  const form = new FormData()
  form.append('file', file)
  const data = await postForm<{ image: ChatImage }>('/api/v1/chat/images', form)
  return data.image
}

/** 带鉴权拉取私聊图片二进制。 */
export function fetchImageBlob(imageId: string): Promise<Blob> {
  return getBlob(`/api/v1/chat/images/${encodeURIComponent(imageId)}`)
}
