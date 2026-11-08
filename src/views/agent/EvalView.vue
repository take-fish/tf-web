<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { listKbs, type KbItem } from '@/api/agent'
import {
  createEvalRun,
  createEvalSet,
  getEvalRun,
  getEvalSet,
  importQuestions,
  labelCandidate,
  listCandidates,
  listEvalRuns,
  listEvalSets,
  poolQuestion,
  poolSet,
  removeEvalSet,
  removeQuestion,
  type EvalCandidate,
  type EvalLabel,
  type EvalMetrics,
  type EvalQuestionSummary,
  type EvalRunDetail,
  type EvalRunSummary,
  type EvalSetDetail,
  type EvalSetSummary,
} from '@/api/eval'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { formatApiError } from '@/lib/http'

import { LABEL_OPTIONS, formatPercent, formatTime } from './evalFormat'

defineOptions({ name: 'AgentEvalView' })

const router = useRouter()

const EMPTY_METRICS: EvalMetrics = {
  question_count: 0,
  complete_count: 0,
  total_candidates: 0,
  labeled_candidates: 0,
  relevant_candidates: 0,
  precision: null,
  recall: null,
  mrr: null,
}

const sets = ref<EvalSetSummary[]>([])
const kbs = ref<KbItem[]>([])
const activeSetId = ref('')
const detail = ref<EvalSetDetail | null>(null)
const runs = ref<EvalRunSummary[]>([])
const activeRun = ref<EvalRunDetail | null>(null)
const loading = ref(false)
const pooling = ref(false)
const savingRun = ref(false)
const savingLabel = ref<number | null>(null)
const error = ref('')
const notice = ref('')
const showCreate = ref(false)
const importText = ref('')
const showHistory = ref(false)
const expanded = ref<Record<string, boolean>>({})
const expandedText = ref<Record<number, boolean>>({})
const candidates = ref<Record<string, EvalCandidate[]>>({})
const candidatesLoading = ref<Record<string, boolean>>({})

const newSet = reactive({
  name: '',
  description: '',
  kb_ids: [] as string[],
  top_k: 8,
})

const activeSet = computed(() => sets.value.find((item) => item.id === activeSetId.value) ?? null)
const questions = computed(() => detail.value?.questions ?? [])
const metrics = computed(() => detail.value?.metrics ?? EMPTY_METRICS)
const topK = computed(() => detail.value?.top_k ?? activeSet.value?.top_k ?? 8)

function kbName(id: string): string {
  return kbs.value.find((item) => item.id === id)?.name ?? id
}

function setKbText(item: { kb_ids: string[] }): string {
  return item.kb_ids.length ? item.kb_ids.map(kbName).join('、') : '全部知识库'
}

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 4000)
}

async function refreshKbs() {
  try {
    kbs.value = (await listKbs()).data
  } catch {
    kbs.value = []
  }
}

async function loadActive() {
  if (!activeSetId.value) return
  const [setData, runData] = await Promise.all([
    getEvalSet(activeSetId.value),
    listEvalRuns(activeSetId.value),
  ])
  detail.value = setData.data
  runs.value = runData.data
  activeRun.value = null
  candidates.value = {}
  candidatesLoading.value = {}
  expanded.value = {}
  expandedText.value = {}
}

async function refreshSets() {
  loading.value = true
  try {
    sets.value = (await listEvalSets()).data
    if (!sets.value.some((item) => item.id === activeSetId.value)) {
      activeSetId.value = sets.value[0]?.id ?? ''
    }
    if (activeSetId.value) {
      await loadActive()
    } else {
      detail.value = null
      runs.value = []
      activeRun.value = null
    }
  } catch (err) {
    error.value = formatApiError(err, '评测题集加载失败')
  } finally {
    loading.value = false
  }
}

async function refreshActive() {
  if (!activeSetId.value) return
  const data = (await getEvalSet(activeSetId.value)).data
  detail.value = data
  // 标注/池化后同步左侧进度，避免每次标注都多拉一次列表
  const summary = sets.value.find((item) => item.id === data.id)
  if (summary) {
    summary.question_count = data.metrics.question_count
    summary.complete_count = data.metrics.complete_count
    summary.pooled_count = data.questions.filter((question) => question.pooled_at).length
  }
}

