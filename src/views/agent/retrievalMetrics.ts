/**
 * 知识库检索指标：由 tf-agent 基于**整个知识库**统计后随 search_kb 工具事件返回。
 *
 * - 召回率 = 本次召回的相关片段数 / 全库与该问题相关的片段数
 * - 精确率 = 本次召回的相关片段数 / 本次召回片段总数
 *
 * 前端只负责解析与展示，不再自行估算，避免分母只取本批结果。
 */

export interface RetrievalMetrics {
  /** 0–1，分母是全库相关片段数 */
  recall: number
  /** 0–1，分母是本次召回片段数 */
  precision: number
  /** 本次召回中的相关片段数 */
  matched: number
  /** 本次召回片段总数 */
  retrieved: number
  /** 全库相关片段数 */
  relevant: number
  /** 问题关键词数 */
  terms: number
}

function ratio(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

/** 从 search_kb 事件的 data 里解析指标；缺失或格式不对时返回 null。 */
export function parseRetrievalMetrics(
  data: Record<string, unknown> | null | undefined,
): RetrievalMetrics | null {
  const raw = data?.metrics
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const recall = ratio(record.recall)
  const precision = ratio(record.precision)
  if (recall === null || precision === null) return null
  return {
    recall,
    precision,
    matched: count(record.matched),
    retrieved: count(record.retrieved),
    relevant: count(record.relevant),
    terms: count(record.terms),
  }
}
