import { deleteJson, getJson, postForm, postJson, putJson } from '@/lib/http'
import type {
  Annotation,
  BookDetail,
  Bookmark,
  BookSummary,
  ChapterContent,
  ReadingProgress,
} from './types'

export async function fetchBooks(): Promise<BookSummary[]> {
  const data = await getJson<{ books: BookSummary[] }>('/api/v1/reader/books')
  return data.books ?? []
}

export function fetchBook(bookId: number): Promise<BookDetail> {
  return getJson<BookDetail>(`/api/v1/reader/books/${bookId}`)
}

export function fetchChapter(bookId: number, chapterIndex: number): Promise<ChapterContent> {
  return getJson<ChapterContent>(`/api/v1/reader/books/${bookId}/chapters/${chapterIndex}`)
}

export async function importBook(
  file: File,
  title: string,
  author: string,
): Promise<BookSummary> {
  const form = new FormData()
  form.append('file', file)
  if (title.trim()) form.append('title', title.trim())
  if (author.trim()) form.append('author', author.trim())
  return postForm<BookSummary>('/api/v1/reader/books/import', form)
}

export async function fetchProgress(
  userId: string,
  bookId: number,
): Promise<ReadingProgress | null> {
  const query = new URLSearchParams({ userId })
  const data = await getJson<{ progress: ReadingProgress | null }>(
    `/api/v1/reader/books/${bookId}/progress?${query.toString()}`,
  )
  return data.progress
}

export function saveProgress(
  userId: string,
  bookId: number,
  chapterIndex: number,
  scrollRatio: number,
): Promise<void> {
  return putJson<void>(`/api/v1/reader/books/${bookId}/progress`, {
    userId,
    chapterIndex,
    scrollRatio,
  })
}

export async function fetchBookmarks(userId: string, bookId: number): Promise<Bookmark[]> {
  const query = new URLSearchParams({ userId })
  const data = await getJson<{ bookmarks: Bookmark[] }>(
    `/api/v1/reader/books/${bookId}/bookmarks?${query.toString()}`,
  )
  return data.bookmarks ?? []
}

export function addBookmark(
  bookId: number,
  payload: {
    userId: string
    chapterIndex: number
    paragraphIndex: number
    excerpt: string
    note?: string
  },
): Promise<Bookmark> {
  return postJson<Bookmark>(`/api/v1/reader/books/${bookId}/bookmarks`, payload)
}

export function removeBookmark(bookmarkId: number, userId: string): Promise<void> {
  const query = new URLSearchParams({ userId })
  return deleteJson<void>(`/api/v1/reader/bookmarks/${bookmarkId}?${query.toString()}`)
}

export async function fetchAnnotations(
  bookId: number,
  chapterIndex: number,
  afterId: number,
): Promise<Annotation[]> {
  const query = new URLSearchParams({ afterId: String(afterId), limit: '200' })
  const data = await getJson<{ annotations: Annotation[] }>(
    `/api/v1/reader/books/${bookId}/chapters/${chapterIndex}/annotations?${query.toString()}`,
  )
  return data.annotations ?? []
}

export function addAnnotation(
  bookId: number,
  chapterIndex: number,
  payload: {
    userId: string
    nickname: string
    paragraphIndex: number
    content: string
  },
): Promise<Annotation> {
  return postJson<Annotation>(
    `/api/v1/reader/books/${bookId}/chapters/${chapterIndex}/annotations`,
    payload,
  )
}