async function selectSet(setId: string) {
  if (setId === activeSetId.value) return
  activeSetId.value = setId
  error.value = ''
  try {
    await loadActive()
  } catch (err) {
    error.value = formatApiError(err, '题集详情加载失败')
  }
}

async function onCreateSet() {
  if (!newSet.name.trim()) {
    error.value = '请填写题集名称'
    return
  }
  loading.value = true
  try {
    const created = (
      await createEvalSet({
        name: newSet.name.trim(),
        description: newSet.description.trim(),
        kb_ids: [...newSet.kb_ids],
        top_k: newSet.top_k,
      })
    ).data
    activeSetId.value = created.id
    showCreate.value = false
    newSet.name = ''
    newSet.description = ''
    newSet.kb_ids = []
    newSet.top_k = 8
    await refreshSets()
    flash('题集已创建')
  } catch (err) {
    error.value = formatApiError(err, '创建题集失败')
  } finally {
    loading.value = false
  }
}

async function onDeleteSet() {
  if (!activeSetId.value) return
  if (!window.confirm(`删除题集「${activeSet.value?.name ?? ''}」及其全部候选、标注和快照？`)) return
  try {
    await removeEvalSet(activeSetId.value)
    activeSetId.value = ''
    await refreshSets()
    flash('题集已删除')
  } catch (err) {
    error.value = formatApiError(err, '删除题集失败')
  }
}

async function onImport() {
  if (!activeSetId.value) return
  const queries = importText.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (!queries.length) return
  loading.value = true
  try {
    const result = await importQuestions(activeSetId.value, queries)
    importText.value = ''
    await refreshSets()
    flash(`新增 ${result.data.added} 条问题，跳过 ${result.data.skipped} 条重复/空行`)
  } catch (err) {
    error.value = formatApiError(err, '导入问题失败')
  } finally {
    loading.value = false
  }
}

async function onPoolAll() {
  if (!activeSetId.value) return
  pooling.value = true
  try {
    const result = await poolSet(activeSetId.value)
    await refreshSets()
    const { pooled, failed, skipped } = result.data
    if (failed.length) {
      error.value = `有 ${failed.length} 条问题池化失败：${failed[0]?.error ?? ''}`
    }
    flash(`已池化 ${pooled} 条${skipped ? `，还有 ${skipped} 条未处理` : ''}`)
  } catch (err) {
    error.value = formatApiError(err, '批量生成候选失败')
  } finally {
    pooling.value = false
  }
}

async function loadCandidates(questionId: string) {
  candidatesLoading.value[questionId] = true
  try {
    candidates.value[questionId] = (await listCandidates(questionId)).data.candidates
  } catch (err) {
    error.value = formatApiError(err, '候选加载失败')
  } finally {
    candidatesLoading.value[questionId] = false
  }
}

async function toggleQuestion(question: EvalQuestionSummary) {
  expanded.value[question.id] = !expanded.value[question.id]
  if (expanded.value[question.id] && !candidates.value[question.id]) {
    await loadCandidates(question.id)
  }
}

async function onPoolQuestion(question: EvalQuestionSummary) {
  if (
    question.candidate_count > 0 &&
    !window.confirm('重新池化会替换候选并清空这道题已有的标注，继续？')
  ) {
    return
  }
  pooling.value = true
  try {
    await poolQuestion(question.id)
    delete candidates.value[question.id]
    expanded.value[question.id] = true
    await loadCandidates(question.id)
    await refreshActive()
    flash('候选已更新，请重新标注')
  } catch (err) {
    error.value = formatApiError(err, '生成候选失败')
  } finally {
    pooling.value = false
  }
}

async function onLabel(candidate: EvalCandidate, label: EvalLabel | null) {
  if (savingLabel.value !== null) return
  savingLabel.value = candidate.id
  try {
    const updated = (await labelCandidate(candidate.id, label)).data
    const list = candidates.value[candidate.question_id]
    if (list) {
      const index = list.findIndex((item) => item.id === updated.id)
      if (index >= 0) list[index] = updated
    }
    await refreshActive()
  } catch (err) {
    error.value = formatApiError(err, '保存标注失败')
  } finally {
    savingLabel.value = null
  }
}

