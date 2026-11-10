import type { EvalLabel, EvalQuestionType } from '@/api/eval'

export const LABEL_OPTIONS: { value: EvalLabel; text: string; hint: string }[] = [
  { value: 0, text: '0', hint: '不相关' },
  { value: 1, text: '1', hint: '部分相关' },
  { value: 2, text: '2', hint: '高度相关' },
]

export const QUESTION_TYPE_OPTIONS: { value: EvalQuestionType; text: string; hint: string }[] = [
  { value: 'fact', text: '事实型', hint: '问是什么、在哪里、谁负责，答案通常落在一两个片段里' },
  { value: 'flow', text: '流程型', hint: '问怎么做、顺序是什么，答案往往跨多个章节' },
]

export function typeText(type: EvalQuestionType | null | undefined): string {
  return QUESTION_TYPE_OPTIONS.find((option) => option.value === type)?.text ?? '事实型'
}

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
