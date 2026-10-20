import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/http'
import type { ChatMessage, ChatStatus, ChatUser, WsTicket } from '../types'

import { fetchWsTicket } from '../chatApi'
import { ChatSocketClient } from '../chatSocket'

vi.mock('../chatApi', () => ({
  fetchWsTicket: vi.fn<() => Promise<WsTicket>>(),
}))

class FakeSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: FakeSocket[] = []

  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.()
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  emit(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }

  serverClose() {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.()
  }
}

const message: ChatMessage = {
  id: 'm-1',
  seq: 5,
  groupId: 'dev-group',
  fromUserId: 'u2',
  fromNickname: '乙',
  fromNode: 'dev-node-02',
  toUserId: null,
  content: 'hi',
  kind: 'text',
  ts: 1,
  clientMsgId: null,
  recalled: false,
}

function handlers() {
  return {
    onStatus: vi.fn<(status: ChatStatus) => void>(),
    onReady: vi.fn<(user: ChatUser) => void>(),
    onMessage: vi.fn<(message: ChatMessage) => void>(),
    onDm: vi.fn<(message: ChatMessage) => void>(),
    onRecalled: vi.fn<(message: ChatMessage, byUserId: string) => void>(),
    onError: vi.fn<(message: string, code?: string) => void>(),
    onAuthError: vi.fn<() => void>(),
  }
}

describe('ChatSocketClient', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.mocked(fetchWsTicket).mockReset()
    vi.mocked(fetchWsTicket).mockResolvedValue({ ticket: 'ticket-1', expiresIn: 60 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('先取一次性 ticket 再建连，URL 不含长期 token', async () => {
    const events = handlers()
    const client = new ChatSocketClient(events)

    await client.connect()
    const socket = FakeSocket.instances[0]

    expect(fetchWsTicket).toHaveBeenCalledTimes(1)
    expect(socket?.url).toContain('/ws/chat?ticket=ticket-1')
    expect(socket?.url).not.toContain('token')
    expect(socket?.url).not.toContain('userId')

    socket?.open()
    expect(events.onStatus).toHaveBeenLastCalledWith('online')
    client.close()
  })

  it('ticket 鉴权失败时停止重连并通知', async () => {
    vi.mocked(fetchWsTicket).mockRejectedValueOnce(
      new ApiError(401, 'UNAUTHORIZED', '登录已失效'),
    )
    const events = handlers()
    const client = new ChatSocketClient(events)

    await client.connect()

    expect(FakeSocket.instances).toHaveLength(0)
    expect(events.onAuthError).toHaveBeenCalledTimes(1)
    expect(events.onStatus).toHaveBeenLastCalledWith('offline')
  })

  it('分发 message / dm / recalled / error 帧', async () => {
    const events = handlers()
    const client = new ChatSocketClient(events)
    await client.connect()
    const socket = FakeSocket.instances[0]
    socket?.open()

    socket?.emit({ type: 'message', message })
    socket?.emit({ type: 'dm', message })
    socket?.emit({ type: 'recalled', message: { ...message, recalled: true }, byUserId: 'u2' })
    socket?.emit({ type: 'error', code: 'RATE_LIMITED', message: '太快了' })

    expect(events.onMessage).toHaveBeenCalledWith(message)
    expect(events.onDm).toHaveBeenCalledWith(message)
    expect(events.onRecalled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-1', recalled: true }),
      'u2',
    )
    expect(events.onError).toHaveBeenCalledWith('太快了', 'RATE_LIMITED')
    client.close()
  })

  it('发送 read / recall 帧', async () => {
    const events = handlers()
    const client = new ChatSocketClient(events)
    await client.connect()
    const socket = FakeSocket.instances[0]
    socket?.open()

    client.sendRead({ groupId: 'dev-group', seq: 9 })
    client.sendRecall('m-1')

    expect(socket?.sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: 'read', groupId: 'dev-group', seq: 9 },
      { type: 'recall', messageId: 'm-1' },
    ])
    client.close()
  })

  it('发送群聊图片 data URL 与私聊图片 ID', async () => {
    const events = handlers()
    const client = new ChatSocketClient(events)
    await client.connect()
    const socket = FakeSocket.instances[0]
    socket?.open()
    client.join('dev-group')
    if (socket) socket.sent = []

    client.sendGroupImage('data:image/png;base64,AAAA')
    client.sendDirectImage('u2', 'img-1')

    expect(socket?.sent.map((raw) => JSON.parse(raw))).toEqual([
      {
        type: 'message',
        content: 'data:image/png;base64,AAAA',
        kind: 'image',
        clientMsgId: expect.any(String),
      },
      {
        type: 'dm',
        toUserId: 'u2',
        content: 'img-1',
        kind: 'image',
        clientMsgId: expect.any(String),
      },
    ])
    client.close()
  })

  it('断线重连时重新申请 ticket', async () => {
    vi.useFakeTimers()
    vi.mocked(fetchWsTicket)
      .mockResolvedValueOnce({ ticket: 'ticket-1', expiresIn: 60 })
      .mockResolvedValueOnce({ ticket: 'ticket-2', expiresIn: 60 })
    const events = handlers()
    const client = new ChatSocketClient(events)
    await client.connect()
    FakeSocket.instances[0]?.open()

    FakeSocket.instances[0]?.serverClose()
    expect(events.onStatus).toHaveBeenLastCalledWith('reconnecting')

    await vi.advanceTimersByTimeAsync(1000)

    expect(fetchWsTicket).toHaveBeenCalledTimes(2)
    expect(FakeSocket.instances[1]?.url).toContain('ticket=ticket-2')
    client.close()
  })

  it('主动关闭后不再重连', async () => {
    vi.useFakeTimers()
    const events = handlers()
    const client = new ChatSocketClient(events)
    await client.connect()
    FakeSocket.instances[0]?.open()

    client.close()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(FakeSocket.instances).toHaveLength(1)
    expect(fetchWsTicket).toHaveBeenCalledTimes(1)
  })
})
