<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore, type ReaderTemplateId } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import CodeEditorPane from '@/modules/reader/components/CodeEditorPane.vue'
import {
  addAnnotation,
  addBookmark,
  fetchAnnotations,
  fetchBook,
  fetchBookmarks,
  fetchBooks,
  fetchChapter,
  fetchProgress,
  importBook,
  removeBookmark,
  saveProgress,
} from '@/modules/reader/readerApi'
import {
  READER_TEMPLATES,
  formatNovel,
  paragraphAtLine,
  paragraphStartLine,
  splitParagraphs,
} from '@/modules/reader/lib/novelFormatter'
import type {
  Annotation,
  BookDetail,
  Bookmark,
  BookSummary,
  ChapterContent,
} from '@/modules/reader/types'

interface EditorApi {
  scrollToRatio(ratio: number): void
  scrollToLine(line: number): void
  advance(fraction: number): boolean
  getScrollRatio(): number
  focus(): void
  isReady(): boolean
}

const identity = useIdentityStore()
const settings = useSettingsStore()
const skinStore = useSkinStore()

const books = ref<BookSummary[]>([])
const selectedBookId = ref<number | null>(null)
const book = ref<BookDetail | null>(null)
const chapterIndex = ref(0)
const chapter = ref<ChapterContent | null>(null)
const bookmarks = ref<Bookmark[]>([])
const annotations = ref<Annotation[]>([])
const lastAnnotationId = ref(0)
const currentLine = ref(0)
const progressRatio = ref(0)
const editorRef = ref<EditorApi | null>(null)

const loading = ref(false)
const error = ref('')
const autoScroll = ref(false)
const annotationDraft = ref('')
const postingAnnotation = ref(false)
const importOpen = ref(false)
const importFile = ref<File | null>(null)
const importTitle = ref('')
const importAuthor = ref('')
const importing = ref(false)
const importError = ref('')

let progressTimer: ReturnType<typeof setTimeout> | undefined
let annotationTimer: ReturnType<typeof setInterval> | undefined
let autoScrollTimer: ReturnType<typeof setInterval> | undefined

const templateId = computed<ReaderTemplateId>({
  get: () => settings.state.readerTemplate,
  set: (value) => settings.update({ readerTemplate: value }),
})

const light = computed(() => skinStore.effectiveSkin === 'swagger')

const paragraphs = computed(() =>
  chapter.value ? splitParagraphs(chapter.value.content) : [],
)

const formatted = computed(() =>
  formatNovel(
    book.value?.title ?? '',
    chapter.value?.title ?? '',
    chapter.value?.content ?? '',
    templateId.value,
  ),
)

const code = computed(() => formatted.value.lines.join('\n'))

const chapterMeta = computed(() =>
  book.value?.chapters.find((item) => item.chapterIndex === chapterIndex.value),
)

const reviewPercent = computed(() => {
  const total = book.value?.chapterCount ?? 0
  if (total <= 0) return 0
  const ratio = Math.min(1, Math.max(0, progressRatio.value))
  return Math.round(((chapterIndex.value + ratio) / total) * 100)
})

const currentParagraphIndex = computed(() => {
  const direct = paragraphAtLine(formatted.value, currentLine.value)
  if (direct >= 0) return direct
  const starts = formatted.value.paragraphStartLines
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]
    if (start !== undefined && start <= currentLine.value) return i
  }
  return starts.length > 0 ? 0 : -1
})

const currentParagraphBookmarked = computed(() => {
  const paragraphIndex = currentParagraphIndex.value
  if (paragraphIndex < 0) return false
  return bookmarks.value.some(
    (mark) =>
      mark.chapterIndex === chapterIndex.value && mark.paragraphIndex === paragraphIndex,
  )
})

const bookmarkLines = computed(() => {
  const lines: number[] = []
  for (const mark of bookmarks.value) {
    if (mark.chapterIndex !== chapterIndex.value) continue
    const line = formatted.value.paragraphStartLines[mark.paragraphIndex]
    if (line !== undefined) lines.push(line)
  }
  return lines
})

const annotationCounts = computed<Record<number, number>>(() => {
  const counts: Record<number, number> = {}
  for (const annotation of annotations.value) {
    const line = formatted.value.paragraphStartLines[annotation.paragraphIndex]
    if (line === undefined) continue
    counts[line] = (counts[line] ?? 0) + 1
  }
  return counts
})

