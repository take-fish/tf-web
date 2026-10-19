export type ChatKind = 'text' | 'ascii'

export interface ChatMessage {
  id: string
  groupId: string | null
  fromUserId: string
  fromNickname: string
  fromNode: string
  toUserId: string | null
  content: string
  kind: ChatKind
  ts: number
  clientMsgId: string | null
}

export interface ChatGroup {
  id: string
  name: string
  description: string
  onlineCount: number
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
  | PongFrame
  | ErrorFrame
  | LeftFrame
