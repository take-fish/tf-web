<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore, type ReaderTemplateId } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import CodeEditorPane from '@/modules/reader/components/CodeEditorPane.vue'
import {
  addAnnotation,
  addBookmark,
  addBookToShelf,
  approveAccessRequest,
  cancelAccessRequest,
  createCategory,
  createShelf,
  deleteBook,
  fetchAnnotations,
  fetchBook,
  fetchBookmarks,
  fetchBooks,
  fetchCategories,
  fetchChapter,
  fetchMyAccessRequests,
  fetchMyBooks,
  fetchProgress,
  fetchReceivedAccessRequests,
  fetchShelf,
  fetchShelves,
  fetchSharedBooks,
  importBook,
  previewSharedBook,
  rejectAccessRequest,
  removeBookmark,
  requestAccess,
  revokeAccessRequest,
  saveProgress,
  saveProgressKeepalive,
  shareBook,
  updateBook,
} from '@/modules/reader/readerApi'
import {
  READER_TEMPLATES,
  formatNovel,
  paragraphAtLine,
  paragraphStartLine,
  splitParagraphs,
} from '@/modules/reader/lib/novelFormatter'
import {
  newerProgress,
  readLocalProgress,
  writeLocalProgress,
} from '@/modules/reader/lib/progressCache'
import type {
  AccessRequest,
  Annotation,
  Bookmark,
  BookSummary,
  Category,
  ChapterContent,
  ChapterSummary,
  ContentStatus,
  Shelf,
  ShelfDetail,
} from '@/modules/reader/types'

interface EditorApi {
  scrollToRatio(ratio: number): void
  scrollToLine(line: number): void
  advance(fraction: number): boolean
  getScrollRatio(): number
  focus(): void
  isReady(): boolean
}

const auth = useAuthStore()
const identity = useIdentityStore()
const settings = useSettingsStore()
const skinStore = useSkinStore()

const mode = ref<'public' | 'private' | 'shared' | 'shelves'>('public')
const books = ref<BookSummary[]>([])
const chapters = ref<ChapterSummary[]>([])
const selectedBookId = ref<number | null>(null)
const book = ref<BookSummary | null>(null)
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
const importScope = ref<'public' | 'private'>('public')
const importCategoryId = ref<number | null>(null)
const importing = ref(false)
const importError = ref('')

const categories = ref<Category[]>([])
const categoryFilter = ref<number | null>(null)
const searchQuery = ref('')
const categoryDraft = ref('')
const categoryEditorOpen = ref(false)

const shelves = ref<Shelf[]>([])
const activeShelf = ref<ShelfDetail | null>(null)
const shelfDraft = ref('')
const shelfPickerOpen = ref(false)

const shareTokenInput = ref('')
const sharePreview = ref<BookSummary | null>(null)
const sharePreviewToken = ref('')
const applying = ref(false)
const applyMessage = ref('')
const applyError = ref('')

const requestsOpen = ref(false)
const receivedRequests = ref<AccessRequest[]>([])
const myRequests = ref<AccessRequest[]>([])

const shareOpen = ref(false)
const shareToken = ref('')
const shareError = ref('')

const editOpen = ref(false)
const editTitle = ref('')
const editAuthor = ref('')
const editDescription = ref('')
const editCategoryId = ref<number | null>(null)
const editStatus = ref<ContentStatus>('VISIBLE')
const editError = ref('')
const savingEdit = ref(false)

const canUploadPublic = computed(() => auth.hasPermission('reader.public.upload'))
const canManagePrivate = computed(() => auth.hasPermission('reader.private.manage'))
const canManageCategory = computed(() => auth.hasPermission('reader.category.manage'))
const canImport = computed(() =>
  mode.value === 'private' ? canManagePrivate.value : canUploadPublic.value,
)
const pendingIncoming = computed(
  () => receivedRequests.value.filter((item) => item.status === 'PENDING').length,
)

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
  chapters.value.find((item) => item.chapterIndex === chapterIndex.value),
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
  const bookId = selectedBookId.value
  const chapterNo = chapter.value.chapterIndex
  const ratio = progressRatio.value
  // 先写本地：即使下面请求失败，下次打开仍能恢复到原位。
  writeLocalProgress(bookId, chapterNo, ratio)
  try {
    await saveProgress(bookId, chapterNo, ratio)
  } catch {
    // 进度保存失败不阻塞阅读；本地缓存已写入，下次打开仍能恢复到原位
  }
}