function errorText(value: unknown): string {
  return formatApiError(value)
}

function clock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

async function persistProgress() {
  if (!selectedBookId.value || !chapter.value) return
  try {
    await saveProgress(
      identity.state.userId,
      selectedBookId.value,
      chapter.value.chapterIndex,
      progressRatio.value,
    )
  } catch {
    // 进度保存失败不阻塞阅读
  }
}

function onScrollRatio(ratio: number) {
  progressRatio.value = ratio
  if (progressTimer) clearTimeout(progressTimer)
  progressTimer = setTimeout(() => void persistProgress(), 2000)
}

async function loadAnnotations(reset: boolean) {
  if (!selectedBookId.value || !chapter.value) return
  try {
    const batch = await fetchAnnotations(
      selectedBookId.value,
      chapter.value.chapterIndex,
      reset ? 0 : lastAnnotationId.value,
    )
    if (batch.length === 0 && !reset) return
    if (reset) annotations.value = []
    const seen = new Set(annotations.value.map((item) => item.id))
    for (const annotation of batch) {
      if (!seen.has(annotation.id)) {
        annotations.value.push(annotation)
        seen.add(annotation.id)
      }
      lastAnnotationId.value = Math.max(lastAnnotationId.value, annotation.id)
    }
  } catch {
    // 协同批注不可用不影响主流程
  }
}

async function loadChapterInternal(index: number, restoreRatio: number) {
  if (!book.value) return
  const data = await fetchChapter(book.value.id, index)
  chapterIndex.value = data.chapterIndex
  chapter.value = data
  annotations.value = []
  lastAnnotationId.value = 0
  currentLine.value = 0
  progressRatio.value = Math.min(1, Math.max(0, restoreRatio))
  await nextTick()
  editorRef.value?.scrollToRatio(progressRatio.value)
  await loadAnnotations(true)
}

async function selectChapter(index: number) {
  if (!book.value || index === chapterIndex.value) return
  await persistProgress()
  loading.value = true
  try {
    await loadChapterInternal(index, 0)
  } catch (value) {
    error.value = errorText(value)
  } finally {
    loading.value = false
  }
}

async function selectBook(bookId: number) {
  loading.value = true
  error.value = ''
  try {
    const detail = await fetchBook(bookId)
    selectedBookId.value = bookId
    book.value = detail
    bookmarks.value = await fetchBookmarks(identity.state.userId, bookId)
    const progress = await fetchProgress(identity.state.userId, bookId)
    const targetChapter =
      progress && progress.chapterIndex < detail.chapterCount ? progress.chapterIndex : 0
    await loadChapterInternal(targetChapter, progress?.scrollRatio ?? 0)
  } catch (value) {
    error.value = errorText(value)
  } finally {
    loading.value = false
  }
}

async function loadBooks() {
  loading.value = true
  error.value = ''
  try {
    books.value = await fetchBooks()
    const first = books.value[0]
    if (first) {
      await selectBook(first.id)
    }
  } catch (value) {
    error.value = errorText(value)
  } finally {
    loading.value = false
  }
}

async function toggleBookmark() {
  if (!book.value || !chapter.value) return
  const paragraphIndex = currentParagraphIndex.value
  if (paragraphIndex < 0) return
  const paragraph = paragraphs.value[paragraphIndex] ?? ''
  try {
    if (currentParagraphBookmarked.value) {
      const existing = bookmarks.value.find(
        (mark) =>
          mark.chapterIndex === chapterIndex.value &&
          mark.paragraphIndex === paragraphIndex,
      )
      if (existing) {
        await removeBookmark(existing.id, identity.state.userId)
      }
    } else {
      await addBookmark(book.value.id, {
        userId: identity.state.userId,
        chapterIndex: chapterIndex.value,
        paragraphIndex,
        excerpt: paragraph.slice(0, 80),
      })
    }
    bookmarks.value = await fetchBookmarks(identity.state.userId, book.value.id)
  } catch (value) {
    error.value = errorText(value)
  }
}

