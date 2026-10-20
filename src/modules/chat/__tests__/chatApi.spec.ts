import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/lib/authToken'
import {
  fetchDirectHistory,
  fetchGroupHistory,
  fetchImageBlob,
  fetchUnread,
  fetchWsTicket,
  markRead,
  recallMessage,
  searchGroup,
  uploadImage,
} from '../chatApi'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function lastCall() {
  const fetchMock = vi.mocked(globalThis.fetch)
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? []
  return { url: String(url), init: init as RequestInit }
}

describe('chatApi', () => {
  const message = {
    id: 'm-1',
    seq: 7,
    groupId: 'dev-group',
    fromUserId: 'u1',
    fromNickname: '甲',
    fromNode: 'dev-node-01',
    toUserId: null,
    content: 'hi',
    kind: 'text',
    ts: 1,
    clientMsgId: null,
    recalled: false,
  }

  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('按游标请求群历史', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ messages: [message], hasMore: true, nextBeforeSeq: 7 }),
    )

    const page = await fetchGroupHistory('dev-group', { limit: 10, beforeSeq: 99 })

    const { url } = lastCall()
    expect(url).toBe('/api/v1/chat/groups/dev-group/history?limit=10&beforeSeq=99')
    expect(page.messages).toHaveLength(1)
    expect(page.hasMore).toBe(true)
    expect(page.nextBeforeSeq).toBe(7)
  })

  it('私聊历史不再携带自报 userId', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ messages: [], hasMore: false, nextBeforeSeq: null }),
    )

    await fetchDirectHistory('u9', { limit: 20, afterSeq: 5 })

    const { url } = lastCall()
    expect(url).toBe('/api/v1/chat/dm/u9/history?limit=20&afterSeq=5')
    expect(url).not.toContain('userId=')
  })

  it('编码搜索结果关键字', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ messages: [message] }))

    const messages = await searchGroup('dev-group', '构建 & 发布')

    expect(lastCall().url).toBe(
      '/api/v1/chat/groups/dev-group/search?q=%E6%9E%84%E5%BB%BA+%26+%E5%8F%91%E5%B8%83&limit=50',
    )
    expect(messages[0]?.id).toBe('m-1')
  })

  it('标记已读使用 POST JSON 并接受 204', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse(null, 204))

    await markRead({ groupId: 'dev-group', seq: 12 })

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/chat/read')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ groupId: 'dev-group', seq: 12 })
  })

  it('撤回与 ticket 均使用 POST', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ message: { ...message, recalled: true } }))
      .mockResolvedValueOnce(jsonResponse({ ticket: 't-1', expiresIn: 60 }))

    const recalled = await recallMessage('m-1')
    const ticket = await fetchWsTicket()

    expect(recalled.recalled).toBe(true)
    expect(ticket.ticket).toBe('t-1')
    expect(lastCall().url).toBe('/api/v1/chat/ws-ticket')
    expect(lastCall().init.method).toBe('POST')
  })

  it('未读摘要字段缺失时给出默认值', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({}))

    const summary = await fetchUnread()

    expect(summary).toEqual({ groups: {}, dms: {}, total: 0 })
  })

  it('上传图片使用 multipart 并返回元数据', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          image: {
            id: 'img-1',
            ownerUserId: 'u1',
            contentType: 'image/png',
            size: 3,
            createdAt: 1,
          },
        },
        201,
      ),
    )
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })

    const image = await uploadImage(file)

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/chat/images')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(file)
    expect(image.id).toBe('img-1')
  })

  it('拉取图片 Blob 时携带 Authorization', async () => {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: 'token-1',
        user: { id: 1, username: 'a', nickname: '甲', role: 'USER', status: 'ACTIVE' },
      }),
    )
    const blob = new Blob(['png'], { type: 'image/png' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => blob,
    } as Response)

    const result = await fetchImageBlob('img-1')

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/chat/images/img-1')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1')
    expect(result).toBe(blob)
  })
})
