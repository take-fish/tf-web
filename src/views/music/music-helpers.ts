import { formatApiError } from '@/lib/http'

export function errorText(value: unknown): string {
  return formatApiError(value)
}
