import { deleteJson, getJson, patchJson, postJson } from '@/lib/http'

const BASE = '/api/v1/agent/eval'

export type EvalLabel = 0 | 1 | 2

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
}

export interface EvalQuestionSummary {
  id: string
  query: string
  note: string
  pooled_at: string | null
  complete: boolean
  candidate_count: number
  labeled_count: number
  relevant_count: number
  precision: number | null
  recall: number | null
  mrr: number | null
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
}

export interface EvalCandidate {
  id: number
  question_id: string
  doc_id: string
  seq: number
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
  created_at: string | null
}

export interface EvalRunDetail extends EvalRunSummary {
  detail: {
    set: EvalSetInfo
    metrics: EvalMetrics
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
): Promise<{ code: number; data: { added: number; skipped: number; ids: string[] } }> {
  return postJson(`${BASE}/sets/${setId}/questions`, { queries })
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