/**
 * 页面被隐藏或关闭时把最新进度补发出去。
 * 滚动保存有 2 秒防抖，直接关标签页时定时器会随页面一起销毁，这一步就是补那个缺口。
 */
function flushProgress() {
  if (!selectedBookId.value || !chapter.value) return
  const bookId = selectedBookId.value
  const chapterNo = chapter.value.chapterIndex
  const ratio = progressRatio.value
  writeLocalProgress(bookId, chapterNo, ratio)
  saveProgressKeepalive(bookId, chapterNo, ratio)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushProgress()
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
    // 立刻记下"现在在第 N 章"：否则只点章节不滚动时，关掉页面再进来会退回上一章。
    void persistProgress()
  } catch (value) {
    error.value = errorText(value)
  } finally {
    loading.value = false
  }
}

function resetReader() {
  selectedBookId.value = null
  book.value = null
  chapters.value = []
  chapter.value = null
  bookmarks.value = []
  annotations.value = []
  progressRatio.value = 0
}

async function selectBook(bookId: number) {
  loading.value = true
  error.value = ''
  try {
    // 书籍详情、书签、进度三者互不依赖，并发发出。
    // 书签/进度失败不阻塞正文：它们只是辅助信息，正文读不到才是硬错误。
    const [detail, bookmarkList, remoteProgress] = await Promise.all([
      fetchBook(bookId),
      fetchBookmarks(bookId).catch(() => [] as Bookmark[]),
      fetchProgress(bookId).catch(() => null),
    ])
    selectedBookId.value = bookId
    book.value = detail.book
    chapters.value = detail.chapters
    sharePreview.value = null
    bookmarks.value = bookmarkList
    // 本地进度可能比服务端新（上次关页面时请求没送达），取较新的一份。
    // 章节数变少（重新导入过）时整条进度作废，避免停在第 1 章却沿用旧章节的滚动位置。
    const found = newerProgress(readLocalProgress(bookId), remoteProgress)
    const resumable = found && found.chapterIndex < detail.book.chapterCount ? found : null
    await loadChapterInternal(resumable?.chapterIndex ?? 0, resumable?.scrollRatio ?? 0)
  } catch (value) {
    resetReader()
    error.value = errorText(value)
  } finally {
    loading.value = false
  }
}

async function loadShelves() {
  shelves.value = await fetchShelves()
  const first = shelves.value[0]
  if (first) {
    await selectShelf(first.id)
  } else {
    activeShelf.value = null
    books.value = []
    resetReader()
  }
}

async function selectShelf(shelfId: number) {
  const detail = await fetchShelf(shelfId)
  activeShelf.value = detail
  books.value = detail.books
  if (detail.books[0]) await selectBook(detail.books[0].id)
  else resetReader()
}

async function loadBooks() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'shelves') {
      await loadShelves()
      return
    }
    if (mode.value === 'private') {
      books.value = await fetchMyBooks()
    } else if (mode.value === 'shared') {
      books.value = await fetchSharedBooks()
    } else {
      const page = await fetchBooks({
        scope: 'public',
        categoryId: categoryFilter.value,
        q: searchQuery.value,
      })
      books.value = page.books
    }
    if (books.value[0]) await selectBook(books.value[0].id)
    else resetReader()
  } catch (value) {
    error.value = errorText(value)
  } finally {
    loading.value = false
  }
}

async function switchMode(next: 'public' | 'private' | 'shared' | 'shelves') {
  if (mode.value === next) return
  mode.value = next
  sharePreview.value = null
  shareTokenInput.value = ''
  activeShelf.value = null
  resetReader()
  await loadBooks()
}

async function loadCategories() {
  try {
    categories.value = await fetchCategories()
  } catch {
    // 分类不可用不影响主流程
  }
}

async function submitCategory() {
  const name = categoryDraft.value.trim()
  if (!name) return
  try {
    await createCategory(name)
    categoryDraft.value = ''
    categoryEditorOpen.value = false
    await loadCategories()
  } catch (value) {
    error.value = errorText(value)
  }
}

async function lookupShare() {
  const token = shareTokenInput.value.trim()
  if (!token) return
  error.value = ''
  applyError.value = ''
  try {
    const preview = await previewSharedBook(token)
    sharePreview.value = preview
    sharePreviewToken.value = token
    resetReader()
  } catch (value) {
    sharePreview.value = null
    error.value = errorText(value)
  }
}

