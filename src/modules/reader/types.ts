export interface BookSummary {
  id: number
  title: string
  author: string
  description: string
  chapterCount: number
  updatedAt: string
}

export interface ChapterSummary {
  chapterIndex: number
  title: string
  wordCount: number
}

export interface BookDetail {
  id: number
  title: string
  author: string
  description: string
  chapterCount: number
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
