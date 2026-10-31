<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createCategory,
  createKb,
  listCategories,
  listChunks,
  listDocs,
  listKbs,
  updateKb,
  rebuildDoc,
  reindexKb,
  removeCategory,
  removeDoc,
  removeKb,
  reviewDoc,
  searchKb,
  updateCategory,
  uploadDoc,
  type KbCategory,
  type KbChunk,
  type KbDoc,
  type KbHit,
  type KbItem,
} from '@/api/agent'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { formatApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'AgentKbView' })

const auth = useAuthStore()
const isAdmin = computed(() => auth.hasPermission('agent.kb.manage'))

const kbs = ref<KbItem[]>([])
const categories = ref<KbCategory[]>([])
const activeKb = ref('')
const docs = ref<KbDoc[]>([])
const hits = ref<KbHit[]>([])
const chunks = ref<KbChunk[]>([])
const detailDoc = ref<KbDoc | null>(null)
const query = ref('')
const loading = ref(false)
const reindexing = ref(false)
const error = ref('')
const kbsError = ref(false)
const notice = ref('')

const newKbName = ref('')
const newCategory = ref('')
const uploadTitle = ref('')
const uploadCategory = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const showNewKb = ref(false)
const showCategories = ref(false)

const active = computed(() => kbs.value.find((item) => item.id === activeKb.value) ?? null)
const pendingDocs = computed(() => docs.value.filter((doc) => doc.review_status === 'pending'))
// 所有用户都能看到知识库里的全部文档（含待审核/被驳回），状态用徽标表达
const visibleDocs = computed(() => docs.value)

const STATUS_TEXT: Record<string, string> = {
  waiting: '待审核',
  pending: '排队中',
  parsing: '解析中',
  chunking: '切块中',
  embedding: '向量化中',
  ready: '已入库',
  failed: '构建失败',
  rejected: '已驳回',
}

function docState(doc: KbDoc): { text: string; tone: string } {
  if (doc.review_status === 'pending') return { text: '待审核', tone: 'warn' }
  if (doc.review_status === 'rejected') return { text: '已驳回', tone: 'danger' }
  const text = STATUS_TEXT[doc.status] ?? doc.status
  if (doc.status === 'ready') return { text, tone: 'ok' }
  if (doc.status === 'failed') return { text, tone: 'danger' }
  return { text, tone: 'pending' }
}

function categoryName(id: string | null): string {
  if (!id) return '未分类'
  return categories.value.find((item) => item.id === id)?.name ?? '未分类'
}

function flash(message: string) {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 4000)
}

async function refreshKbs() {
  kbsError.value = false
  try {
    kbs.value = (await listKbs()).data
    if (!activeKb.value && kbs.value.length) activeKb.value = kbs.value[0]!.id
    if (activeKb.value) await refreshDocs()
  } catch (err) {
    // 加载失败时别把「没有知识库」当空状态展示，否则会误导
    kbsError.value = true
    error.value = formatApiError(err, '知识库加载失败')
  }
}

async function refreshDocs() {
  if (!activeKb.value) return
  docs.value = (await listDocs(activeKb.value)).data
}

async function refreshCategories() {
  try {
    categories.value = (await listCategories()).data
  } catch {
    categories.value = []
  }
}

async function selectKb(id: string) {
  activeKb.value = id
  detailDoc.value = null
  hits.value = []
  chunks.value = []
  await refreshDocs()
}

async function onCreateKb() {
  if (!newKbName.value.trim()) return
  loading.value = true
  try {
    const created = await createKb(newKbName.value.trim())
    newKbName.value = ''
    showNewKb.value = false
    await refreshKbs()
    await selectKb(created.data.id)
    flash('知识库已创建')
  } catch (err) {
    error.value = formatApiError(err, '创建知识库失败')
  } finally {
    loading.value = false
  }
}

async function onDeleteKb() {
  if (!activeKb.value) return
  if (!window.confirm(`删除知识库「${active.value?.name}」及全部文档？该操作不可恢复。`)) return
  try {
    await removeKb(activeKb.value)
    activeKb.value = ''
    docs.value = []
    await refreshKbs()
    flash('知识库已删除')
  } catch (err) {
    error.value = formatApiError(err, '删除知识库失败')
  }
}

