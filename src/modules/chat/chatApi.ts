import { getJson } from '@/lib/http'
import type { ChatGroup, ChatMessage, OnlineMember } from './types'

export async function fetchGroups(): Promise<ChatGroup[]> {
  const data = await getJson<{ groups: ChatGroup[] }>('/api/v1/chat/groups')
  return data.groups ?? []
}

export async function fetchGroupHistory(groupId: string, limit = 20): Promise<ChatMessage[]> {
  const query = new URLSearchParams({ limit: String(limit) })
  const data = await getJson<{ messages: ChatMessage[] }>(
    `/api/v1/chat/groups/${encodeURIComponent(groupId)}/history?${query.toString()}`,
  )
  return data.messages ?? []
}

export async function fetchMembers(groupId: string): Promise<OnlineMember[]> {
  const data = await getJson<{ members: OnlineMember[] }>(
    `/api/v1/chat/groups/${encodeURIComponent(groupId)}/members`,
  )
  return data.members ?? []
}

export async function fetchDirectHistory(
  userId: string,
  peerUserId: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const query = new URLSearchParams({ userId, limit: String(limit) })
  const data = await getJson<{ messages: ChatMessage[] }>(
    `/api/v1/chat/dm/${encodeURIComponent(peerUserId)}/history?${query.toString()}`,
  )
  return data.messages ?? []
}