async function deleteBookmark(mark: Bookmark) {
  if (!book.value) return
  try {
    await removeBookmark(mark.id, identity.state.userId)
    bookmarks.value = await fetchBookmarks(identity.state.userId, book.value.id)
  } catch (value) {
    error.value = errorText(value)
  }
}

async function jumpToBookmark(mark: Bookmark) {
  if (!book.value) return
  if (mark.chapterIndex !== chapterIndex.value) {
    await selectChapter(mark.chapterIndex)
  }
  await nextTick()
  const line = paragraphStartLine(formatted.value, mark.paragraphIndex)
  editorRef.value?.scrollToLine(line)
}

async function jumpToAnnotation(annotation: Annotation) {
  await nextTick()
  const line = paragraphStartLine(formatted.value, annotation.paragraphIndex)
  editorRef.value?.scrollToLine(line)
}

async function submitAnnotation() {
  if (!book.value || !chapter.value || postingAnnotation.value) return
  const content = annotationDraft.value.trim()
  const paragraphIndex = currentParagraphIndex.value
  if (!content || paragraphIndex < 0) return
  postingAnnotation.value = true
  try {
    const created = await addAnnotation(book.value.id, chapterIndex.value, {
      userId: identity.state.userId,
      nickname: identity.state.nickname,
      paragraphIndex,
      content,
    })
    annotations.value.push(created)
    lastAnnotationId.value = Math.max(lastAnnotationId.value, created.id)
    annotationDraft.value = ''
  } catch (value) {
    error.value = errorText(value)
  } finally {
    postingAnnotation.value = false
  }
}

function onTemplateChange(event: Event) {
  const ratio = progressRatio.value
  templateId.value = (event.target as HTMLSelectElement).value as ReaderTemplateId
  void nextTick().then(() => {
    requestAnimationFrame(() => editorRef.value?.scrollToRatio(ratio))
  })
}

function onAutoScrollSpeed(event: Event) {
  settings.update({ autoScrollSeconds: Number((event.target as HTMLSelectElement).value) })
}

function stopAutoScrollTimer() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer)
    autoScrollTimer = undefined
  }
}

function startAutoScrollTimer() {
  stopAutoScrollTimer()
  if (!autoScroll.value) return
  autoScrollTimer = setInterval(() => {
    if (skinStore.bossActive || document.visibilityState !== 'visible') return
    const reachedEnd = editorRef.value?.advance(0.8) ?? true
    if (reachedEnd) {
      const next = chapterIndex.value + 1
      if (next < (book.value?.chapterCount ?? 0)) {
        void selectChapter(next)
      } else {
        autoScroll.value = false
      }
    }
  }, Math.max(15, settings.state.autoScrollSeconds) * 1000)
}

function openImport() {
  importOpen.value = true
  importError.value = ''
  importFile.value = null
  importTitle.value = ''
  importAuthor.value = ''
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  if (importFile.value && !importTitle.value) {
    importTitle.value = importFile.value.name.replace(/\.txt$/i, '')
  }
}

async function submitImport() {
  if (!importFile.value || importing.value) {
    importError.value = '请选择 txt 文件'
    return
  }
  importing.value = true
  importError.value = ''
  try {
    const created = await importBook(importFile.value, importTitle.value, importAuthor.value)
    books.value = await fetchBooks()
    importOpen.value = false
    await selectBook(created.id)
  } catch (value) {
    importError.value = errorText(value)
  } finally {
    importing.value = false
  }
}

watch(
  () => autoScroll.value,
  () => startAutoScrollTimer(),
)

watch(
  () => settings.state.autoScrollSeconds,
  () => {
    if (autoScroll.value) startAutoScrollTimer()
  },
)

watch(
  () => skinStore.bossActive,
  (active) => {
    if (active) stopAutoScrollTimer()
    else if (autoScroll.value) startAutoScrollTimer()
  },
)

onMounted(async () => {
  await loadBooks()
  annotationTimer = setInterval(() => {
    if (
      document.visibilityState === 'visible' &&
      !skinStore.bossActive &&
      book.value &&
      chapter.value
    ) {
      void loadAnnotations(false)
    }
  }, 5000)
})

onBeforeUnmount(() => {
  if (progressTimer) clearTimeout(progressTimer)
  if (annotationTimer) clearInterval(annotationTimer)
  stopAutoScrollTimer()
  void persistProgress()
})
</script>

