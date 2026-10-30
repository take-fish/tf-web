<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createKb,
  listChunks,
  listDocs,
  listKbs,
  rebuildDoc,
  removeDoc,
  removeKb,
  searchKb,
  uploadDoc,
  type KbChunk,
  type KbDoc,
  type KbHit,
  type KbItem,
} from '@/api/agent'
import { formatApiError } from '@/lib/http'

defineOptions({ name: 'AgentKbView' })

const kbs = ref<KbItem[]>([])
const activeKb = ref<string>('')
const docs = ref<KbDoc[]>([])
const chunks = ref<KbChunk[]>([])
const chunkDoc = ref<KbDoc | null>(null)
const hits = ref<KbHit[]>([])
const query = ref('')
const loading = ref(false)
const error = ref('')
const newKbName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const uploadTitle = ref('')

const active = computed(() => kbs.value.find((item) => item.id === activeKb.value) ?? null)
const statusText: Record<string, string> = {
  pending: '排队中',
  parsing: '解析中',
  chunking: '切块中',
  embedding: '向量化中',
  ready: '就绪',
  failed: '失败',
}

async function refreshKbs() {
  try {
    kbs.value = (await listKbs()).data
    if (!activeKb.value && kbs.value.length) activeKb.value = kbs.value[0]!.id
    if (activeKb.value) await refreshDocs()
  } catch (err) {
    error.value = formatApiError(err, '知识库加载失败')
  }
}

async function refreshDocs() {
  if (!activeKb.value) return
  docs.value = (await listDocs(activeKb.value)).data
}

async function selectKb(id: string) {
  activeKb.value = id
  chunkDoc.value = null
  hits.value = []
  await refreshDocs()
}

async function onCreateKb() {
  if (!newKbName.value.trim()) return
  loading.value = true
  try {
    const created = await createKb(newKbName.value.trim())
    newKbName.value = ''
    await refreshKbs()
    await selectKb(created.data.id)
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
  } catch (err) {
    error.value = formatApiError(err, '删除知识库失败')
  }
}

async function onPickFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !activeKb.value) return
  loading.value = true
  try {
    await uploadDoc(activeKb.value, file, uploadTitle.value)
    uploadTitle.value = ''
    await refreshDocs()
    pollIngest()
  } catch (err) {
    error.value = formatApiError(err, '上传失败')
  } finally {
    loading.value = false
    target.value = ''
  }
}

function pollIngest() {
  let tries = 0
  const timer = window.setInterval(async () => {
    tries += 1
    await refreshDocs().catch(() => undefined)
    const busy = docs.value.some((doc) => ['pending', 'parsing', 'chunking', 'embedding'].includes(doc.status))
    if (!busy || tries > 40) window.clearInterval(timer)
  }, 2000)
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
    if (chunkDoc.value?.id === doc.id) chunkDoc.value = null
    await refreshDocs()
  } catch (err) {
    error.value = formatApiError(err, '删除失败')
  }
}

async function showChunks(doc: KbDoc) {
  try {
    chunks.value = (await listChunks(activeKb.value, doc.id)).data
    chunkDoc.value = doc
  } catch (err) {
    error.value = formatApiError(err, '读取分块失败')
  }
}

async function onSearch() {
  if (!query.value.trim()) return
  loading.value = true
  try {
    hits.value = (await searchKb(query.value.trim(), activeKb.value ? [activeKb.value] : [], 5)).data
  } catch (err) {
    error.value = formatApiError(err, '检索失败')
  } finally {
    loading.value = false
  }
}

function fmtSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

onMounted(refreshKbs)
</script>