async function onPickFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!activeKb.value) {
    error.value = '请先选择知识库'
    return
  }
  loading.value = true
  try {
    await uploadDoc(activeKb.value, file, uploadTitle.value, uploadCategory.value)
    uploadTitle.value = ''
    await refreshDocs()
    flash(isAdmin.value ? '已上传，可在待审核列表里审核' : '已提交，等待管理员审核通过后进入知识库')
  } catch (err) {
    error.value = formatApiError(err, '上传失败')
  } finally {
    loading.value = false
    target.value = ''
  }
}

async function onReview(doc: KbDoc, action: 'approve' | 'reject') {
  let note = ''
  if (action === 'reject') {
    const input = window.prompt(`驳回「${doc.title}」，填写原因（可选）：`)
    if (input === null) return
    note = input
  }
  try {
    await reviewDoc(activeKb.value, doc.id, action, note)
    await refreshDocs()
    flash(action === 'approve' ? '已通过，正在构建索引' : '已驳回')
    if (action === 'approve') pollIngest()
  } catch (err) {
    error.value = formatApiError(err, '审核失败')
  }
}

function pollIngest() {
  let tries = 0
  const timer = window.setInterval(async () => {
    tries += 1
    await refreshDocs().catch(() => undefined)
    const busy = docs.value.some((doc) =>
      ['pending', 'parsing', 'chunking', 'embedding'].includes(doc.status),
    )
    if (!busy || tries > 60) window.clearInterval(timer)
  }, 2000)
}

async function onReindex() {
  if (!activeKb.value) return
  reindexing.value = true
  try {
    const result = await reindexKb(activeKb.value)
    await refreshDocs()
    flash(`已提交重建：${result.data.queued} 篇文档排队构建索引`)
    pollIngest()
  } catch (err) {
    error.value = formatApiError(err, '重建索引失败')
  } finally {
    reindexing.value = false
  }
}

async function onRebuild(doc: KbDoc) {
  try {
    await rebuildDoc(activeKb.value, doc.id)
    await refreshDocs()
    pollIngest()
  } catch (err) {
    error.value = formatApiError(err, '重建失败')
  }
}

async function onDeleteDoc(doc: KbDoc) {
  if (!window.confirm(`删除文档「${doc.title}」？`)) return
  try {
    await removeDoc(activeKb.value, doc.id)
    if (detailDoc.value?.id === doc.id) detailDoc.value = null
    await refreshDocs()
    flash('文档已删除')
  } catch (err) {
    error.value = formatApiError(err, '删除文档失败')
  }
}

/** 点文档看详情：元信息 + 正文切块（所有用户都能看）。 */
async function onViewDoc(doc: KbDoc) {
  try {
    chunks.value = (await listChunks(activeKb.value, doc.id)).data
    detailDoc.value = doc
  } catch (err) {
    error.value = formatApiError(err, '读取文档详情失败')
  }
}

/** 管理员切换"对普通用户可见"，默认可见。 */
async function onToggleVisible() {
  if (!active.value) return
  const next = !active.value.visible
  try {
    await updateKb(active.value.id, { visible: next })
    active.value.visible = next
    flash(next ? '已设为对普通用户可见' : '已对普通用户隐藏')
    await refreshKbs()
  } catch (err) {
    error.value = formatApiError(err, '切换可见性失败')
  }
}

async function onSearch() {
  if (!query.value.trim()) return
  loading.value = true
  try {
    hits.value = (await searchKb(query.value.trim(), activeKb.value ? [activeKb.value] : [])).data
  } catch (err) {
    error.value = formatApiError(err, '检索失败')
  } finally {
    loading.value = false
  }
}

async function onCreateCategory() {
  if (!newCategory.value.trim()) return
  try {
    await createCategory(newCategory.value.trim())
    newCategory.value = ''
    await refreshCategories()
    flash('分类已创建')
  } catch (err) {
    error.value = formatApiError(err, '创建分类失败')
  }
}

async function onRenameCategory(category: KbCategory) {
  const name = window.prompt('新的分类名称', category.name)
  if (!name || name.trim() === category.name) return
  try {
    await updateCategory(category.id, { name: name.trim() })
    await refreshCategories()
  } catch (err) {
    error.value = formatApiError(err, '改名失败')
  }
}

async function onDeleteCategory(category: KbCategory) {
  if (!window.confirm(`删除分类「${category.name}」？文档不会被删除，只会变成未分类。`)) return
  try {
    await removeCategory(category.id)
    await refreshCategories()
    await refreshDocs()
  } catch (err) {
    error.value = formatApiError(err, '删除分类失败')
  }
}

