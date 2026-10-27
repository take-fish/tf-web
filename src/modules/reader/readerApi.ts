import {
  deleteJson,
  getJson,
  keepaliveRequest,
  postForm,
  postJson,
  putJson,
  request,
} from '@/lib/http'
import type {
  AccessRequest,
  Annotation,
  BookDetail,
  BookPage,
  BookSummary,
  BookUpdatePayload,
  Bookmark,
  Category,
  ChapterContent,
  ImportBookOptions,
  LibraryScope,
  ReadingProgress,
  Shelf,
  ShelfDetail,
  ShareLink,
  UserStats,
} from './types'

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function fetchBooks(
  params: {
    scope?: LibraryScope
    categoryId?: number | null
    q?: string
    page?: number
    size?: number
  } = {},
): Promise<BookPage> {
  const scope = params.scope === 'private' ? 'private' : 'public'
  const data = await getJson<BookPage>(
    `/api/v1/reader/books${query({
      scope,
      categoryId: params.categoryId,
      q: params.q?.trim(),
      page: params.page,
      size: params.size,
    })}`,
  )
  return {
    books: data.books ?? [],
    total: data.total ?? 0,
    page: data.page ?? 0,
    size: data.size ?? 20,
  }
}

export async function fetchMyBooks(): Promise<BookSummary[]> {
  const data = await getJson<{ books: BookSummary[] }>('/api/v1/reader/books/mine')
  return data.books ?? []
}

export async function fetchSharedBooks(): Promise<BookSummary[]> {
  const data = await getJson<{ books: BookSummary[] }>('/api/v1/reader/books/shared')
  return data.books ?? []
}

export function previewSharedBook(shareToken: string): Promise<BookSummary> {
  return getJson<BookSummary>(`/api/v1/reader/books/shared/${encodeURIComponent(shareToken)}`)
}

export function fetchBook(bookId: number): Promise<BookDetail> {
  return getJson<BookDetail>(`/api/v1/reader/books/${bookId}`)
}

export function fetchChapter(bookId: number, chapterIndex: number): Promise<ChapterContent> {
  return getJson<ChapterContent>(`/api/v1/reader/books/${bookId}/chapters/${chapterIndex}`)
}

export function importBook(file: File, options: ImportBookOptions): Promise<BookSummary> {
  const form = new FormData()
  form.append('file', file)
  form.append('scope', options.scope)
  if (options.title?.trim()) form.append('title', options.title.trim())
  if (options.author?.trim()) form.append('author', options.author.trim())
  if (options.categoryId) form.append('categoryId', String(options.categoryId))
  return postForm<BookSummary>('/api/v1/reader/books/import', form)
}

export function updateBook(bookId: number, payload: BookUpdatePayload): Promise<BookSummary> {
  return request<BookSummary>(`/api/v1/reader/books/${bookId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteBook(bookId: number): Promise<void> {
  return deleteJson<void>(`/api/v1/reader/books/${bookId}`)
}

export function shareBook(bookId: number): Promise<ShareLink> {
  return postJson<ShareLink>(`/api/v1/reader/books/${bookId}/share`, {})
}

export async function fetchProgress(bookId: number): Promise<ReadingProgress | null> {
  const data = await getJson<{ progress: ReadingProgress | null }>(
    `/api/v1/reader/books/${bookId}/progress`,
  )
  return data.progress
}

export function saveProgress(
  bookId: number,
  chapterIndex: number,
  scrollRatio: number,
): Promise<void> {
  return putJson<void>(`/api/v1/reader/books/${bookId}/progress`, {
    chapterIndex,
    scrollRatio,
  })
}

/**
 * 页面隐藏/关闭时的进度上报。走 keepalive，请求在页面销毁后仍会送达；
 * 返回 false 表示浏览器拒绝了请求（例如超出 keepalive 体积上限），此时本地缓存仍可用。
 */
export function saveProgressKeepalive(
  bookId: number,
  chapterIndex: number,
  scrollRatio: number,
): boolean {
  return keepaliveRequest(`/api/v1/reader/books/${bookId}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ chapterIndex, scrollRatio }),
  })
}

export async function fetchBookmarks(bookId: number): Promise<Bookmark[]> {
  const data = await getJson<{ bookmarks: Bookmark[] }>(`/api/v1/reader/books/${bookId}/bookmarks`)
  return data.bookmarks ?? []
}

