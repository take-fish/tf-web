import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/http'
import type { GameSocketStatus } from '@/types/games'

import { fetchGameWsTicket } from '../gameApi'
import { GameSocketClient } from '../gameSocket'

vi.mock('../gameApi', () => ({
  fetchGameWsTicket: vi.fn<() => Promise<{ ticket: string; expiresIn: number }>>(),
}))

class FakeSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: FakeSocket[] = []

  readyState = 0
  bufferedAmount = 0
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

function handlers() {
  return {
    onStatus: vi.fn<(status: GameSocketStatus) => void>(),
    onError: vi.fn<(message: string, code?: string) => void>(),
    onAuthError: vi.fn<() => void>(),
  }
}

const parse = (raw: string) => JSON.parse(raw) as Record<string, unknown>

describe('GameSocketClient', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.mocked(fetchGameWsTicket).mockReset()
    vi.mocked(fetchGameWsTicket).mockResolvedValue({ ticket: 'game-ticket', expiresIn: 60 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('先取 ticket 建连，重连后自动重新关注对局与巡检房间', async () => {
    vi.useFakeTimers()
    const events = handlers()
    const client = new GameSocketClient(events)
    await client.connect()
    const first = FakeSocket.instances[0]
    first?.open()
    expect(events.onStatus).toHaveBeenLastCalledWith('online')

    client.watchMatch('m1')
    client.joinExercise('room-1')
    first?.serverClose()
    expect(events.onStatus).toHaveBeenLastCalledWith('reconnecting')

    await vi.advanceTimersByTimeAsync(1000)
    const second = FakeSocket.instances[1]
    expect(second?.url).toContain('/ws/game?ticket=game-ticket')
    second?.open()

    expect(second?.sent.map(parse)).toEqual([
      { type: 'watch_match', matchId: 'm1' },
      { type: 'exercise_join', roomId: 'room-1' },
    ])
    client.close()
  })

  it('出站缓冲超过上限时拒绝动作帧', async () => {
    const events = handlers()
    const client = new GameSocketClient(events)
    await client.connect()
    const socket = FakeSocket.instances[0]
    socket?.open()
    if (socket) {
      socket.sent = []
      socket.bufferedAmount = 512 * 1024 + 1
    }

    expect(client.placeStone('m1', 1, 2)).toBe(false)
    expect(socket?.sent).toEqual([])

    if (socket) socket.bufferedAmount = 0
    expect(client.placeStone('m1', 1, 2)).toBe(true)
    expect(socket?.sent.map(parse)).toEqual([
      { type: 'place_stone', matchId: 'm1', x: 1, y: 2 },
    ])
    client.close()
  })

  it('旧 socket 的延迟关闭事件不触发新连接', async () => {
    vi.useFakeTimers()
    const events = handlers()
    const client = new GameSocketClient(events)
    await client.connect()
    const stale = FakeSocket.instances[0]
    stale?.open()

    await client.connect()
    FakeSocket.instances[1]?.open()
    events.onStatus.mockClear()

    stale?.serverClose()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(FakeSocket.instances).toHaveLength(2)
    expect(events.onStatus).not.toHaveBeenCalledWith('reconnecting')
    client.close()
  })

  it('连接未稳定时退避递增，稳定后清零', async () => {
    vi.useFakeTimers()
    const events = handlers()
    const client = new GameSocketClient(events)
    await client.connect()
    const first = FakeSocket.instances[0]
    first?.open()

    // 0.5 秒即断：第一次重连等待 1 秒。
    await vi.advanceTimersByTimeAsync(500)
    first?.serverClose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(2)

    // 再次快速断开：退避升到 2 秒，1 秒时还不应建立第三条。
    const second = FakeSocket.instances[1]
    second?.open()
    await vi.advanceTimersByTimeAsync(500)
    second?.serverClose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(2)

    // 稳定 10 秒后计数清零，再断线回到 1 秒。
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(3)
    const third = FakeSocket.instances[2]
    third?.open()
    await vi.advanceTimersByTimeAsync(10_000)
    third?.serverClose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(4)
    client.close()
  })

  it('ticket 鉴权失败时停止重连并通知', async () => {
    vi.mocked(fetchGameWsTicket).mockRejectedValueOnce(
      new ApiError(401, 'UNAUTHORIZED', '登录已失效'),
    )
    const events = handlers()
    const client = new GameSocketClient(events)

    await client.connect()

    expect(FakeSocket.instances).toHaveLength(0)
    expect(events.onAuthError).toHaveBeenCalledTimes(1)
    expect(events.onStatus).toHaveBeenLastCalledWith('offline')
    client.close()
  })
})
