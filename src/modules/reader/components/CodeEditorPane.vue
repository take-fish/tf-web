<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type * as MonacoTypes from 'monaco-editor'

const props = withDefaults(
  defineProps<{
    value: string
    language: string
    fontSize?: number
    light?: boolean
    bookmarks?: number[]
    annotationCounts?: Record<number, number>
  }>(),
  {
    fontSize: 14,
    light: false,
    bookmarks: () => [],
    annotationCounts: () => ({}),
  },
)

const emit = defineEmits<{
  lineChange: [line: number]
  scrollRatio: [ratio: number]
  interaction: []
}>()

const host = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadError = ref('')

let monacoModule: typeof import('@/modules/reader/lib/monacoSetup') | null = null
let editor: MonacoTypes.editor.IStandaloneCodeEditor | undefined
let decorationIds: string[] = []
let pendingRatio: number | null = null
let lastScrollEmit = 0
let cursorDisposable: { dispose(): void } | undefined
let scrollDisposable: { dispose(): void } | undefined

function editorReady(): boolean {
  return Boolean(editor && monacoModule)
}

function ratioOfEditor(): number {
  if (!editor) return 0
  const layout = editor.getLayoutInfo()
  const max = editor.getScrollHeight() - layout.height
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, editor.getScrollTop() / max))
}

function applyDecorations() {
  if (!editor || !monacoModule) return
  const { monaco } = monacoModule
  const decorations: MonacoTypes.editor.IModelDeltaDecoration[] = []

  for (const line of props.bookmarks) {
    decorations.push({
      range: new monaco.Range(line + 1, 1, line + 1, 1),
      options: {
        glyphMarginClassName: 'fm-bookmark-glyph',
        glyphMarginHoverMessage: { value: 'Code marker' },
        overviewRuler: {
          color: '#e5b567',
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    })
  }

  for (const [lineText, count] of Object.entries(props.annotationCounts)) {
    if (!count) continue
    const line = Number(lineText)
    decorations.push({
      range: new monaco.Range(line + 1, 1, line + 1, 1),
      options: {
        glyphMarginClassName: 'fm-annotation-glyph',
        glyphMarginHoverMessage: { value: `${count} 条评审意见` },
        after: {
          content: `  ${count} 条评审意见`,
          inlineClassName: 'fm-annotation-inline',
        },
        overviewRuler: {
          color: '#58c8ff',
          position: monaco.editor.OverviewRulerLane.Left,
        },
      },
    })
  }

  decorationIds = editor.deltaDecorations(decorationIds, decorations)
}

function scrollToRatio(ratio: number) {
  const clamped = Math.min(1, Math.max(0, ratio))
  if (!editor) {
    pendingRatio = clamped
    return
  }
  const layout = editor.getLayoutInfo()
  const max = editor.getScrollHeight() - layout.height
  if (max <= 0) {
    pendingRatio = clamped
    return
  }
  editor.setScrollTop(max * clamped)
  pendingRatio = null
}

function scrollToLine(line: number) {
  if (!editor) return
  editor.setPosition({ lineNumber: line + 1, column: 1 })
  editor.revealLineInCenter(line + 1)
}

function advance(viewportFraction: number): boolean {
  if (!editor) return true
  const layout = editor.getLayoutInfo()
  const max = editor.getScrollHeight() - layout.height
  const current = editor.getScrollTop()
  if (current >= max - 4) return true
  editor.setScrollTop(Math.min(max, current + layout.height * viewportFraction))
  return false
}

function focus() {
  editor?.focus()
}

onMounted(async () => {
  if (!host.value) return
  try {
    const setup = await import('@/modules/reader/lib/monacoSetup')
    monacoModule = setup
    setup.ensureReaderThemes()
    const { monaco } = setup
    const created = monaco.editor.create(host.value, {
      value: props.value,
      language: props.language,
      theme: props.light ? 'fm-reader-light' : 'fm-reader-dark',
      readOnly: true,
      fontSize: props.fontSize,
      fontFamily:
        "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace",
      lineHeight: 21,
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      wordWrap: 'off',
      automaticLayout: true,
      padding: { top: 12, bottom: 16 },
      overviewRulerLanes: 2,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      contextmenu: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      selectionHighlight: false,
    })
    editor = created

    cursorDisposable = created.onDidChangeCursorPosition((event) => {
      emit('lineChange', event.position.lineNumber - 1)
    })
    scrollDisposable = created.onDidScrollChange(() => {
      const now = performance.now()
      if (now - lastScrollEmit < 120) return
      lastScrollEmit = now
      emit('scrollRatio', ratioOfEditor())
    })
    created.onMouseDown(() => emit('interaction'))
    created.onKeyDown(() => emit('interaction'))

    applyDecorations()
    loading.value = false
    if (pendingRatio !== null) {
      const ratio = pendingRatio
      pendingRatio = null
      requestAnimationFrame(() => scrollToRatio(ratio))
    }
  } catch (error) {
    loading.value = false
    loadError.value = error instanceof Error ? error.message : '代码视图初始化失败'
  }
})

onBeforeUnmount(() => {
  cursorDisposable?.dispose()
  scrollDisposable?.dispose()
  editor?.dispose()
  editor = undefined
})

watch(
  () => props.value,
  (value) => {
    if (!editor) return
    const model = editor.getModel()
    if (model && model.getValue() !== value) {
      editor.setValue(value)
    }
  },
)

watch(
  () => props.language,
  (language) => {
    if (!editor || !monacoModule) return
    const model = editor.getModel()
    if (model) monacoModule.monaco.editor.setModelLanguage(model, language)
  },
)

watch(
  () => props.light,
  (light) => {
    monacoModule?.monaco.editor.setTheme(light ? 'fm-reader-light' : 'fm-reader-dark')
  },
)

watch(
  () => props.fontSize,
  (fontSize) => {
    editor?.updateOptions({ fontSize })
  },
)

watch(
  () => [props.bookmarks, props.annotationCounts],
  () => applyDecorations(),
  { deep: true },
)

defineExpose({
  scrollToRatio,
  scrollToLine,
  advance,
  getScrollRatio: ratioOfEditor,
  focus,
  isReady: editorReady,
})
</script>

<template>
  <div class="code-editor-pane">
    <div ref="host" class="code-editor-host" />
    <div v-if="loading" class="code-editor-loading">
      <span class="code-editor-loading__bar" />
      正在索引代码视图…
    </div>
    <div v-else-if="loadError" class="code-editor-error">{{ loadError }}</div>
  </div>
</template>

<style scoped>
.code-editor-pane {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--fm-bg);
}

.code-editor-host {
  width: 100%;
  height: 100%;
}

.code-editor-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--fm-panel);
  color: var(--fm-text-dim);
  font-size: 11px;
}

.code-editor-loading__bar {
  width: 90px;
  height: 3px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--fm-panel-2);
  animation: pulse 1.4s ease-in-out infinite;
}

.code-editor-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--fm-panel);
  color: var(--fm-err);
  font-size: 12px;
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
</style>

<style>
.fm-bookmark-glyph {
  margin-left: 5px;
  width: 4px !important;
  border-radius: 1px;
  background: #e5b567;
}

.fm-annotation-glyph {
  margin-left: 4px;
  width: 5px !important;
  border-radius: 2px;
  background: #58c8ff;
  opacity: 0.9;
}

.fm-annotation-inline {
  color: #58c8ff;
  font-size: 10px;
  font-style: italic;
  opacity: 0.75;
}
</style>