async function submitAccessRequest() {
  if (!sharePreview.value || applying.value) return
  applying.value = true
  applyError.value = ''
  try {
    await requestAccess(sharePreview.value.id, sharePreviewToken.value, applyMessage.value)
    applyMessage.value = ''
    error.value = ''
    sharePreview.value = null
    shareTokenInput.value = ''
    await loadBooks()
  } catch (value) {
    applyError.value = errorText(value)
  } finally {
    applying.value = false
  }
}

async function openShare() {
  if (!book.value) return
  shareOpen.value = true
  shareToken.value = ''
  shareError.value = ''
  try {
    const link = await shareBook(book.value.id)
    shareToken.value = link.shareToken
  } catch (value) {
    shareError.value = errorText(value)
  }
}

async function copyShareToken() {
  if (!shareToken.value) return
  try {
    await navigator.clipboard.writeText(shareToken.value)
    shareError.value = '已复制分享码'
  } catch {
    shareError.value = '复制失败，请手动选择分享码'
  }
}

function openEdit() {
  if (!book.value) return
  editOpen.value = true
  editTitle.value = book.value.title
  editAuthor.value = book.value.author
  editDescription.value = book.value.description
  editCategoryId.value = book.value.categoryId
  editStatus.value = book.value.status
  editError.value = ''
}

async function submitEdit() {
  if (!book.value || savingEdit.value) return
  savingEdit.value = true
  editError.value = ''
  try {
    await updateBook(book.value.id, {
      title: editTitle.value.trim(),
      author: editAuthor.value.trim(),
      description: editDescription.value.trim(),
      categoryId: editCategoryId.value,
      status: editStatus.value,
    })
    editOpen.value = false
    await loadBooks()
  } catch (value) {
    editError.value = errorText(value)
  } finally {
    savingEdit.value = false
  }
}

async function deleteCurrentBook() {
  if (!book.value) return
  if (!window.confirm(`确认删除《${book.value.title}》？删除后文件不可恢复。`)) return
  try {
    await deleteBook(book.value.id)
    resetReader()
    await loadBooks()
  } catch (value) {
    error.value = errorText(value)
  }
}

async function openShelfPicker() {
  shelfPickerOpen.value = true
  try {
    shelves.value = await fetchShelves()
  } catch (value) {
    error.value = errorText(value)
  }
}

async function addCurrentToShelf(shelfId: number) {
  if (!book.value) return
  try {
    await addBookToShelf(shelfId, book.value.id)
    shelfPickerOpen.value = false
    if (mode.value === 'shelves') await loadBooks()
  } catch (value) {
    error.value = errorText(value)
  }
}

async function submitShelf() {
  const name = shelfDraft.value.trim()
  if (!name) return
  try {
    await createShelf(name)
    shelfDraft.value = ''
    await loadBooks()
  } catch (value) {
    error.value = errorText(value)
  }
}

async function openRequests() {
  requestsOpen.value = true
  await refreshRequests()
}

async function refreshRequests() {
  try {
    const [received, mine] = await Promise.all([
      fetchReceivedAccessRequests(),
      fetchMyAccessRequests(),
    ])
    receivedRequests.value = received
    myRequests.value = mine
  } catch (value) {
    error.value = errorText(value)
  }
}

async function decideRequest(request: AccessRequest, action: 'approve' | 'reject' | 'revoke' | 'cancel') {
  try {
    if (action === 'approve') await approveAccessRequest(request.id)
    else if (action === 'reject') await rejectAccessRequest(request.id)
    else if (action === 'revoke') await revokeAccessRequest(request.id)
    else await cancelAccessRequest(request.id)
    await refreshRequests()
    if (mode.value === 'shared') await loadBooks()
  } catch (value) {
    error.value = errorText(value)
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
        await removeBookmark(existing.id)
      }
    } else {
      await addBookmark(book.value.id, {
        chapterIndex: chapterIndex.value,
        paragraphIndex,
        excerpt: paragraph.slice(0, 80),
      })
    }
    bookmarks.value = await fetchBookmarks(book.value.id)
  } catch (value) {
    error.value = errorText(value)
  }
}