async function onRemoveQuestion(question: EvalQuestionSummary) {
  if (!window.confirm(`删除问题「${question.query}」？`)) return
  try {
    await removeQuestion(question.id)
    await refreshSets()
    flash('问题已删除')
  } catch (err) {
    error.value = formatApiError(err, '删除问题失败')
  }
}

async function onCreateRun() {
  if (!activeSetId.value) return
  savingRun.value = true
  try {
    const run = (await createEvalRun(activeSetId.value)).data
    runs.value = (await listEvalRuns(activeSetId.value)).data
    activeRun.value = (await getEvalRun(run.id)).data
    showHistory.value = true
    flash('评测快照已生成')
  } catch (err) {
    error.value = formatApiError(err, '生成评测快照失败')
  } finally {
    savingRun.value = false
  }
}

async function onOpenRun(run: EvalRunSummary) {
  if (activeRun.value?.id === run.id) {
    activeRun.value = null
    return
  }
  try {
    activeRun.value = (await getEvalRun(run.id)).data
  } catch (err) {
    error.value = formatApiError(err, '读取快照失败')
  }
}

function stateInfo(question: EvalQuestionSummary): { text: string; tone: string } {
  if (!question.pooled_at) return { text: '待生成候选', tone: 'pending' }
  if (!question.complete) {
    return { text: `待标注 ${question.labeled_count}/${question.candidate_count}`, tone: 'warn' }
  }
  if (question.relevant_count === 0) return { text: '池内无相关', tone: 'warn' }
  return { text: '已完成', tone: 'ok' }
}

function channels(candidate: EvalCandidate): string[] {
  const result: string[] = []
  if (candidate.knn_rank) result.push(`kNN #${candidate.knn_rank}`)
  if (candidate.bm25_rank) result.push(`BM25 #${candidate.bm25_rank}`)
  return result
}

onMounted(async () => {
  await Promise.all([refreshKbs(), refreshSets()])
})
</script>

