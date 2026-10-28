import { computed, nextTick, ref, watch } from 'vue'

import { useSettingsStore, type ReaderTemplateId } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import {
  addAnnotation,
  addBookmark,
  fetchAnnotations,
  fetchBook,
  fetchBookmarks,
  fetchChapter,
  fetchProgress,
  removeBookmark,
  saveProgress,
  saveProgressKeepalive,
  sendReadingHeartbeat,
} from '@/modules/reader/readerApi'
import {
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
  Annotation,
  Bookmark,
  BookSummary,
  ChapterContent,
  ChapterSummary,
} from '@/modules/reader/types'
import { clock, errorText, type EditorApi } from './reader-helpers'

export function useReaderCore() {
  const settings = useSettingsStore()
  const skinStore = useSkinStore()

  const selectedBookId = ref<number | null>(null)
  const book = ref<BookSummary | null>(null)
  const chapters = ref<ChapterSummary[]>([])
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

  const sharePreview = ref<BookSummary | null>(null)

  let progressTimer: ReturnType<typeof setTimeout> | undefined
  let annotationTimer: ReturnType<typeof setInterval> | undefined
  let autoScrollTimer: ReturnType<typeof setInterval> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined

  const templateId = computed<ReaderTemplateId>({
    get: () => settings.state.readerTemplate,
    set: (value) => settings.update({ readerTemplate: value }),
  })

  const light = computed(() => skinStore.effectiveSkin === 'swagger')

  const paragraphs = computed(() => (chapter.value ? splitParagraphs(chapter.value.content) : []))

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
      (mark) => mark.chapterIndex === chapterIndex.value && mark.paragraphIndex === paragraphIndex,
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

  /**
   * 阅读心跳：服务端只用两次心跳的时间差来算时长，所以这里不传任何时长。
   * 页面隐藏时停止计时，避免把"挂机"算成阅读。
   */
  async function heartbeat() {
    if (!selectedBookId.value || !chapter.value) return
    try {
      await sendReadingHeartbeat(selectedBookId.value)
    } catch {
      // 心跳失败不影响阅读
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flushProgress()
      // 离开时补一次心跳，把"最后一段"封口；否则下次回来会把离开的这段时间也算进去
      void heartbeat()
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
      // 打开书就先打一次心跳，给服务端一个计时起点；否则第一分钟会被算丢
      void heartbeat()
    } catch (value) {
      resetReader()
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
            mark.chapterIndex === chapterIndex.value && mark.paragraphIndex === paragraphIndex,
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
    autoScrollTimer = setInterval(
      () => {
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
      },
      Math.max(15, settings.state.autoScrollSeconds) * 1000,
    )
  }

  function startPolling() {
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
    heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !skinStore.bossActive) {
        void heartbeat()
      }
    }, 60000)
  }

  function dispose() {
    if (progressTimer) clearTimeout(progressTimer)
    if (annotationTimer) clearInterval(annotationTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    stopAutoScrollTimer()
    flushProgress()
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

  return {
    selectedBookId,
    book,
    chapters,
    chapterIndex,
    chapter,
    bookmarks,
    annotations,
    currentLine,
    progressRatio,
    editorRef,
    loading,
    error,
    autoScroll,
    annotationDraft,
    postingAnnotation,
    sharePreview,
    templateId,
    light,
    paragraphs,
    formatted,
    code,
    chapterMeta,
    reviewPercent,
    currentParagraphIndex,
    currentParagraphBookmarked,
    bookmarkLines,
    annotationCounts,
    clock,
    persistProgress,
    flushProgress,
    heartbeat,
    onVisibilityChange,
    onScrollRatio,
    loadAnnotations,
    selectChapter,
    resetReader,
    selectBook,
    toggleBookmark,
    deleteBookmark,
    jumpToBookmark,
    jumpToAnnotation,
    submitAnnotation,
    onTemplateChange,
    onAutoScrollSpeed,
    stopAutoScrollTimer,
    startPolling,
    dispose,
  }
}