async function deleteBookmark(mark: Bookmark) {
  if (!book.value) return
  try {
    await removeBookmark(mark.id)
    bookmarks.value = await fetchBookmarks(book.value.id)
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
  if (!canImport.value) {
    error.value =
      mode.value === 'private'
        ? '没有管理个人书库的权限'
        : '没有向公共书库上传的权限'
    return
  }
  importOpen.value = true
  importError.value = ''
  importFile.value = null
  importTitle.value = ''
  importAuthor.value = ''
  importScope.value = mode.value === 'private' ? 'private' : 'public'
  importCategoryId.value = categoryFilter.value
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
    const created = await importBook(importFile.value, {
      scope: importScope.value,
      title: importTitle.value,
      author: importAuthor.value,
      categoryId: importScope.value === 'public' ? importCategoryId.value : null,
    })
    importOpen.value = false
    mode.value = importScope.value === 'private' ? 'private' : 'public'
    await loadCategories()
    await loadBooks()
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
  // 关标签页/切到后台时补存进度：滚动保存有 2 秒防抖，靠这两个事件兜住最后那段。
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', flushProgress)
  await loadCategories()
  await loadBooks()
  void refreshRequests()
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
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', flushProgress)
  if (progressTimer) clearTimeout(progressTimer)
  if (annotationTimer) clearInterval(annotationTimer)
  stopAutoScrollTimer()
  flushProgress()
})
</script>