<template>
  <section class="eval">
    <header class="eval__top">
      <div class="eval__title">
        <button class="btn btn--sm" @click="router.push('/agent')">返回助手</button>
        <h1>知识库检索评测</h1>
        <p class="eval__hint">
          先给每道题生成 kNN + BM25 候选池，再逐条人工标注；只有标注完整的题才计入汇总。
        </p>
      </div>
      <div class="eval__actions">
        <button class="btn" @click="showCreate = !showCreate">新建题集</button>
        <button class="btn" :disabled="!detail || pooling || !questions.length" @click="onPoolAll">
          {{ pooling ? '处理中…' : '批量生成候选' }}
        </button>
        <button
          class="btn btn--primary"
          :disabled="!detail || savingRun || metrics.complete_count === 0"
          @click="onCreateRun"
        >
          {{ savingRun ? '生成中…' : '生成评测快照' }}
        </button>
      </div>
    </header>

    <ErrorBanner v-if="error" :message="error" retryable @retry="refreshSets" @close="error = ''" />
    <p v-if="notice" class="eval__notice">{{ notice }}</p>

    <div v-if="showCreate" class="eval__panel eval__panel--column">
      <input v-model="newSet.name" class="eval__input" placeholder="题集名称，例如：运维检索回归集" />
      <input v-model="newSet.description" class="eval__input" placeholder="描述（可选）" />
      <div class="eval__kb-pick">
        <label v-for="kb in kbs" :key="kb.id">
          <input v-model="newSet.kb_ids" type="checkbox" :value="kb.id" />
          {{ kb.name }}
        </label>
        <span v-if="!kbs.length" class="eval__muted">还没有知识库，可先不选（表示全部知识库）</span>
        <span v-else class="eval__muted">不勾选表示全部知识库</span>
      </div>
      <div class="eval__create-row">
        <label>
          k：
          <select v-model.number="newSet.top_k" class="eval__select">
            <option v-for="k in [5, 8, 10, 20]" :key="k" :value="k">P@{{ k }} / R@{{ k }}</option>
          </select>
        </label>
        <button class="btn btn--primary" :disabled="loading" @click="onCreateSet">创建</button>
      </div>
    </div>

    <div class="eval__body">
      <aside class="eval__side">
        <div class="eval__side-title">题集</div>
        <ul>
          <li v-for="item in sets" :key="item.id" class="eval__set" :class="{ 'is-active': item.id === activeSetId }">
            <button class="eval__set-btn" @click="selectSet(item.id)">
              <span class="eval__set-name">{{ item.name }}</span>
              <span class="eval__muted">{{ setKbText(item) }}</span>
              <span class="eval__muted">
                {{ item.complete_count }}/{{ item.question_count }} 完整 · {{ item.pooled_count }} 已池化
              </span>
            </button>
          </li>
          <li v-if="!sets.length" class="eval__muted">
            {{ loading ? '加载中…' : '还没有题集，点右上角新建' }}
          </li>
        </ul>
        <button v-if="activeSet" class="btn btn--sm btn--danger eval__delete-set" @click="onDeleteSet">
          删除当前题集
        </button>
      </aside>

      <main v-if="detail" class="eval__main">
        <div class="eval__metrics">
          <div class="metric">
            <span class="metric__label">精确率 P@{{ topK }}</span>
            <strong class="metric__value">{{ formatPercent(metrics.precision) }}</strong>
            <span class="metric__hint">前 {{ topK }} 条中相关占比</span>
          </div>
          <div class="metric">
            <span class="metric__label">召回率 R@{{ topK }}</span>
            <strong class="metric__value">{{ formatPercent(metrics.recall) }}</strong>
            <span class="metric__hint">分母 = 池内标注相关 {{ metrics.relevant_candidates }} 条</span>
          </div>
          <div class="metric">
            <span class="metric__label">MRR@{{ topK }}</span>
            <strong class="metric__value">{{ formatPercent(metrics.mrr) }}</strong>
            <span class="metric__hint">第一条相关片段的倒数名次</span>
          </div>
          <div class="metric">
            <span class="metric__label">标注进度</span>
            <strong class="metric__value">{{ metrics.complete_count }}/{{ metrics.question_count }}</strong>
            <span class="metric__hint">
              已标注 {{ metrics.labeled_candidates }}/{{ metrics.total_candidates }} 片段
            </span>
          </div>
        </div>
        <p class="eval__note">
          召回率 = 前 {{ topK }} 条中相关片段 ÷ 候选池内全部标注为相关的片段（池化召回，不是全库）；
          未标注完整的题不计入汇总。0 不相关 / 1 部分相关 / 2 高度相关。
        </p>

        <div class="eval__import">
          <textarea
            v-model="importText"
            class="eval__textarea"
            rows="3"
            placeholder="导入问题：一行一题，最多 100 条"
          />
          <button class="btn" :disabled="loading || !importText.trim()" @click="onImport">导入问题</button>
        </div>

        <ul class="eval__questions">
          <li v-for="(question, index) in questions" :key="question.id" class="eval__question">
            <header class="eval__question-head" @click="toggleQuestion(question)">
              <span class="eval__q-index">{{ index + 1 }}</span>
              <span class="eval__q-text">{{ question.query }}</span>
              <span class="badge" :class="`badge--${stateInfo(question).tone}`">
                {{ stateInfo(question).text }}
              </span>
              <span v-if="question.complete" class="eval__q-metrics">
                P {{ formatPercent(question.precision) }} · R {{ formatPercent(question.recall) }} · MRR
                {{ formatPercent(question.mrr) }}
              </span>
              <span v-else class="eval__muted">
                {{ question.labeled_count }}/{{ question.candidate_count }} 已标注
              </span>
              <button
                class="btn btn--sm"
                :disabled="pooling"
                @click.stop="onPoolQuestion(question)"
              >
                {{ question.candidate_count ? '重新池化' : '生成候选' }}
              </button>
              <button class="btn btn--sm btn--danger" @click.stop="onRemoveQuestion(question)">删除</button>
            </header>

            <div v-if="expanded[question.id]" class="eval__candidates">
              <p v-if="candidatesLoading[question.id]" class="eval__muted">候选加载中…</p>
              <p v-else-if="!candidates[question.id]?.length" class="eval__muted">
                还没有候选，点「生成候选」。
              </p>
              <article v-for="candidate in candidates[question.id]" :key="candidate.id" class="cand">
                <div class="cand__head">
                  <span class="cand__rank">#{{ candidate.rrf_rank }}</span>
                  <span class="cand__title">
                    {{ candidate.title }}
                    <span class="eval__muted">#{{ candidate.seq }}</span>
                  </span>
                  <span class="cand__channels">
                    <span v-for="channel in channels(candidate)" :key="channel">{{ channel }}</span>
                    <span v-if="!channels(candidate).length" class="eval__muted">—</span>
                  </span>
                  <span class="cand__labels">
                    <button
                      v-for="option in LABEL_OPTIONS"
                      :key="option.value"
                      class="cand__label"
                      :class="{ 'is-active': candidate.label === option.value }"
                      :title="option.hint"
                      :disabled="savingLabel !== null"
                      @click="onLabel(candidate, option.value)"
                    >
                      {{ option.text }}
                    </button>
                    <button
                      v-if="candidate.label !== null"
                      class="cand__label cand__label--clear"
                      :disabled="savingLabel !== null"
                      @click="onLabel(candidate, null)"
                    >
                      清除
                    </button>
                  </span>
                </div>
                <p
                  class="cand__text"
                  :class="{ 'is-expanded': expandedText[candidate.id] }"
                  @click="expandedText[candidate.id] = !expandedText[candidate.id]"
                >
                  {{ candidate.text }}
                </p>
              </article>
            </div>
          </li>
          <li v-if="!questions.length" class="eval__muted">
            还没有问题，把每行一道题贴到上面的输入框里导入。
          </li>
        </ul>

        <section class="eval__history">
          <button class="btn btn--sm" @click="showHistory = !showHistory">
            评测历史（{{ runs.length }}）
          </button>
          <template v-if="showHistory">
            <ul v-if="runs.length" class="eval__runs">
              <li
                v-for="run in runs"
                :key="run.id"
                class="eval__run"
                :class="{ 'is-active': activeRun?.id === run.id }"
                @click="onOpenRun(run)"
              >
                <span>{{ formatTime(run.created_at) }}</span>
                <span>P {{ formatPercent(run.precision) }}</span>
                <span>R {{ formatPercent(run.recall) }}</span>
                <span>MRR {{ formatPercent(run.mrr) }}</span>
                <span class="eval__muted">
                  {{ run.complete_count }}/{{ run.question_count }} 题 · k={{ run.top_k }}
                </span>
              </li>
            </ul>
            <p v-else class="eval__muted">还没有快照；标注完整后点右上角「生成评测快照」。</p>

            <div v-if="activeRun" class="eval__run-detail">
              <header>
                <strong>快照 {{ formatTime(activeRun.created_at) }}</strong>
                <span class="eval__muted">
                  P {{ formatPercent(activeRun.precision) }} · R {{ formatPercent(activeRun.recall) }} ·
                  MRR {{ formatPercent(activeRun.mrr) }}
                </span>
              </header>
              <ul>
                <li v-for="item in activeRun.detail.questions" :key="item.id">
                  <span class="eval__q-text">{{ item.query }}</span>
                  <span v-if="item.complete" class="eval__muted">
                    P {{ formatPercent(item.precision) }} · R {{ formatPercent(item.recall) }} · MRR
                    {{ formatPercent(item.mrr) }}
                  </span>
                  <span v-else class="eval__muted">未标注完整</span>
                </li>
              </ul>
            </div>
          </template>
        </section>
      </main>

      <main v-else class="eval__main eval__main--empty">
        {{ loading ? '加载中…' : '选择左侧题集，或先新建一个' }}
      </main>
    </div>
  </section>
