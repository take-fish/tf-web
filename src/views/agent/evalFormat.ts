import type { EvalLabel } from '@/api/eval'

export const LABEL_OPTIONS: { value: EvalLabel; text: string; hint: string }[] = [
  { value: 0, text: '0', hint: '不相关' },
  { value: 1, text: '1', hint: '部分相关' },
  { value: 2, text: '2', hint: '高度相关' },
]

export function labelText(label: EvalLabel | null | undefined): string {
  if (label === null || label === undefined) return '未标注'
  return LABEL_OPTIONS.find((option) => option.value === label)?.hint ?? '未标注'
}

/** 指标统一按 0–1 传输，页面展示为整数百分比；无分母时显示破折号。 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}