<template>
  <div class="reader">
    <aside class="reader-side">
      <div class="reader-side__head">
        <span>代码仓库</span>
        <button class="reader-mini-btn" title="导入审阅数据集" @click="openImport">+</button>
      </div>
      <button
        v-for="item in books"
        :key="item.id"
        class="reader-book"
        :class="{ 'is-active': selectedBookId === item.id }"
        @click="selectBook(item.id)"
      >
        <AppIcon name="file" :size="13" />
        <span class="reader-book__title">{{ item.title }}</span>
        <em>{{ item.chapterCount }} files</em>
      </button>
      <div v-if="books.length === 0" class="reader-side__empty">
        <p>暂无可审阅仓库</p>
        <button class="reader-link" @click="openImport">导入 txt 数据集</button>
      </div>

      <template v-if="book">
        <div class="reader-side__head reader-side__head--sub">
          <span>{{ book.title }}</span>
          <span>{{ book.chapters.length }}</span>
        </div>
        <button
          v-for="item in book.chapters"
          :key="item.chapterIndex"
          class="reader-chapter"
          :class="{ 'is-active': chapterIndex === item.chapterIndex }"
          @click="selectChapter(item.chapterIndex)"
        >
          <span class="reader-chapter__index">{{ String(item.chapterIndex + 1).padStart(2, '0') }}</span>
          <span class="reader-chapter__title">{{ item.title }}</span>
          <em>{{ item.wordCount }}w</em>
        </button>
      </template>
    </aside>

    <section class="reader-main">
      <div class="reader-toolbar">
        <div class="reader-crumbs">
          <span>{{ book?.title ?? '未选择仓库' }}</span>
          <span class="reader-crumbs__sep">/</span>
          <b>{{ chapter?.title ?? '—' }}</b>
        </div>
        <span v-if="chapterMeta" class="reader-toolbar__meta">
          {{ chapterMeta.wordCount }} 字 · {{ paragraphs.length }} 段
        </span>
        <span class="reader-toolbar__spacer" />
        <label class="reader-control">
          <span>语言</span>
          <select :value="templateId" @change="onTemplateChange">
            <option v-for="item in READER_TEMPLATES" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="reader-control">
          <span>审阅</span>
          <select :value="settings.state.autoScrollSeconds" @change="onAutoScrollSpeed">
            <option :value="30">30s</option>
            <option :value="45">45s</option>
            <option :value="60">60s</option>
          </select>
        </label>
        <button
          class="reader-btn"
          :class="{ 'is-active': autoScroll }"
          :disabled="!chapter"
          @click="autoScroll = !autoScroll"
        >
          <AppIcon :name="autoScroll ? 'pause' : 'play'" :size="12" />
          {{ autoScroll ? '暂停审阅' : '自动审阅' }}
        </button>
        <button class="reader-btn" :disabled="!chapter" @click="toggleBookmark">
          <AppIcon name="bookmark" :size="12" />
          {{ currentParagraphBookmarked ? '取消标记' : '标记行' }}
        </button>
      </div>

      <div v-if="error" class="reader-error-bar">{{ error }}</div>

      <div class="reader-editor">
        <CodeEditorPane
          v-if="chapter"
          ref="editorRef"
          :value="code"
          :language="formatted.language"
          :font-size="settings.state.readerFontSize"
          :light="light"
          :bookmarks="bookmarkLines"
          :annotation-counts="annotationCounts"
          @line-change="currentLine = $event"
          @scroll-ratio="onScrollRatio"
        />
        <div v-else class="reader-empty">
          <template v-if="loading">正在索引代码视图…</template>
          <template v-else-if="error">{{ error }}</template>
          <template v-else>选择左侧仓库开始代码审阅</template>
        </div>
      </div>

      <footer class="reader-status">
        <span>main*</span>
        <span>Ln {{ currentLine + 1 }}, Col 1</span>
        <span>{{ formatted.lines.length }} lines</span>
        <span>UTF-8</span>
        <span>{{ formatted.language.toUpperCase() }}</span>
        <span class="reader-status__spacer" />
        <span>审阅进度 {{ reviewPercent }}%</span>
        <span>{{ identity.state.nickname }}@{{ identity.nodeName }}</span>
      </footer>
    </section>

    <aside class="reader-rail">
      <div class="reader-rail__head">
        <span>评审意见</span>
        <em>{{ annotations.length }}</em>
      </div>
      <form class="reader-annotation-form" @submit.prevent="submitAnnotation">
        <textarea
          v-model="annotationDraft"
          rows="3"
          maxlength="500"
          placeholder="在当前行添加评审意见…"
          :disabled="!chapter || postingAnnotation"
        />
        <button type="submit" :disabled="!annotationDraft.trim() || postingAnnotation">
          提交评审
        </button>
        <span>同步间隔 5s</span>
      </form>
      <div class="reader-rail__list">
        <button
          v-for="annotation in annotations"
          :key="annotation.id"
          class="reader-note"
          @click="jumpToAnnotation(annotation)"
        >
          <span class="reader-note__meta">
            <b>{{ annotation.nickname }}</b>
            <em>段落 {{ annotation.paragraphIndex + 1 }}</em>
            <time>{{ clock(annotation.createdAt) }}</time>
          </span>
          <span class="reader-note__body">{{ annotation.content }}</span>
        </button>
        <p v-if="annotations.length === 0" class="reader-rail__empty">暂无评审意见</p>
      </div>

      <div class="reader-rail__head reader-rail__head--sub">
        <span>代码标记</span>
        <em>{{ bookmarks.length }}</em>
      </div>
      <div class="reader-rail__list">
        <div v-for="mark in bookmarks" :key="mark.id" class="reader-mark">
          <button class="reader-mark__jump" @click="jumpToBookmark(mark)">
            <span class="reader-note__meta">
              <b>第 {{ mark.chapterIndex + 1 }} 章 · 段落 {{ mark.paragraphIndex + 1 }}</b>
              <time>{{ clock(mark.createdAt) }}</time>
            </span>
            <span class="reader-note__body">{{ mark.excerpt || '（无摘录）' }}</span>
          </button>
          <button class="reader-mark__remove" title="删除标记" @click.stop="deleteBookmark(mark)">
            ×
          </button>
        </div>
        <p v-if="bookmarks.length === 0" class="reader-rail__empty">暂无代码标记</p>
      </div>
    </aside>

    <div v-if="importOpen" class="overlay" @click.self="importOpen = false">
      <form class="sheet reader-import" @submit.prevent="submitImport">
        <header class="sheet__head">
          <div>
            <h2>导入审阅数据集</h2>
            <p>支持 UTF-8 / GBK 编码的 txt，自动按章节标题拆分。</p>
          </div>
          <button type="button" class="icon-button" @click="importOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <label class="reader-import__row">
            <span>数据集文件</span>
            <input type="file" accept=".txt,text/plain" @change="onImportFile" />
          </label>
          <label class="reader-import__row">
            <span>仓库名称</span>
            <input v-model="importTitle" maxlength="255" placeholder="留空则取文件名" />
          </label>
          <label class="reader-import__row">
            <span>负责人</span>
            <input v-model="importAuthor" maxlength="128" placeholder="可选" />
          </label>
          <p v-if="importError" class="reader-import__error">{{ importError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>文件上限 8 MiB</span>
          <button class="primary-button" type="submit" :disabled="importing">
            {{ importing ? '导入中…' : '导入并索引' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.reader {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--fm-bg);
  color: var(--fm-text);
}

.reader-side {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 236px;
  padding: 8px 8px 12px;
  overflow-y: auto;
  border-right: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.reader-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 6px 6px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.reader-side__head--sub {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid var(--fm-border);
}

.reader-mini-btn {
  width: 18px;
  height: 18px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.reader-mini-btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.reader-book,
.reader-chapter {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.reader-book:hover,
.reader-chapter:hover {
  background: var(--fm-hover);
  color: var(--fm-text);
}

.reader-book.is-active,
.reader-chapter.is-active {
  background: var(--fm-active);
  color: var(--fm-text);
}

.reader-book__title,
.reader-chapter__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-book em,
.reader-chapter em {
  flex: none;
  margin-left: auto;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.reader-chapter {
  padding-left: 20px;
}

.reader-chapter__index {
  flex: none;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.reader-side__empty {
  padding: 8px;
  color: var(--fm-text-muted);
  font-size: 11px;
  line-height: 1.6;
}

.reader-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fm-link);
  font-size: 11px;
  cursor: pointer;
}

.reader-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.reader-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--fm-border);
  background: var(--fm-panel);
  font-size: 10.5px;
}

.reader-crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--fm-text-muted);
  white-space: nowrap;
}

.reader-crumbs b {
  overflow: hidden;
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-weight: 500;
  text-overflow: ellipsis;
}

.reader-crumbs__sep {
  opacity: 0.5;
}

.reader-toolbar__meta {
  color: var(--fm-text-muted);
  font-size: 9.5px;
  white-space: nowrap;
}

.reader-toolbar__spacer {
  flex: 1;
}

.reader-control {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  white-space: nowrap;
}

.reader-control select {
  height: 24px;
  padding: 0 5px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-size: 10px;
}

.reader-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-size: 10px;
  white-space: nowrap;
  cursor: pointer;
}

.reader-btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.reader-btn.is-active {
  border-color: var(--fm-accent);
  background: var(--fm-accent-soft);
  color: var(--fm-accent);
}

.reader-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.reader-error-bar {
  flex: none;
  padding: 6px 12px;
  border-bottom: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-err) 12%, var(--fm-panel));
  color: var(--fm-err);
  font-size: 10.5px;
}

