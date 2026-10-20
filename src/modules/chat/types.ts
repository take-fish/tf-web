export type ChatKind = 'text' | 'ascii'

export interface ChatMessage {
  id: string
  seq: number
  groupId: string | null
  fromUserId: string
  fromNickname: string
  fromNode: string
  toUserId: string | null
  content: string
  kind: ChatKind
  ts: number
  clientMsgId: string | null
  recalled: boolean
}

export interface ChatGroup {
  id: string
  name: string
  description: string
  onlineCount: number
  unread: number
}

export interface OnlineMember {
  groupId: string | null
  userId: string
  nickname: string
  node: string
  joinedAt: number
}

export interface ChatUser {
  id: string
  nickname: string
  node: string
}

export interface HistoryPage {
  messages: ChatMessage[]
  hasMore: boolean
  nextBeforeSeq: number | null
}

export interface HistoryQuery {
  limit?: number
  beforeSeq?: number | null
  afterSeq?: number | null
}

export interface UnreadSummary {
  groups: Record<string, number>
  dms: Record<string, number>
  total: number
}

export interface ReadPayload {
  groupId?: string
  peerUserId?: string
  seq?: number
}

export interface WsTicket {
  ticket: string
  expiresIn: number
}

export type ChatStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'

export interface ReadyFrame {
  type: 'ready'
  user: ChatUser
  serverTime: number
}

export interface PresenceFrame {
  type: 'presence'
  groupId: string
  members: OnlineMember[]
}

export interface MessageFrame {
  type: 'message'
  message: ChatMessage
}

export interface DmFrame {
  type: 'dm'
  message: ChatMessage
}

export interface OfflineFrame {
  type: 'dm_offline'
  messages: ChatMessage[]
}

export interface RecalledFrame {
  type: 'recalled'
  message: ChatMessage
  byUserId: string
}

export interface PongFrame {
  type: 'pong'
  ts: number
}

export interface ErrorFrame {
  type: 'error'
  code: string
  message: string
  clientMsgId?: string
}

export interface LeftFrame {
  type: 'left'
}

export type ServerFrame =
  | ReadyFrame
  | PresenceFrame
  | MessageFrame
  | DmFrame
  | OfflineFrame
  | RecalledFrame
  | PongFrame
  | ErrorFrame
  | LeftFrame