<template>
  <section class="kb">
    <aside class="kb__list">
      <div class="kb__list-head">
        <span>知识库</span>
        <button class="icon-btn" title="新建" @click="newKbName = newKbName || ' '">＋</button>
      </div>
      <div class="kb__create">
        <input v-model="newKbName" placeholder="新知识库名称" @keydown.enter="onCreateKb" />
        <button class="btn btn--primary" :disabled="!newKbName.trim() || loading" @click="onCreateKb">建</button>
      </div>
      <ul class="kb__items">
        <li
          v-for="item in kbs"
          :key="item.id"
          class="kb__item"
          :class="{ 'is-active': item.id === activeKb }"
          @click="selectKb(item.id)"
        >
          <span class="kb__name">{{ item.name }}</span>
          <span class="kb__count">{{ item.doc_count }} 篇</span>
        </li>
        <li v-if="!kbs.length" class="kb__none">还没有知识库</li>
      </ul>
    </aside>

    <div class="kb__main">
      <header class="kb__head">
        <div>
          <h2>{{ active?.name ?? '选择或新建知识库' }}</h2>
          <p v-if="active" class="kb__desc">
            {{ active.description || '未填写说明' }} · {{ active.embedding_model }}（{{ active.dim }} 维）
          </p>
        </div>
        <div class="kb__head-actions">
          <input ref="fileInput" type="file" accept=".md,.markdown,.txt,.pdf,.docx" hidden @change="onPickFile" />
          <input v-model="uploadTitle" class="kb__title-input" placeholder="文档标题（可选）" />
          <button class="btn btn--primary" :disabled="!activeKb || loading" @click="fileInput?.click()">
            上传文档
          </button>
          <button class="btn" :disabled="!activeKb" @click="onDeleteKb">删除库</button>
        </div>
      </header>

      <p v-if="error" class="kb__error">{{ error }}</p>

      <table class="kb__table">
        <thead>
          <tr>
            <th>标题</th>
            <th>格式</th>
            <th>大小</th>
            <th>状态</th>
            <th>分块</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in docs" :key="doc.id">
            <td class="kb__doc-title">{{ doc.title }}</td>
            <td>{{ doc.format }}</td>
            <td>{{ fmtSize(doc.size_bytes) }}</td>
            <td>
              <span class="badge" :class="`badge--${doc.status}`">{{ statusText[doc.status] ?? doc.status }}</span>
              <span v-if="doc.error" class="kb__doc-error" :title="doc.error">!</span>
            </td>
            <td>{{ doc.chunk_count }}</td>
            <td class="kb__row-actions">
              <button class="link-btn" @click="showChunks(doc)">分块</button>
              <button class="link-btn" @click="onRebuild(doc)">重建</button>
              <button class="link-btn link-btn--danger" @click="onDeleteDoc(doc)">删除</button>
            </td>
          </tr>
          <tr v-if="!docs.length">
            <td colspan="6" class="kb__none">还没有文档，支持 md / txt / pdf / docx</td>
          </tr>
        </tbody>
      </table>

      <div class="kb__search">
        <input v-model="query" placeholder="检索测试：输入一句话看命中什么片段" @keydown.enter="onSearch" />
        <button class="btn" :disabled="loading || !query.trim()" @click="onSearch">检索</button>
      </div>
      <ul v-if="hits.length" class="kb__hits">
        <li v-for="(hit, index) in hits" :key="`${hit.doc_id}-${hit.seq}-${index}`">
          <span class="kb__score">{{ hit.score.toFixed(3) }}</span>
          <strong>{{ hit.title }}</strong>
          <span class="kb__seq">第 {{ hit.seq + 1 }} 块</span>
          <p>{{ hit.text.slice(0, 160) }}</p>
        </li>
      </ul>

      <div v-if="chunkDoc" class="kb__chunks">
        <header>
          <span>分块预览：{{ chunkDoc.title }}（{{ chunks.length }} 块）</span>
          <button class="icon-btn" @click="chunkDoc = null">✕</button>
        </header>
        <ol>
          <li v-for="chunk in chunks" :key="chunk.id">
            <span class="kb__seq">#{{ chunk.seq }}</span>
            <pre>{{ chunk.text }}</pre>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.kb {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: var(--fm-bg, #1e1e1e);
  color: var(--fm-fg, #d4d4d4);
}

.kb__list {
  border-right: 1px solid #3c3c3c;
  background: #252526;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.kb__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 12px;
  color: #8b949e;
  border-bottom: 1px solid #3c3c3c;
}

.kb__create {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
}

.kb__create input {
  flex: 1;
  min-width: 0;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 4px 8px;
  font-size: 12px;
}

.kb__items {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}

.kb__item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.kb__item:hover {
  background: #2d2d30;
}

.kb__item.is-active {
  background: #094771;
  border-left-color: #4ea1ff;
}

.kb__count {
  color: #8b949e;
  font-size: 11px;
}

.kb__main {
  padding: 16px 20px;
  overflow-y: auto;
  min-height: 0;
}

.kb__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.kb__head h2 {
  margin: 0;
  font-size: 16px;
}

.kb__desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8b949e;
}

.kb__head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.kb__title-input {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 5px 8px;
  font-size: 12px;
  width: 160px;
}

.btn {
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: inherit;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  background: #0e639c;
  border-color: #1177bb;
  color: #fff;
}

.icon-btn {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
}

.kb__error {
  color: #f85149;
  font-size: 12px;
}

.kb__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.kb__table th,
.kb__table td {
  text-align: left;
  padding: 7px 8px;
  border-bottom: 1px solid #2d2d30;
}

.kb__table th {
  color: #8b949e;
  font-weight: 500;
}

.kb__doc-title {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb__doc-error {
  color: #f85149;
  margin-left: 6px;
  cursor: help;
}

.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
}

.badge--ready {
  color: #3fb950;
  border-color: #238636;
}

.badge--failed {
  color: #f85149;
  border-color: #8b2c25;
}

.badge--pending,
.badge--parsing,
.badge--chunking,
.badge--embedding {
  color: #d29922;
  border-color: #9e6a03;
}

.kb__row-actions {
  display: flex;
  gap: 8px;
}

.link-btn {
  background: none;
  border: 0;
  color: #4ea1ff;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}

.link-btn--danger {
  color: #f85149;
}

.kb__none {
  color: #8b949e;
  text-align: center;
  padding: 18px 0;
}

.kb__search {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.kb__search input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 7px 10px;
  font-size: 13px;
}

.kb__hits {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb__hits li {
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  padding: 8px 10px;
  background: #232323;
  font-size: 12px;
}

.kb__hits p {
  margin: 6px 0 0;
  color: #9aa4ae;
  white-space: pre-wrap;
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

.kb__chunks {
  margin-top: 18px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #232323;
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
</style>