.reader-editor {
  flex: 1;
  min-height: 0;
}

.reader-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--fm-text-muted);
  font-size: 12px;
}

.reader-status {
  display: flex;
  flex: none;
  align-items: center;
  gap: 14px;
  height: 23px;
  padding: 0 12px;
  border-top: 1px solid var(--fm-border);
  background: var(--fm-panel);
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9.5px;
  white-space: nowrap;
}

.reader-status__spacer {
  flex: 1;
}

.reader-rail {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 268px;
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.reader-rail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 7px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.reader-rail__head em {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-style: normal;
}

.reader-rail__head--sub {
  margin-top: 8px;
  border-top: 1px solid var(--fm-border);
}

.reader-annotation-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px 10px;
}

.reader-annotation-form textarea {
  resize: vertical;
  min-height: 60px;
  padding: 7px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 11px;
  line-height: 1.5;
  outline: none;
}

.reader-annotation-form textarea:focus {
  border-color: var(--fm-accent);
}

.reader-annotation-form button {
  align-self: flex-end;
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--fm-radius);
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.reader-annotation-form button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.reader-annotation-form > span {
  align-self: flex-end;
  color: var(--fm-text-muted);
  font-size: 8.5px;
}

.reader-rail__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.reader-note,
.reader-mark__jump {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  text-align: left;
  cursor: pointer;
}