export function addBookmark(
  bookId: number,
  payload: {
    chapterIndex: number
    paragraphIndex: number
    excerpt: string
    note?: string
  },
): Promise<Bookmark> {
  return postJson<Bookmark>(`/api/v1/reader/books/${bookId}/bookmarks`, payload)
}

export function removeBookmark(bookmarkId: number): Promise<void> {
  return deleteJson<void>(`/api/v1/reader/bookmarks/${bookmarkId}`)
}

export async function fetchAnnotations(
  bookId: number,
  chapterIndex: number,
  afterId: number,
): Promise<Annotation[]> {
  const data = await getJson<{ annotations: Annotation[] }>(
    `/api/v1/reader/books/${bookId}/chapters/${chapterIndex}/annotations${query({
      afterId,
      limit: 200,
    })}`,
  )
  return data.annotations ?? []
}

export function addAnnotation(
  bookId: number,
  chapterIndex: number,
  payload: { paragraphIndex: number; content: string },
): Promise<Annotation> {
  return postJson<Annotation>(
    `/api/v1/reader/books/${bookId}/chapters/${chapterIndex}/annotations`,
    payload,
  )
}

export async function fetchCategories(): Promise<Category[]> {
  const data = await getJson<{ categories: Category[] }>('/api/v1/reader/categories')
  return data.categories ?? []
}

export function createCategory(name: string, sortOrder = 0): Promise<Category> {
  return postJson<Category>('/api/v1/reader/categories', { name, sortOrder })
}

export async function fetchShelves(): Promise<Shelf[]> {
  const data = await getJson<{ shelves: Shelf[] }>('/api/v1/reader/shelves')
  return data.shelves ?? []
}

export function fetchShelf(shelfId: number): Promise<ShelfDetail> {
  return getJson<ShelfDetail>(`/api/v1/reader/shelves/${shelfId}`)
}

export function createShelf(name: string, description = ''): Promise<Shelf> {
  return postJson<Shelf>('/api/v1/reader/shelves', { name, description })
}

export function deleteShelf(shelfId: number): Promise<void> {
  return deleteJson<void>(`/api/v1/reader/shelves/${shelfId}`)
}

export function addBookToShelf(shelfId: number, bookId: number): Promise<void> {
  return postJson<void>(`/api/v1/reader/shelves/${shelfId}/books/${bookId}`, {})
}

export function removeBookFromShelf(shelfId: number, bookId: number): Promise<void> {
  return deleteJson<void>(`/api/v1/reader/shelves/${shelfId}/books/${bookId}`)
}

export function requestAccess(
  bookId: number,
  shareToken: string,
  message = '',
): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/reader/books/${bookId}/access-requests`, {
    shareToken,
    message,
  })
}

export async function fetchMyAccessRequests(): Promise<AccessRequest[]> {
  const data = await getJson<{ requests: AccessRequest[] }>('/api/v1/reader/access-requests/mine')
  return data.requests ?? []
}

export async function fetchReceivedAccessRequests(status?: string): Promise<AccessRequest[]> {
  const data = await getJson<{ requests: AccessRequest[] }>(
    `/api/v1/reader/access-requests/received${query({ status })}`,
  )
  return data.requests ?? []
}

export function approveAccessRequest(requestId: number): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/reader/access-requests/${requestId}/approve`, {})
}

export function rejectAccessRequest(requestId: number, message = ''): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/reader/access-requests/${requestId}/reject`, {
    message,
  })
}

export function revokeAccessRequest(requestId: number): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/reader/access-requests/${requestId}/revoke`, {})
}

export function cancelAccessRequest(requestId: number): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/reader/access-requests/${requestId}/cancel`, {})
}

/** 当前用户的经验值、等级与阅读统计。 */
export function fetchMyStats(): Promise<UserStats> {
  return getJson<UserStats>('/api/v1/reader/me/stats')
}

/**
 * 阅读心跳。服务端用两次心跳的时间差算真实阅读时长，所以这里只上报"正在读哪本书"，
 * 不上报读了多久。由阅读器在页面可见时每分钟调用一次。
 */
export function sendReadingHeartbeat(bookId: number): Promise<UserStats> {
  return postJson<UserStats>('/api/v1/reader/me/reading-heartbeat', { bookId })
}