onMounted(async () => {
  await Promise.all([refreshKbs(), refreshCategories()])
})
</script>

<template>
  <section class="kb">
    <header class="kb__top">
      <div class="kb__title">
        <h1>知识库</h1>
        <p class="kb__hint">
          {{
            isAdmin
              ? '管理员：建库 / 分类 / 审核 / 重建索引，并可控制知识库对普通用户是否可见；审核通过的文档才会进入索引，被 agent 检索到。'
              : '所有文档都能点开看详情；自己上传的文件先等管理员审核，通过后才会被 agent 检索到。'
          }}
        </p>
      </div>
      <div class="kb__actions">
        <template v-if="isAdmin">
          <button
            class="btn"
            :disabled="!activeKb"
            :title="active?.visible ? '当前对普通用户可见，点击隐藏' : '当前对普通用户隐藏，点击恢复可见'"
            @click="onToggleVisible"
          >
            {{ active?.visible ? '可见：开' : '可见：关' }}
          </button>
          <button class="btn" @click="showNewKb = !showNewKb">新建知识库</button>
          <button class="btn" @click="showCategories = !showCategories">分类管理</button>
          <button class="btn" :disabled="!activeKb || reindexing" @click="onReindex">
            {{ reindexing ? '提交中…' : '重建索引' }}
          </button>
          <button class="btn btn--danger" :disabled="!activeKb" @click="onDeleteKb">删除知识库</button>
        </template>
      </div>
    </header>

    <ErrorBanner v-if="error" :message="error" retryable @retry="refreshKbs" @close="error = ''" />
    <p v-if="notice" class="kb__notice">{{ notice }}</p>

    <div v-if="showNewKb && isAdmin" class="kb__panel">
      <input v-model="newKbName" placeholder="新知识库名称" @keydown.enter="onCreateKb" />
      <button class="btn" :disabled="loading" @click="onCreateKb">创建</button>
    </div>

    <div v-if="showCategories && isAdmin" class="kb__panel kb__panel--column">
      <div class="kb__cat-add">
        <input v-model="newCategory" placeholder="新分类名称，例如：运维手册" @keydown.enter="onCreateCategory" />
        <button class="btn" @click="onCreateCategory">添加分类</button>
      </div>
      <ul class="kb__cats">
        <li v-for="category in categories" :key="category.id">
          <span class="kb__cat-name">{{ category.name }}</span>
          <span class="kb__muted">{{ category.doc_count }} 篇</span>
          <button class="btn btn--sm" @click="onRenameCategory(category)">改名</button>
          <button class="btn btn--sm btn--danger" @click="onDeleteCategory(category)">删除</button>
        </li>
        <li v-if="!categories.length" class="kb__muted">还没有分类，可以按业务域建几个，比如"运维手册 / 发布规范 / 常见问题"</li>
      </ul>
    </div>

    <div class="kb__body">
      <aside class="kb__side">
        <div class="kb__side-title">知识库</div>
        <ul>
          <li
            v-for="item in kbs"
            :key="item.id"
            class="kb__side-item"
            :class="{ 'is-active': item.id === activeKb }"
          >
            <button class="kb__side-btn" @click="selectKb(item.id)">
              <span class="kb__side-name">{{ item.name }}</span>
              <span class="kb__muted">{{ item.approved_count }}/{{ item.doc_count }} 篇</span>
            </button>
            <span v-if="isAdmin && item.visible === false" class="badge badge--warn">已隐藏</span>
            <span v-if="item.pending_review" class="badge badge--warn">{{ item.pending_review }} 待审</span>
          </li>
          <li v-if="!kbs.length" class="kb__muted">
            {{ kbsError ? '知识库加载失败，请点上方「重试」' : isAdmin ? '还没有知识库，点右上角新建' : '管理员还没有创建知识库' }}
          </li>
        </ul>
      </aside>

      <main v-if="active" class="kb__main">
        <div class="kb__upload">
          <input ref="fileInput" type="file" hidden @change="onPickFile" />
          <input v-model="uploadTitle" class="kb__input" placeholder="标题（可选，默认用文件名）" />
          <select v-model="uploadCategory" class="kb__input kb__input--sm">
            <option value="">未分类</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
          <button class="btn btn--primary" :disabled="loading" @click="fileInput?.click()">
            选择文件上传
          </button>
          <span class="kb__muted">md / txt / pdf / docx，20MB 内</span>
        </div>

        <div v-if="isAdmin && pendingDocs.length" class="kb__review">
          <div class="kb__review-head">待审核 {{ pendingDocs.length }} 篇</div>
          <ul>
            <li v-for="doc in pendingDocs" :key="doc.id">
              <span class="kb__doc-name">{{ doc.title }}</span>
              <span class="kb__muted">{{ categoryName(doc.category_id) }}</span>
              <button class="btn btn--sm btn--primary" @click="onReview(doc, 'approve')">通过并入库</button>
              <button class="btn btn--sm btn--danger" @click="onReview(doc, 'reject')">驳回</button>
            </li>
          </ul>
        </div>

        <div class="kb__search">
          <input
            v-model="query"
            class="kb__input"
            placeholder="在知识库里搜一段话，验证召回效果"
            @keydown.enter="onSearch"
          />
          <button class="btn" :disabled="loading" @click="onSearch">检索</button>
        </div>
        <ul v-if="hits.length" class="kb__hits">
          <li v-for="(hit, index) in hits" :key="`${hit.doc_id}-${hit.seq}-${index}`">
            <div class="kb__hit-head">
              <span class="kb__score">{{ hit.score.toFixed(3) }}</span>
              <span>{{ hit.title }}</span>
              <span class="kb__seq">#{{ hit.seq }}</span>
            </div>
            <pre>{{ hit.text.slice(0, 240) }}</pre>
          </li>
        </ul>

        <table class="kb__docs">
          <thead>
            <tr>
              <th>文档</th>
              <th>分类</th>
              <th>状态</th>
              <th>块数</th>
              <th>上传时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in visibleDocs" :key="doc.id" class="kb__row" @click="onViewDoc(doc)">
              <td class="kb__doc-name">{{ doc.title }}</td>
              <td class="kb__muted">{{ categoryName(doc.category_id) }}</td>
              <td>
                <span class="badge" :class="`badge--${docState(doc).tone}`">{{ docState(doc).text }}</span>
                <span v-if="doc.review_status === 'approved' && doc.review_note" class="kb__muted">
                  {{ doc.review_note }}
                </span>
              </td>
              <td>{{ doc.chunk_count }}</td>
              <td class="kb__muted">{{ doc.created_at?.replace('T', ' ').slice(0, 16) }}</td>
              <td class="kb__row-actions" @click.stop>
                <button class="btn btn--sm" @click="onViewDoc(doc)">详情</button>
                <template v-if="isAdmin">
                  <button class="btn btn--sm" :disabled="doc.review_status !== 'approved'" @click="onRebuild(doc)">
                    重建
                  </button>
                  <button class="btn btn--sm btn--danger" @click="onDeleteDoc(doc)">删除</button>
                </template>
              </td>
            </tr>
            <tr v-if="!visibleDocs.length">
              <td colspan="6" class="kb__muted">
                还没有文档。{{ isAdmin ? '上传后记得在待审核列表里点通过。' : '上传文件后等管理员审核。' }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="detailDoc" class="kb__detail">
          <header class="kb__detail-head">
            <div>
              <strong>{{ detailDoc.title }}</strong>
              <span class="badge" :class="`badge--${docState(detailDoc).tone}`">{{ docState(detailDoc).text }}</span>
            </div>
            <button class="btn btn--sm" @click="detailDoc = null">关闭</button>
          </header>
          <dl class="kb__detail-meta">
            <div><dt>分类</dt><dd>{{ categoryName(detailDoc.category_id) }}</dd></div>
            <div><dt>块数</dt><dd>{{ detailDoc.chunk_count }}</dd></div>
            <div><dt>上传时间</dt><dd>{{ detailDoc.created_at?.replace('T', ' ').slice(0, 16) }}</dd></div>
            <div v-if="detailDoc.review_note"><dt>审核备注</dt><dd>{{ detailDoc.review_note }}</dd></div>
          </dl>
          <div class="kb__detail-body">
            <p class="kb__muted">{{ chunks.length ? `正文切块（${chunks.length} 块，可据此核对检索命中）` : '这篇文档还没有切块（等审核通过后才会入库）' }}</p>
            <ol class="kb__chunk-list">
              <li v-for="chunk in chunks" :key="chunk.id">
                <span class="kb__seq">#{{ chunk.seq }}</span>
                <pre>{{ chunk.text }}</pre>
              </li>
            </ol>
          </div>
        </div>
      </main>

      <main v-else class="kb__main kb__main--empty">
        {{ kbsError ? '知识库加载失败，请点上方「重试」' : isAdmin ? '选择左侧知识库，或先新建一个' : '等待管理员创建并开放知识库' }}
      </main>
    </div>
  </section>
</template>

<style scoped>
.kb {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px;
  overflow: hidden;
}

.kb__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.kb__title h1 {
  margin: 0;
  font-size: 16px;
}

.kb__hint {
  margin: 4px 0 0;
  color: #8b949e;
  font-size: 12px;
  line-height: 1.6;
}

.kb__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.kb__error {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #5a2b2b;
  background: #3a2222;
  color: #ffb3b3;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.kb__notice {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #2f5a37;
  background: #223327;
  color: #9ee6a8;
  font-size: 12px;
  border-radius: 4px;
}

.kb__panel {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
}

.kb__panel--column {
  flex-direction: column;
  align-items: stretch;
}

.kb__cat-add {
  display: flex;
  gap: 8px;
}

.kb__cats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb__cats li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.kb__cat-name {
  min-width: 120px;
}

.kb__body {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.kb__side {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
  padding: 8px;
  overflow-y: auto;
}

.kb__side-title {
  font-size: 12px;
  color: #8b949e;
  padding: 2px 6px 8px;
}

.kb__side ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kb__side-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
}

.kb__side-item.is-active {
  background: #2d2d30;
}

.kb__side-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background: transparent;
  border: none;
  color: inherit;
  padding: 6px 8px;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}

