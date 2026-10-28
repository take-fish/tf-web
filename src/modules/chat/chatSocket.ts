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
  SmokeState,
} from '@/types/chat'

export interface ChatSocketHandlers {
  onStatus?: (status: ChatStatus) => void
  onReady?: (user: ChatUser) => void
  onPresence?: (groupId: string, members: OnlineMember[]) => void
  onMessage?: (message: ChatMessage) => void
  onDm?: (message: ChatMessage) => void
  onOffline?: (messages: ChatMessage[]) => void
  onRecalled?: (message: ChatMessage, byUserId: string) => void
  onSmokeState?: (state: SmokeState) => void
  onError?: (message: string, code?: string, traceId?: string) => void
  onAuthError?: () => void
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]
/** 连接稳定这么久才清零退避计数，避免「连上即被踢」时按 1 秒风暴重试。 */
const STABLE_CONNECTION_MS = 10_000
/** 出站缓冲上限：图片 data URL 连发时防止内存与队列无限堆积。 */
const MAX_BUFFERED_BYTES = 1024 * 1024

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
  private stableTimer: ReturnType<typeof setTimeout> | undefined
  private lastPong = 0
  private manuallyClosed = false
  private authFailed = false
  private connectAttempt = 0

  constructor(private readonly handlers: ChatSocketHandlers) {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', this.onBrowserOnline)
      window.addEventListener('offline', this.onBrowserOffline)
    }
  }

  /** 网络恢复时立刻重连，不必等退避计时器走完。 */
  private readonly onBrowserOnline = () => {
    if (this.manuallyClosed || this.authFailed) return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    this.clearReconnect()
    void this.open()
  }

  /** 网络断开时主动关闭，让界面立即进入重连态，而不是等心跳超时。 */
  private readonly onBrowserOffline = () => {
    const ws = this.ws
    if (!ws) return
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(4001, 'network offline')
    }
  }

  private removeBrowserListeners() {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', this.onBrowserOnline)
      window.removeEventListener('offline', this.onBrowserOffline)
    }
  }

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
    return this.send({ type: 'message', content, kind, clientMsgId: randomId() }, true)
  }

  /** 群聊图片以 data URL 只做实时广播，不写入数据库或磁盘。 */
  sendGroupImage(dataUrl: string): boolean {
    return this.sendGroupMessage(dataUrl, 'image')
  }

  sendDirectMessage(toUserId: string, content: string, kind: ChatKind = 'text'): boolean {
    return this.send({ type: 'dm', toUserId, content, kind, clientMsgId: randomId() }, true)
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

  inviteSmoke(toUserId: string): boolean {
    return this.send({ type: 'smoke_invite', toUserId })
  }

  acceptSmoke(sessionId: string): boolean {
    return this.send({ type: 'smoke_accept', sessionId })
  }

  declineSmoke(sessionId: string): boolean {
    return this.send({ type: 'smoke_decline', sessionId })
  }

  leaveSmoke(): boolean {
    return this.send({ type: 'smoke_leave' })
  }

  endSmoke(): boolean {
    return this.send({ type: 'smoke_end' })
  }

  close() {
    this.manuallyClosed = true
    this.connectAttempt += 1
    this.stopHeartbeat()
    this.clearStable()
    this.clearReconnect()
    this.removeBrowserListeners()
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
      this.lastPong = Date.now()
      this.handlers.onStatus?.('online')
      this.startHeartbeat()
      this.scheduleStableReset()
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
      this.clearStable()
      // 已被新连接替换的旧 socket：忽略它的关闭事件，避免多开一条连接。
      if (this.ws !== ws) return
      this.ws = null
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
      case 'smoke_state':
        this.handlers.onSmokeState?.(frame.state)
        break
      case 'pong':
        this.lastPong = Date.now()
        break
      case 'error':
        this.handlers.onError?.(frame.message || '消息通道异常', frame.code, frame.traceId)
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

  /**
   * 出站背压保护：缓冲超过上限时拒绝写入，由调用方提示「未发送」；
   * 心跳、已读等后台帧静默丢弃，只有用户消息触发错误提示。
   */
  private send(payload: Record<string, unknown>, reportCongestion = false): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      if (reportCongestion) {
        this.handlers.onError?.('网络拥塞，消息未发送，请稍后重试', 'WS_BACKPRESSURE')
      }
      return false
    }
    ws.send(JSON.stringify(payload))
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

  private scheduleStableReset() {
    this.clearStable()
    this.stableTimer = setTimeout(() => {
      this.reconnectAttempts = 0
      this.stableTimer = undefined
    }, STABLE_CONNECTION_MS)
  }

  private clearStable() {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer)
      this.stableTimer = undefined
    }
  }
}
