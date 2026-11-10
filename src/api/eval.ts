import { deleteJson, getJson, patchJson, postJson } from '@/lib/http'

const BASE = '/api/v1/agent/eval'

export type EvalLabel = 0 | 1 | 2

/** fact = 事实型（问是什么/在哪），flow = 流程型（问怎么做） */
export type EvalQuestionType = 'fact' | 'flow'

export interface EvalSetSummary {
  id: string
  name: string
  description: string
  kb_ids: string[]
  top_k: number
  created_at: string | null
  question_count: number
  pooled_count: number
  complete_count: number
}

export interface EvalMetrics {
  question_count: number
  complete_count: number
  total_candidates: number
  labeled_candidates: number
  relevant_candidates: number
  precision: number | null
  recall: number | null
  mrr: number | null
  /** 相关章节覆盖率：前 k 条覆盖的相关章节 ÷ 池内全部相关章节；无章节元数据时为 null */
  section_coverage: number | null
}

export interface EvalQuestionSummary {
  id: string
  query: string
  type: EvalQuestionType
  note: string
  pooled_at: string | null
  complete: boolean
  candidate_count: number
  labeled_count: number
  relevant_count: number
  precision: number | null
  recall: number | null
  mrr: number | null
  section_coverage: number | null
}

export interface EvalSetInfo {
  id: string
  name: string
  description: string
  kb_ids: string[]
  top_k: number
  created_at: string | null
}

export interface EvalSetDetail extends EvalSetInfo {
  questions: EvalQuestionSummary[]
  metrics: EvalMetrics
  /** 按题型拆分的指标；只有出现过该题型的题时才有对应键 */
  by_type: Partial<Record<EvalQuestionType, EvalMetrics>>
}

export interface EvalCandidate {
  id: number
  question_id: string
  doc_id: string
  seq: number
  /** 命中块所属章节（老索引为空） */
  section: string
  section_seq: number | null
  title: string
  text: string
  score: number
  knn_rank: number | null
  bm25_rank: number | null
  rrf_rank: number
  label: EvalLabel | null
  label_source: string
  labeled_at: string | null
}

export interface EvalCandidateList {
  question: { id: string; set_id: string; query: string; pooled_at: string | null }
  candidates: EvalCandidate[]
}

export interface EvalRunSummary {
  id: string
  set_id: string
  top_k: number
  question_count: number
  complete_count: number
  precision: number | null
  recall: number | null
  mrr: number | null
  section_coverage: number | null
  created_at: string | null
}

export interface EvalRunDetail extends EvalRunSummary {
  detail: {
    set: EvalSetInfo
    metrics: EvalMetrics
    by_type?: Partial<Record<EvalQuestionType, EvalMetrics>>
    questions: EvalQuestionSummary[]
  }
}

export function listEvalSets(): Promise<{ code: number; data: EvalSetSummary[] }> {
  return getJson(`${BASE}/sets`)
}

export function createEvalSet(payload: {
  name: string
  description?: string
  kb_ids: string[]
  top_k: number
}): Promise<{ code: number; data: EvalSetSummary }> {
  return postJson(`${BASE}/sets`, payload)
}

export function getEvalSet(setId: string): Promise<{ code: number; data: EvalSetDetail }> {
  return getJson(`${BASE}/sets/${setId}`)
}

export function removeEvalSet(setId: string): Promise<{ code: number; msg: string }> {
  return deleteJson(`${BASE}/sets/${setId}`)
}

export function importQuestions(
  setId: string,
  queries: string[],
  type: EvalQuestionType = 'fact',
): Promise<{ code: number; data: { added: number; skipped: number; ids: string[] } }> {
  return postJson(`${BASE}/sets/${setId}/questions`, { queries, type })
}

/** 修改题型（fact / flow），用于按题型拆分指标。 */
export function updateQuestion(
  questionId: string,
  payload: { type?: EvalQuestionType; note?: string },
): Promise<{ code: number; data: { id: string; type: EvalQuestionType; note: string } }> {
  return patchJson(`${BASE}/questions/${questionId}`, payload)
}

export function removeQuestion(questionId: string): Promise<{ code: number; msg: string }> {
  return deleteJson(`${BASE}/questions/${questionId}`)
}

export function poolQuestion(questionId: string): Promise<{
  code: number
  data: { id: string; candidate_count: number; pooled_at: string | null }
}> {
  return postJson(`${BASE}/questions/${questionId}/pool`, {})
}

export function poolSet(setId: string): Promise<{
  code: number
  data: { pooled: number; failed: { id: string; query: string; error: string }[]; skipped: number }
}> {
  return postJson(`${BASE}/sets/${setId}/pool`, {})
}

export function listCandidates(questionId: string): Promise<{ code: number; data: EvalCandidateList }> {
  return getJson(`${BASE}/questions/${questionId}/candidates`)
}

export function labelCandidate(
  candidateId: number,
  label: EvalLabel | null,
): Promise<{ code: number; data: EvalCandidate }> {
  return patchJson(`${BASE}/candidates/${candidateId}`, { label })
}

export function createEvalRun(setId: string): Promise<{ code: number; data: EvalRunSummary }> {
  return postJson(`${BASE}/sets/${setId}/runs`, {})
}

export function listEvalRuns(setId: string): Promise<{ code: number; data: EvalRunSummary[] }> {
  return getJson(`${BASE}/sets/${setId}/runs`)
}

export function getEvalRun(runId: string): Promise<{ code: number; data: EvalRunDetail }> {
  return getJson(`${BASE}/runs/${runId}`)
}