.kb__side-name {
  font-size: 13px;
}

.kb__main {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kb__main--empty {
  align-items: center;
  justify-content: center;
  color: #8b949e;
  font-size: 13px;
}

.kb__upload {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.kb__input {
  flex: 1;
  min-width: 160px;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 6px 8px;
  font-size: 12px;
}

.kb__input--sm {
  flex: 0 0 140px;
  min-width: 120px;
}

.kb__review {
  border: 1px solid #6b5218;
  background: #332b17;
  border-radius: 6px;
  padding: 8px 10px;
}

.kb__review-head {
  font-size: 12px;
  color: #e3b341;
  margin-bottom: 6px;
}

.kb__review ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb__review li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.kb__search {
  display: flex;
  gap: 8px;
}

.kb__hits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.kb__hits li {
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 6px 8px;
  background: #1e1e1e;
}

.kb__hit-head {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #8b949e;
}

.kb__hits pre {
  margin: 6px 0 0;
  font-size: 11px;
  color: #9cdcfe;
  white-space: pre-wrap;
  font-family: inherit;
}

.kb__docs {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.kb__docs th,
.kb__docs td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #2f2f2f;
  vertical-align: middle;
}

.kb__docs th {
  color: #8b949e;
  font-weight: 500;
}

.kb__doc-name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb__muted {
  color: #8b949e;
  font-size: 12px;
}

.kb__row-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  border: 1px solid transparent;
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

.badge--danger {
  color: #f85149;
  border-color: #5a2b2b;
  background: #3a2222;
}

.badge--pending {
  color: #58a6ff;
  border-color: #1f3f66;
  background: #17253a;
}

.kb__chunks {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #1e1e1e;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.kb__chunks header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #3c3c3c;
  font-size: 12px;
  color: #8b949e;
}

.kb__chunks ol {
  margin: 0;
  padding: 8px 10px 8px 26px;
  overflow-y: auto;
  font-size: 11px;
}

.kb__chunks pre {
  margin: 4px 0 10px;
  white-space: pre-wrap;
  color: #9cdcfe;
  font-family: inherit;
}

.kb__score {
  color: #3fb950;
  margin-right: 8px;
}

.kb__seq {
  color: #8b949e;
  margin-left: 8px;
  font-size: 11px;
}
.kb__row {
  cursor: pointer;
}

.kb__row:hover {
  background: rgba(88, 166, 255, 0.06);
}

.kb__detail {
  margin-top: 14px;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  background: #252526;
  padding: 12px 14px;
}

.kb__detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.kb__detail-head strong {
  margin-right: 8px;
}

.kb__detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 10px 0;
  font-size: 12px;
}

.kb__detail-meta div {
  display: flex;
  gap: 6px;
}

.kb__detail-meta dt {
  color: #8b8b8b;
}

.kb__detail-meta dd {
  margin: 0;
  color: #d4d4d4;
}

.kb__chunk-list {
  margin: 8px 0 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}

.kb__chunk-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.kb__chunk-list pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: #c8c8c8;
}

</style>
