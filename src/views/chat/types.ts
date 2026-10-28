import type { ChatMessage } from '@/modules/chat/types'

export type ChatTone = 'info' | 'ok' | 'warn' | 'error' | 'dim' | 'message' | 'ascii' | 'link'

export interface TerminalApi {
  writeLines(lines: string[], tone?: ChatTone): void
  writeLiveLines(lines: string[], tone?: ChatTone): void
  endCommand(): void
  clearScreen(): void
  focus(): void
  submitExternal(value: string): boolean
}

export interface GalleryEntry {
  message: ChatMessage
  src: string
}