</template>

<style scoped>
.eval {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px;
  overflow: hidden;
}

.eval__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.eval__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.eval__title h1 {
  margin: 0;
  font-size: 16px;
}

.eval__hint {
  margin: 0;
  color: #8b949e;
  font-size: 12px;
  line-height: 1.6;
}

.eval__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.eval__notice {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #2f5a37;
  background: #223327;
  color: #9ee6a8;
  font-size: 12px;
  border-radius: 4px;
}

.eval__panel {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
}

.eval__panel--column {
  flex-direction: column;
  align-items: stretch;
}

.eval__input,
.eval__select,
.eval__textarea {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
}

.eval__textarea {
  flex: 1;
  min-width: 200px;
  resize: vertical;
  line-height: 1.6;
}

.eval__kb-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 12px;
  color: #c8c8c8;
}

.eval__kb-pick label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.eval__create-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.eval__body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.eval__side {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
  padding: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.eval__side-title {
  font-size: 12px;
  color: #8b949e;
  padding: 2px 6px 4px;
}

.eval__side ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.eval__set {
  border-radius: 4px;
}

.eval__set.is-active {
  background: #2d2d30;
}

.eval__set-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
}

.eval__set-name {
  font-size: 13px;
  color: #e6edf3;
}

.eval__delete-set {
  margin-top: auto;
}

