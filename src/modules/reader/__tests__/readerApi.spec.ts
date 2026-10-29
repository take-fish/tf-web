import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeAuth } from '@/lib/authToken'
import type { AuthUser } from '@/types/auth'
import {
  fetchBookmarks,
  fetchBooks,
  fetchReceivedAccessRequests,
  importBook,
  previewSharedBook,
  requestAccess,
  saveProgress,
  saveProgressKeepalive,
  updateBook,
} from '../readerApi'

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

describe('readerApi', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('私有库使用 scope=private 且不携带自报 userId', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ books: [], total: 0, page: 0, size: 20 }),
    )

    await fetchBooks({ scope: 'private' })

    const { url } = lastCall()
    expect(url).toBe('/api/v1/reader/books?scope=private')
    expect(url).not.toContain('userId=')
  })

  it('公共库搜索同时编码关键字与分类', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ books: [], total: 0, page: 0, size: 20 }),
    )

    await fetchBooks({ scope: 'public', q: '三体 & 黑暗森林', categoryId: 3 })

    expect(lastCall().url).toBe(
      `/api/v1/reader/books?${new URLSearchParams({
        scope: 'public',
        categoryId: '3',
        q: '三体 & 黑暗森林',
      }).toString()}`,
    )
  })

  it('进度与书签接口完全由 token 决定身份', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse({ bookmarks: [] }))

    await saveProgress(9, 2, 0.35)
    const progressCall = lastCall()
    expect(progressCall.url).toBe('/api/v1/reader/books/9/progress')
    expect(progressCall.init.method).toBe('PUT')
    expect(JSON.parse(String(progressCall.init.body))).toEqual({
      chapterIndex: 2,
      scrollRatio: 0.35,
    })

    const marks = await fetchBookmarks(9)
    expect(marks).toEqual([])
    expect(lastCall().url).toBe('/api/v1/reader/books/9/bookmarks')
    expect(lastCall().url).not.toContain('userId=')
  })

  it('页面隐藏时的进度上报走 keepalive，并携带鉴权头', () => {
    const user: AuthUser = {
      id: 1,
      username: 'reader',
      nickname: '读者',
      role: 'USER',
      status: 'ACTIVE',
    }
    writeAuth({ token: 'tk-1', user })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse(null, 204))

    const accepted = saveProgressKeepalive(9, 2, 0.35)

    const { url, init } = lastCall()
    expect(accepted).toBe(true)
    expect(url).toBe('/api/v1/reader/books/9/progress')
    expect(init.method).toBe('PUT')
    expect(init.keepalive).toBe(true)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tk-1')
    expect(JSON.parse(String(init.body))).toEqual({ chapterIndex: 2, scrollRatio: 0.35 })
  })

  it('上传使用 multipart 并写入目标库与分类', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ id: 5, title: '书', scope: 'PRIVATE' }, 201),
    )
    const file = new File(['第一章'], 'novel.txt', { type: 'text/plain' })

    await importBook(file, {
      scope: 'private',
      title: '书',
      author: '作者',
      categoryId: 2,
    })

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/reader/books/import')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('file')).toBe(file)
    expect(form.get('scope')).toBe('private')
    expect(form.get('title')).toBe('书')
    expect(form.get('author')).toBe('作者')
    expect(form.get('categoryId')).toBe('2')
  })

  it('编辑使用 PATCH 与 JSON 负载', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 5 }))

    await updateBook(5, { title: '新书名', categoryId: 4, status: 'VISIBLE' })

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/reader/books/5')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({
      title: '新书名',
      categoryId: 4,
      status: 'VISIBLE',
    })
  })

  it('分享码预览与申请走独立路径', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 8, title: '私藏', scope: 'PRIVATE' }))
      .mockResolvedValueOnce(jsonResponse({ id: 1, status: 'PENDING' }, 201))

    await previewSharedBook('tok/en 1')
    expect(lastCall().url).toBe('/api/v1/reader/books/shared/tok%2Fen%201')

    const request = await requestAccess(8, 'tok/en 1', '想读')
    expect(lastCall().url).toBe('/api/v1/reader/books/8/access-requests')
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      shareToken: 'tok/en 1',
      message: '想读',
    })
    expect(request.status).toBe('PENDING')
  })

  it('收到的申请支持状态过滤', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ requests: [] }))

    await fetchReceivedAccessRequests('PENDING')

    expect(lastCall().url).toBe(
      '/api/v1/reader/access-requests/received?status=PENDING',
    )
  })
})