<template>
  <div class="reader">
    <aside class="reader-side">
      <div class="reader-side__head">
        <span>资料库</span>
        <button
          v-if="canImport"
          class="reader-mini-btn"
          title="导入 txt 数据集"
          @click="openImport"
        >
          +
        </button>
      </div>
      <div class="reader-tabs">
        <button
          class="reader-tab"
          :class="{ 'is-active': mode === 'public' }"
          @click="switchMode('public')"
        >
          公共库
        </button>
        <button
          v-if="canManagePrivate"
          class="reader-tab"
          :class="{ 'is-active': mode === 'private' }"
          @click="switchMode('private')"
        >
          私有库
        </button>
        <button
          class="reader-tab"
          :class="{ 'is-active': mode === 'shared' }"
          @click="switchMode('shared')"
        >
          共享
        </button>
        <button
          v-if="canManagePrivate"
          class="reader-tab"
          :class="{ 'is-active': mode === 'shelves' }"
          @click="switchMode('shelves')"
        >
          书单
        </button>
      </div>

      <form v-if="mode === 'public'" class="reader-filter" @submit.prevent="loadBooks">
        <input v-model="searchQuery" maxlength="64" placeholder="搜索书名 / 作者" />
        <select v-model="categoryFilter" @change="loadBooks">
          <option :value="null">全部分类</option>
          <option v-for="item in categories" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <button v-if="canManageCategory" type="button" class="reader-mini-btn" title="新建分类" @click="categoryEditorOpen = !categoryEditorOpen">+</button>
        <div v-if="categoryEditorOpen" class="reader-filter__inline">
          <input v-model="categoryDraft" maxlength="32" placeholder="新分类名称" />
          <button type="button" @click="submitCategory">保存</button>
        </div>
      </form>

      <form v-if="mode === 'shared'" class="reader-filter" @submit.prevent="lookupShare">
        <input v-model="shareTokenInput" placeholder="粘贴分享码" />
        <button type="submit">查询</button>
      </form>

      <form v-if="mode === 'shelves'" class="reader-filter" @submit.prevent="submitShelf">
        <input v-model="shelfDraft" maxlength="64" placeholder="新建书单名称" />
        <button type="submit">新建</button>
      </form>
      <div v-if="mode === 'shelves'" class="reader-shelves">
        <button
          v-for="item in shelves"
          :key="item.id"
          class="reader-book"
          :class="{ 'is-active': activeShelf?.shelf.id === item.id }"
          @click="selectShelf(item.id)"
        >
          <AppIcon name="bookmark" :size="13" />
          <span class="reader-book__title">{{ item.name }}</span>
          <em>{{ item.bookCount }}</em>
        </button>
        <p v-if="shelves.length === 0" class="reader-side__empty">还没有书单</p>
      </div>

      <template v-if="mode !== 'shelves'">
        <button
          v-for="item in books"
          :key="item.id"
          class="reader-book"
          :class="{ 'is-active': selectedBookId === item.id }"
          @click="selectBook(item.id)"
        >
          <AppIcon name="file" :size="13" />
          <span class="reader-book__title">{{ item.title }}</span>
          <span v-if="item.status === 'HIDDEN'" class="reader-book__badge">隐藏</span>
          <em>{{ item.scope === 'PRIVATE' ? '私有' : (item.categoryName || `${item.chapterCount} 章`) }}</em>
        </button>
        <div v-if="books.length === 0" class="reader-side__empty">
          <p>
            {{ mode === 'shared' ? '暂无可阅读的共享书籍' : mode === 'private' ? '私有库还是空的' : '公共库暂无书籍' }}
          </p>
          <button v-if="canImport" class="reader-link" @click="openImport">
            导入 txt 数据集
          </button>
        </div>
      </template>

      <template v-if="book">
        <div class="reader-side__head reader-side__head--sub">
          <span>{{ book.title }}</span>
          <span>{{ chapters.length }}</span>
        </div>
        <button
          v-for="item in chapters"
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
        <button v-if="book?.canEdit" class="reader-btn" @click="openEdit">编辑</button>
        <button
          v-if="book?.scope === 'PRIVATE' && book?.mine"
          class="reader-btn"
          @click="openShare"
        >
          分享
        </button>
        <button v-if="book" class="reader-btn" @click="openShelfPicker">书单</button>
        <button
          v-if="book?.canDelete"
          class="reader-btn reader-btn--danger"
          @click="deleteCurrentBook"
        >
          删除
        </button>
        <button class="reader-btn" @click="openRequests">
          访问申请
          <em v-if="pendingIncoming > 0" class="reader-btn__badge">{{ pendingIncoming }}</em>
        </button>
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

      <div v-if="sharePreview" class="reader-preview">
        <div class="reader-preview__card">
          <span class="reader-preview__tag">私有内容 · 需要授权</span>
          <h2>{{ sharePreview.title }}</h2>
          <p class="reader-preview__meta">
            {{ sharePreview.author || '未知作者' }} · {{ sharePreview.chapterCount }} 章 ·
            所有者 {{ sharePreview.ownerNickname || '—' }}
          </p>
          <p class="reader-preview__desc">
            {{ sharePreview.description || '所有者未填写简介。' }}
          </p>
          <p class="reader-preview__hint">
            分享码只用于发现内容，不等于授权。提交申请后需由所有者批准。
          </p>
          <textarea
            v-model="applyMessage"
            rows="3"
            maxlength="255"
            placeholder="向所有者说明申请原因（可选）"
          />
          <p v-if="applyError" class="reader-import__error">{{ applyError }}</p>
          <div class="reader-preview__actions">
            <button
              class="primary-button"
              :disabled="applying"
              @click="submitAccessRequest"
            >
              {{ applying ? '提交中…' : '申请访问' }}
            </button>
            <button class="reader-btn" @click="sharePreview = null">关闭</button>
          </div>
        </div>
      </div>
      <div v-else class="reader-editor">
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
            <span>目标库</span>
            <select v-model="importScope">
              <option v-if="canUploadPublic" value="public">公共书库（所有人可读）</option>
              <option v-if="canManagePrivate" value="private">个人私有库（仅自己可见）</option>
            </select>
          </label>
          <label class="reader-import__row">
            <span>数据集文件</span>
            <input type="file" accept=".txt,text/plain" @change="onImportFile" />
          </label>
          <label class="reader-import__row">
            <span>书籍名称</span>
            <input v-model="importTitle" maxlength="255" placeholder="留空则取文件名" />
          </label>
          <label class="reader-import__row">
            <span>作者</span>
            <input v-model="importAuthor" maxlength="128" placeholder="可选" />
          </label>
          <label
            v-if="importScope === 'public' && canManageCategory && categories.length > 0"
            class="reader-import__row"
          >
            <span>分类</span>
            <select v-model="importCategoryId">
              <option :value="null">未分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <p v-if="importError" class="reader-import__error">{{ importError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>文件上限 8 MiB · 原文仅保存在服务端存储卷</span>
          <button class="primary-button" type="submit" :disabled="importing">
            {{ importing ? '导入中…' : '导入并索引' }}
          </button>
        </footer>
      </form>
    </div>

    <div v-if="shareOpen" class="overlay" @click.self="shareOpen = false">
      <div class="sheet reader-import">
        <header class="sheet__head">
          <div>
            <h2>分享私有内容</h2>
            <p>分享码只能用于发现内容与发起申请，不代表阅读授权。</p>
          </div>
          <button type="button" class="icon-button" @click="shareOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <label class="reader-import__row">
            <span>分享码</span>
            <input :value="shareToken" readonly placeholder="生成中…" />
          </label>
          <p v-if="shareError" class="reader-import__error">{{ shareError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>对方需持有分享码才能提交申请</span>
          <button class="primary-button" @click="copyShareToken">复制分享码</button>
        </footer>
      </div>
    </div>

    <div v-if="editOpen" class="overlay" @click.self="editOpen = false">
      <form class="sheet reader-import" @submit.prevent="submitEdit">
        <header class="sheet__head">
          <div>
            <h2>编辑书籍信息</h2>
            <p>仅作者本人或内容管理员可以修改。</p>
          </div>
          <button type="button" class="icon-button" @click="editOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <label class="reader-import__row">
            <span>书名</span>
            <input v-model="editTitle" maxlength="255" required />
          </label>
          <label class="reader-import__row">
            <span>作者</span>
            <input v-model="editAuthor" maxlength="128" />
          </label>
          <label class="reader-import__row">
            <span>简介</span>
            <input v-model="editDescription" maxlength="512" />
          </label>
          <label
            v-if="auth.hasPermission('reader.category.manage')"
            class="reader-import__row"
          >
            <span>分类</span>
            <select v-model="editCategoryId">
              <option :value="null">未分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <label
            v-if="auth.hasPermission('reader.content.manage.any')"
            class="reader-import__row"
          >
            <span>可见状态</span>
            <select v-model="editStatus">
              <option value="VISIBLE">公开可见</option>
              <option value="HIDDEN">隐藏</option>
            </select>
          </label>
          <p v-if="editError" class="reader-import__error">{{ editError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>公共内容改动会对所有读者生效</span>
          <button class="primary-button" type="submit" :disabled="savingEdit">
            {{ savingEdit ? '保存中…' : '保存' }}
          </button>
        </footer>
      </form>
    </div>

    <div v-if="requestsOpen" class="overlay" @click.self="requestsOpen = false">
      <div class="sheet reader-requests">
        <header class="sheet__head">
          <div>
            <h2>访问申请</h2>
            <p>私有内容只有所有者批准后才能被查看，管理员也不例外。</p>
          </div>
          <button type="button" class="icon-button" @click="requestsOpen = false">×</button>
        </header>
        <div class="reader-requests__body">
          <section>
            <h3>收到的申请 <em>{{ receivedRequests.length }}</em></h3>
            <div
              v-for="item in receivedRequests"
              :key="`in-${item.id}`"
              class="reader-request"
            >
              <div class="reader-request__main">
                <b>{{ item.bookTitle }}</b>
                <span>{{ item.requesterNickname }} · {{ item.status }}</span>
                <p v-if="item.message">{{ item.message }}</p>
              </div>
              <div class="reader-request__actions">
                <button
                  v-if="item.status === 'PENDING'"
                  class="reader-btn"
                  @click="decideRequest(item, 'approve')"
                >
                  批准
                </button>
                <button
                  v-if="item.status === 'PENDING'"
                  class="reader-btn"
                  @click="decideRequest(item, 'reject')"
                >
                  拒绝
                </button>
                <button
                  v-if="item.status === 'APPROVED'"
                  class="reader-btn"
                  @click="decideRequest(item, 'revoke')"
                >
                  撤销授权
                </button>
              </div>
            </div>
            <p v-if="receivedRequests.length === 0" class="reader-side__empty">
              还没有人申请访问你的私有内容
            </p>
          </section>
          <section>
            <h3>我发出的申请 <em>{{ myRequests.length }}</em></h3>
            <div v-for="item in myRequests" :key="`out-${item.id}`" class="reader-request">
              <div class="reader-request__main">
                <b>{{ item.bookTitle }}</b>
                <span>所有者 {{ item.ownerNickname }} · {{ item.status }}</span>
                <p v-if="item.decisionMessage">回复：{{ item.decisionMessage }}</p>
              </div>
              <div class="reader-request__actions">
                <button
                  v-if="item.status === 'PENDING'"
                  class="reader-btn"
                  @click="decideRequest(item, 'cancel')"
                >
                  取消申请
                </button>
              </div>
            </div>
            <p v-if="myRequests.length === 0" class="reader-side__empty">暂无申请记录</p>
          </section>
        </div>
      </div>
    </div>

    <div v-if="shelfPickerOpen" class="overlay" @click.self="shelfPickerOpen = false">
      <div class="sheet reader-import">
        <header class="sheet__head">
          <div>
            <h2>加入书单</h2>
            <p>{{ book?.title ?? '' }}</p>
          </div>
          <button type="button" class="icon-button" @click="shelfPickerOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <button
            v-for="item in shelves"
            :key="item.id"
            class="reader-book"
            @click="addCurrentToShelf(item.id)"
          >
            <AppIcon name="bookmark" :size="13" />
            <span class="reader-book__title">{{ item.name }}</span>
            <em>{{ item.bookCount }}</em>
          </button>
          <p v-if="shelves.length === 0" class="reader-side__empty">
            还没有书单，可在「书单」标签下新建。
          </p>
        </div>
        <footer class="sheet__foot">
          <span>书单只有自己可见</span>
        </footer>
      </div>
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

.reader-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  margin: 0 4px 6px;
}

.reader-tab {
  height: 24px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 10px;
  cursor: pointer;
}

.reader-tab:hover {
  color: var(--fm-text);
}

.reader-tab.is-active {
  border-color: var(--fm-accent);
  background: var(--fm-accent-soft);
  color: var(--fm-accent);
}

.reader-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 4px 6px;
}

.reader-filter input,
.reader-filter select {
  flex: 1;
  min-width: 0;
  height: 25px;
  padding: 0 6px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 10.5px;
  outline: none;
}

.reader-filter input:focus,
.reader-filter select:focus {
  border-color: var(--fm-accent);
}

.reader-filter > button[type='submit'] {
  height: 25px;
  padding: 0 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-size: 10px;
  cursor: pointer;
}

.reader-filter__inline {
  display: flex;
  flex-basis: 100%;
  gap: 4px;
}

.reader-filter__inline button {
  flex: none;
  height: 25px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 10px;
  cursor: pointer;
}

.reader-book__badge {
  flex: none;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--fm-warn);
  color: var(--fm-on-accent);
  font-size: 8px;
}

.reader-shelves {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.reader-btn--danger {
  color: var(--fm-err);
  border-color: color-mix(in srgb, var(--fm-err) 40%, var(--fm-border));
}

.reader-btn__badge {
  padding: 0 4px;
  border-radius: 8px;
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 8.5px;
  font-style: normal;
}

.reader-preview {
  display: grid;
  flex: 1;
  place-items: center;
  padding: 24px;
  overflow-y: auto;
}

.reader-preview__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(520px, 100%);
  padding: 22px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel);
}

.reader-preview__tag {
  align-self: flex-start;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--fm-warn);
  color: var(--fm-on-accent);
  font-size: 9px;
}

.reader-preview h2 {
  margin: 0;
  color: var(--fm-text);
  font-size: 18px;
}

.reader-preview__meta,
.reader-preview__hint {
  margin: 0;
  color: var(--fm-text-muted);
  font-size: 10.5px;
  line-height: 1.6;
}

.reader-preview__desc {
  margin: 0;
  color: var(--fm-text-dim);
  font-size: 11.5px;
  line-height: 1.7;
}

.reader-preview textarea {
  resize: vertical;
  padding: 7px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 11px;
  outline: none;
}

.reader-preview__actions {
  display: flex;
  gap: 8px;
}

.reader-import__row select {
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

.reader-requests {
  width: min(680px, 100%);
}

.reader-requests__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(62vh, 560px);
  padding: 16px 22px;
  overflow-y: auto;
}

.reader-requests__body h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--fm-text-dim);
  font-size: 11px;
  font-weight: 600;
}

.reader-requests__body h3 em {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--fm-panel-2);
  color: var(--fm-text-muted);
  font-style: normal;
}

.reader-request {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  margin-bottom: 6px;
}

.reader-request__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.reader-request__main b {
  color: var(--fm-text);
  font-size: 11.5px;
}

.reader-request__main span {
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.reader-request__main p {
  margin: 0;
  color: var(--fm-text-dim);
  font-size: 10.5px;
}

.reader-request__actions {
  display: flex;
  flex: none;
  gap: 4px;
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