.eval__main {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.eval__main--empty {
  align-items: center;
  justify-content: center;
  color: #8b949e;
  font-size: 13px;
}

.eval__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #30363d;
  background: #1b1f24;
  border-radius: 8px;
}

.metric__label {
  font-size: 11px;
  color: #8b949e;
}

.metric__value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #e6edf3;
}

.metric__hint {
  font-size: 10px;
  color: #6e7681;
}

.eval__note {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  color: #8b949e;
  border-left: 2px solid #30363d;
  padding-left: 8px;
}

.eval__import {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.eval__questions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.eval__question {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #1e1e1e;
  overflow: hidden;
}

.eval__question-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  flex-wrap: wrap;
}

.eval__question-head:hover {
  background: rgba(88, 166, 255, 0.06);
}

.eval__q-index {
  min-width: 22px;
  color: #6e7681;
  font-variant-numeric: tabular-nums;
}

.eval__q-text {
  flex: 1;
  min-width: 160px;
  color: #e6edf3;
  word-break: break-word;
}

.eval__q-metrics {
  color: #9ee6a8;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.eval__candidates {
  border-top: 1px solid #2f2f2f;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cand {
  border: 1px solid #30363d;
  border-radius: 6px;
  background: #161b22;
  padding: 8px;
}

.cand__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.cand__rank {
  color: #58a6ff;
  font-variant-numeric: tabular-nums;
}

.cand__title {
  flex: 1;
  min-width: 140px;
  color: #e6edf3;
  word-break: break-word;
}

.cand__channels {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: #8b949e;
}

.cand__channels span {
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 0 6px;
}

.cand__labels {
  display: flex;
  gap: 4px;
}

.cand__label {
  min-width: 26px;
  padding: 2px 6px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background: #21262d;
  color: #c8c8c8;
  font-size: 11px;
  cursor: pointer;
}

.cand__label:hover {
  border-color: #58a6ff;
}

.cand__label.is-active {
  border-color: #2f81f7;
  background: #1f3a5f;
  color: #79c0ff;
}

.cand__label--clear {
  color: #8b949e;
}

.cand__text {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: #9cdcfe;
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
}

.cand__text.is-expanded {
  display: block;
  overflow: visible;
}

.eval__history {
  border-top: 1px solid #2f2f2f;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.eval__runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eval__run {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid #30363d;
  border-radius: 4px;
  background: #1e1e1e;
  font-size: 11px;
  cursor: pointer;
}

.eval__run:hover,
.eval__run.is-active {
  border-color: #2f81f7;
  background: #17253a;
}

.eval__run-detail {
  border: 1px solid #30363d;
  border-radius: 6px;
  background: #1e1e1e;
  padding: 8px 10px;
}

.eval__run-detail header {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
  font-size: 12px;
}

.eval__run-detail ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}

.eval__run-detail li {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.eval__muted {
  color: #8b949e;
  font-size: 12px;
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.badge--ok {
  color: #3fb950;
  border-color: #2f5a37;
  background: #1c2b20;
}

.badge--warn {
  color: #e3b341;
  border-color: #6b5218;
  background: #332b17;
}

.badge--pending {
  color: #58a6ff;
  border-color: #1f3f66;
  background: #17253a;
}
</style>