.reader-note:hover,
.reader-mark__jump:hover {
  border-color: var(--fm-border);
  background: var(--fm-hover);
}

.reader-note__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fm-text-muted);
  font-size: 9px;
}

.reader-note__meta b {
  color: var(--fm-accent);
  font-size: 9.5px;
  font-weight: 600;
}

.reader-note__meta em {
  font-style: normal;
}

.reader-note__meta time {
  margin-left: auto;
}

.reader-note__body {
  color: var(--fm-text);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-word;
}

.reader-mark {
  position: relative;
  display: flex;
  align-items: flex-start;
}

.reader-mark__remove {
  flex: none;
  align-self: center;
  width: 20px;
  height: 20px;
  border: 0;
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 13px;
  cursor: pointer;
}

.reader-mark__remove:hover {
  color: var(--fm-err);
}

.reader-rail__empty {
  padding: 6px 8px;
  color: var(--fm-text-muted);
  font-size: 10px;
}

.reader-import {
  width: min(560px, 100%);
}

.reader-import__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 22px;
}

.reader-import__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--fm-text-dim);
  font-size: 11.5px;
}

.reader-import__row input[type='text'],
.reader-import__row input:not([type='file']) {
  width: 280px;
  height: 29px;
  padding: 0 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 11.5px;
  outline: none;
}

.reader-import__row input:focus {
  border-color: var(--fm-accent);
}

.reader-import__error {
  color: var(--fm-err);
  font-size: 11px;
}

@media (max-width: 1180px) {
  .reader-rail {
    width: 230px;
  }

  .reader-side {
    width: 200px;
  }
}

@media (max-width: 980px) {
  .reader-rail {
    display: none;
  }
}
</style>
