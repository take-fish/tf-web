export type ContentScope = 'PUBLIC' | 'PRIVATE'
export type ContentStatus = 'VISIBLE' | 'HIDDEN'
export type LibraryScope = 'public' | 'private' | 'shared'
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REVOKED'

/**
 * 书籍列表项。可见性与可管理性由服务端计算（canEdit/canDelete），
 * 前端只负责展示，不自行推断权限。
 */
export interface BookSummary {
  id: number
  title: string
  author: string
  description: string
  chapterCount: number
  scope: ContentScope
  ownerId: number | null
  ownerNickname: string
  categoryId: number | null
  categoryName: string | null
  status: ContentStatus
  mine: boolean
  canEdit: boolean
  canDelete: boolean
  createdAt: string
  updatedAt: string
}

export interface BookPage {
  books: BookSummary[]
  total: number
  page: number
  size: number
}

export interface ChapterSummary {
  chapterIndex: number
  title: string
  wordCount: number
}

export interface BookDetail {
  book: BookSummary
  chapters: ChapterSummary[]
}

export interface ChapterContent {
  chapterIndex: number
  title: string
  content: string
  paragraphCount: number
}

export interface ReadingProgress {
  chapterIndex: number
  scrollRatio: number
  updatedAt: string
}

export interface Bookmark {
  id: number
  chapterIndex: number
  paragraphIndex: number
  excerpt: string
  note: string | null
  createdAt: string
}

export interface Annotation {
  id: number
  paragraphIndex: number
  userId: string
  nickname: string
  content: string
  createdAt: string
}

export interface Category {
  id: number
  name: string
  sortOrder: number
}

export interface Shelf {
  id: number
  name: string
  description: string
  bookCount: number
  updatedAt: string
}

export interface ShelfDetail {
  shelf: Shelf
  books: BookSummary[]
}

export interface AccessRequest {
  id: number
  bookId: number
  bookTitle: string
  ownerId: number
  ownerNickname: string
  requesterId: number
  requesterNickname: string
  status: RequestStatus
  message: string
  decisionMessage: string
  createdAt: string
  decidedAt: string | null
}

export interface ShareLink {
  shareToken: string
}

export interface BookUpdatePayload {
  title?: string
  author?: string
  description?: string
  categoryId?: number | null
  status?: ContentStatus
}

export interface ImportBookOptions {
  scope: 'public' | 'private'
  title?: string
  author?: string
  categoryId?: number | null
}

/**
 * 经验值概览。等级从 9 到 0，0 最高；满级时 nextLevelExperience 为 null。
 * 服务端按规则累计，前端只负责展示，不自行推导等级。
 */
export interface UserStats {
  experience: number
  level: number
  nextLevelExperience: number | null
  uploadCount: number
  readingMinutes: number
}
