import { formatApiError } from '@/lib/http'

export interface EditorApi {
  scrollToRatio(ratio: number): void
  scrollToLine(line: number): void
  advance(fraction: number): boolean
  getScrollRatio(): number
  focus(): void
  isReady(): boolean
}

export function errorText(value: unknown): string {
  return formatApiError(value)
}

export function clock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}
