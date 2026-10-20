import { ApiError } from '@/lib/http'
import { randomId } from '@/lib/id'
import { fetchWsTicket } from './chatApi'
import type {
  ChatKind,
  ChatMessage,
  ChatStatus,
  ChatUser,
  OnlineMember,
  ReadPayload,
  ServerFrame,
} from './types'

export interface ChatSocketHandlers {
  onStatus?: (status: ChatStatus) => void
  onReady?: (user: ChatUser) => void
  onPresence?: (groupId: string, members: OnlineMember[]) => void
  onMessage?: (message: ChatMessage) => void
  onDm?: (message: ChatMessage) => void
  onOffline?: (messages: ChatMessage[]) => void
  onRecalled?: (message: ChatMessage, byUserId: string) => void
  onError?: (message: string, code?: string) => void
  onAuthError?: () => void
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]

function socketUrl(ticket: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/chat?ticket=${encodeURIComponent(ticket)}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '聊天通道建立失败'
}

export class ChatSocketClient {
  private ws: WebSocket | null = null
  private groupId: string | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastPong = 0
  private manuallyClosed = false
  private authFailed = false
  private connectAttempt = 0

  constructor(private readonly handlers: ChatSocketHandlers) {}

  /**
   * 先向 REST 申请一次性 ticket，再建立 WebSocket；
   * 重连时同样重新申请，长期 token 不会出现在 URL 中。
   */
  connect(): Promise<void> {
    this.manuallyClosed = false
    this.authFailed = false
    return this.open()
  }

  join(groupId: string) {
    this.groupId = groupId
    this.send({ type: 'join', groupId })
  }

  leave() {
    this.groupId = null
    this.send({ type: 'leave' })
  }

  sendGroupMessage(content: string, kind: ChatKind = 'text'): boolean {
    if (!this.groupId) return false
    return this.send({ type: 'message', content, kind, clientMsgId: randomId() })
  }

  /** 群聊图片以 data URL 只做实时广播，不写入数据库或磁盘。 */
  sendGroupImage(dataUrl: string): boolean {
    return this.sendGroupMessage(dataUrl, 'image')
  }

  sendDirectMessage(
    toUserId: string,
    content: string,
    kind: ChatKind = 'text',
  ): boolean {
    return this.send({ type: 'dm', toUserId, content, kind, clientMsgId: randomId() })
  }

  /** 私聊图片先上传获得 imageId，再通过 WebSocket 发送引用。 */
  sendDirectImage(toUserId: string, imageId: string): boolean {
    return this.sendDirectMessage(toUserId, imageId, 'image')
  }

  sendRead(payload: ReadPayload): boolean {
    return this.send({ type: 'read', ...payload })
  }

  sendRecall(messageId: string): boolean {
    return this.send({ type: 'recall', messageId })
  }

  close() {
    this.manuallyClosed = true
    this.connectAttempt += 1
    this.stopHeartbeat()
    this.clearReconnect()
    this.handlers.onStatus?.('offline')
    this.ws?.close(1000, 'client close')
    this.ws = null
  }

  private async open(): Promise<void> {
    this.clearReconnect()
    this.handlers.onStatus?.(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    const attempt = ++this.connectAttempt

    let ticket: string
    try {
      ticket = (await fetchWsTicket()).ticket
    } catch (error) {
      if (this.manuallyClosed || attempt !== this.connectAttempt) return
      if (error instanceof ApiError && error.status === 401) {
        this.authFailed = true
        this.handlers.onStatus?.('offline')
        this.handlers.onAuthError?.()
        return
      }
      this.handlers.onError?.(errorText(error), 'HANDSHAKE_FAILED')
      this.scheduleReconnect()
      return
    }
    if (this.manuallyClosed || attempt !== this.connectAttempt) return

    let ws: WebSocket
    try {
      ws = new WebSocket(socketUrl(ticket))
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
      this.lastPong = Date.now()
      this.handlers.onStatus?.('online')
      this.startHeartbeat()
      if (this.groupId) this.send({ type: 'join', groupId: this.groupId })
    }

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      try {
        this.dispatch(JSON.parse(event.data) as ServerFrame)
      } catch {
        // 忽略非协议帧
      }
    }

    ws.onclose = () => {
      this.stopHeartbeat()
      if (this.ws === ws) this.ws = null
      if (this.manuallyClosed || this.authFailed) return
      this.handlers.onStatus?.('reconnecting')
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      // 关闭事件会统一触发重连
    }
  }

  private dispatch(frame: ServerFrame) {
    switch (frame.type) {
      case 'ready':
        this.handlers.onReady?.(frame.user)
        break
      case 'presence':
        this.handlers.onPresence?.(frame.groupId, frame.members ?? [])
        break
      case 'message':
        this.handlers.onMessage?.(frame.message)
        break
      case 'dm':
        this.handlers.onDm?.(frame.message)
        break
      case 'dm_offline':
        this.handlers.onOffline?.(frame.messages ?? [])
        break
      case 'recalled':
        this.handlers.onRecalled?.(frame.message, frame.byUserId ?? frame.message.fromUserId)
        break
      case 'pong':
        this.lastPong = Date.now()
        break
      case 'error':
        this.handlers.onError?.(frame.message || '消息通道异常', frame.code)
        if (frame.code === 'UNAUTHORIZED') {
          this.authFailed = true
          this.handlers.onAuthError?.()
        }
        break
      case 'left':
        break
      default:
        break
    }
  }

  private send(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(payload))
    return true
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPong > 55_000) {
        this.ws?.close(4000, 'heartbeat timeout')
        return
      }
      this.send({ type: 'ping', ts: Date.now() })
    }, 25_000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempts += 1
    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      void this.open()
    }, delay ?? 15000)
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }
}
