<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type { IDisposable, ILink } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import {
  fitInput,
  removeLastGrapheme,
  sanitizePastedText,
  textCellWidth,
  visualRows,
} from '../terminalInput'

export type TerminalTone = 'info' | 'ok' | 'warn' | 'error' | 'dim' | 'message' | 'ascii' | 'link'

const props = withDefaults(defineProps<{ prompt: string; banner?: string[] }>(), {
  banner: () => [],
})
const emit = defineEmits<{
  command: [value: string]
  interrupt: []
  'paste-image': [files: File[]]
  'preview-image': [shortId: string]
}>()

const ANSI: Record<TerminalTone, string> = {
  info: '\x1b[38;5;244m',
  ok: '\x1b[38;5;42m',
  warn: '\x1b[38;5;214m',
  error: '\x1b[38;5;203m',
  dim: '\x1b[38;5;240m',
  message: '\x1b[38;5;252m',
  ascii: '\x1b[38;5;48m',
  link: '\x1b[38;5;75m',
}

const MAX_INPUT_CHARS = 2000
const MAX_HISTORY = 200

const container = ref<HTMLDivElement | null>(null)
const hint = ref('')

let paneElement: HTMLDivElement | null = null
let terminal: Terminal | undefined
let fitAddon: FitAddon | undefined
let resizeObserver: ResizeObserver | undefined
let linkProviderDisposable: IDisposable | undefined
let hintTimer: ReturnType<typeof setTimeout> | undefined
let lastCols = 0
let input = ''
let inputRows = 0
let enabled = true
let busy = false
const history: string[] = []
let historyIndex = 0

function promptPlain(): string {
  return `${props.prompt} `
}

function promptText(): string {
  return `\x1b[38;5;42m${props.prompt}\x1b[0m `
}

// [图片] #id 用背景色画成按钮样式；后面恢复当前行颜色，避免影响同一条消息的其余内容。
function styled(text: string, tone: TerminalTone): string {
  const decorated = text.replace(
    /\[图片\] #([0-9a-zA-Z_-]{1,12})/g,
    (token) => `\x1b[48;5;236m\x1b[38;5;81m ${token} \x1b[0m${ANSI[tone]}`,
  )
  return `${ANSI[tone]}${decorated}\x1b[0m`
}

function showHint(message: string) {
  hint.value = message
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    hint.value = ''
    hintTimer = undefined
  }, 1500)
}

function focus() {
  terminal?.focus()
}

function inputRowsFor(text: string): number {
  const cols = terminal?.cols ?? 0
  if (cols <= 0) return 1
  return visualRows(promptPlain(), text, cols)
}

function clampInput(text: string): string {
  if (!terminal) return text.slice(0, MAX_INPUT_CHARS)
  return fitInput(
    text,
    promptPlain(),
    terminal.cols,
    Math.max(1, terminal.rows - 1),
    MAX_INPUT_CHARS,
  )
}

// 输入区可能被折成多行：先回到输入块首行行首，再清到屏幕末尾，最后整块重画。
function clearInputArea() {
  if (!terminal || inputRows <= 0) return
  if (inputRows > 1) terminal.write(`\x1b[${inputRows - 1}A`)
  terminal.write('\r\x1b[0J')
  inputRows = 0
}

function renderInput() {
  if (!terminal) return
  terminal.write(promptText())
  if (input) terminal.write(input)
  inputRows = inputRowsFor(input)
}

function redrawInput() {
  if (!terminal) return
  clearInputArea()
  renderInput()
}

function writeOutputLine(line: string, tone: TerminalTone) {
  terminal?.write(`${styled(line, tone)}\r\n`)
}

function fit() {
  try {
    fitAddon?.fit()
  } catch {
    // 容器尚未完成布局时忽略
  }
  if (!terminal) return
  if (terminal.cols === lastCols) return
  lastCols = terminal.cols
  // 列数变化后 xterm 会重排缓冲区，按新列数重算输入块行数并重画，避免退格擦错行。
  if (!busy && inputRows > 0) {
    inputRows = inputRowsFor(input)
    redrawInput()
  }
}

function clearScreen() {
  if (!terminal) return
  terminal.write('\x1b[2J\x1b[H')
  input = ''
  inputRows = 0
}

function writeLines(lines: string[], tone: TerminalTone = 'message') {
  if (!terminal || lines.length === 0) return
  const restoreInput = !busy && inputRows > 0
  if (restoreInput) clearInputArea()
  for (const line of lines) writeOutputLine(line, tone)
  if (restoreInput) renderInput()
}

function writeLiveLines(lines: string[], tone: TerminalTone = 'message') {
  if (!terminal || lines.length === 0) return
  if (busy) {
    for (const line of lines) writeOutputLine(line, tone)
    return
  }
  clearInputArea()
  for (const line of lines) writeOutputLine(line, tone)
  renderInput()
}

function endCommand() {
  if (!terminal) return
  busy = false
  enabled = true
  input = ''
  inputRows = 0
  renderInput()
  focus()
}

function submit() {
  if (!terminal) return
  terminal.write('\r\n')
  const value = input
  input = ''
  inputRows = 0
  if (!value.trim()) {
    renderInput()
    return
  }
  history.push(value)
  if (history.length > MAX_HISTORY) history.shift()
  historyIndex = history.length
  busy = true
  enabled = false
  emit('command', value)
}

function submitExternal(value: string): boolean {
  if (!terminal || busy || !enabled) return false
  const command = sanitizePastedText(value, MAX_INPUT_CHARS).trim()
  if (!command) return false
  clearInputArea()
  input = clampInput(command)
  renderInput()
  submit()
  return true
}

function interrupt() {
  if (busy) {
    emit('interrupt')
    return
  }
  clearInputArea()
  terminal?.write('^C\r\n')
  input = ''
  inputRows = 0
  emit('interrupt')
  renderInput()
}

function recallHistory(direction: -1 | 1) {
  if (history.length === 0) return
  historyIndex = Math.min(history.length, Math.max(0, historyIndex + direction))
  input = clampInput(history[historyIndex] ?? '')
  redrawInput()
}

function appendInput(text: string) {
  if (!terminal || !text) return
  const merged = `${input}${text}`
  const next = clampInput(merged)
  if (next === input) {
    terminal.write('\x07')
    return
  }
  if (next.length < merged.length) terminal.write('\x07')
  input = next
  redrawInput()
}

function appendPastedText(text: string) {
  if (busy || !enabled) {
    terminal?.write('\x07')
    return
  }
  const cleaned = sanitizePastedText(text, MAX_INPUT_CHARS)
  if (!cleaned) return
  appendInput(cleaned)
  focus()
}

function handleData(data: string) {
  if (data === '\x1b[A') {
    recallHistory(-1)
    return
  }
  if (data === '\x1b[B') {
    recallHistory(1)
    return
  }
  if (data.startsWith('\x1b')) return

  let draft = input
  let dirty = false
  for (const char of data) {
    if (char === '\x03') {
      interrupt()
      return
    }
    if (!enabled) continue
    if (char === '\r' || char === '\n') {
      const next = clampInput(draft)
      if (next.length < draft.length) terminal?.write('\x07')
      input = next
      submit()
      return
    }
    // DEL 与 BS 都按退格处理：不同浏览器/输入法可能发送 \x7f 或 \x08。
    if (char === '\x7f' || char === '\x08') {
      const next = removeLastGrapheme(draft)
      if (next !== draft) {
        draft = next
        dirty = true
      }
      continue
    }
    if (char >= ' ') {
      draft += char
      dirty = true
    }
  }
  if (!dirty) return
  const next = clampInput(draft)
  if (next.length < draft.length) terminal?.write('\x07')
  input = next
  redrawInput()
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  return copied
}

function copySelection(): boolean {
  const selection = terminal?.getSelection() ?? ''
  if (!selection) return false
  const notifyCopied = () => showHint(`已复制 ${Array.from(selection).length} 字符`)
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(selection)
        .then(notifyCopied)
        .catch(() => {
          if (legacyCopy(selection)) notifyCopied()
          else showHint('复制失败')
        })
    } else if (legacyCopy(selection)) {
      notifyCopied()
    } else {
      showHint('复制失败')
    }
  } catch {
    if (legacyCopy(selection)) notifyCopied()
    else showHint('复制失败')
  }
  return true
}

function imageFilesFrom(clipboard: DataTransfer): File[] {
  const files: File[] = []
  for (const item of Array.from(clipboard.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (files.length === 0) {
    for (const file of Array.from(clipboard.files)) {
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  return files
}

function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) return

  const files = imageFilesFrom(clipboard)
  if (files.length > 0) {
    event.preventDefault()
    event.stopPropagation()
    emit('paste-image', files)
    focus()
    return
  }

  const text = clipboard.getData('text/plain')
  if (!text) return
  event.preventDefault()
  event.stopPropagation()
  appendPastedText(text)
}

function handleKey(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') return true

  const commandKey = event.ctrlKey || event.metaKey
  if (!commandKey || event.altKey) return true
  const key = event.key.toLowerCase()

  if (key === 'c') {
    if (terminal?.hasSelection()) {
      event.preventDefault()
      copySelection()
      return false
    }
    if (event.shiftKey) {
      event.preventDefault()
      showHint('没有选中文本')
      return false
    }
    // 没有选区时保留终端原本的 ^C 中断语义。
    return true
  }

  if (key === 'v') {
    // 必须返回 false 让浏览器执行默认粘贴；xterm 默认会把它转成 ^V 并 preventDefault。
    // 粘贴事件会被容器捕获，再区分文本与图片。
    return false
  }

  if (key === 'a' && event.shiftKey) {
    event.preventDefault()
    terminal?.selectAll()
    return false
  }

  return true
}

// 让 [图片] #id 成为可点击链接，点击时把短 ID 交给 ChatView 打开预览。
function registerImageLinks() {
  if (!terminal) return
  linkProviderDisposable = terminal.registerLinkProvider({
    provideLinks(y: number, callback: (links: ILink[] | undefined) => void) {
      const line = terminal?.buffer.active.getLine(y - 1)
      if (!line) {
        callback(undefined)
        return
      }
      const text = line.translateToString(true)
      const pattern = /\[图片\] #([0-9a-zA-Z_-]{1,12})/g
      const links: ILink[] = []
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        const token = match[0]
        const id = match[1]
        if (!id) continue
        const startX = textCellWidth(text.slice(0, match.index)) + 1
        const endX = startX + textCellWidth(token) - 1
        links.push({
          range: {
            start: { x: startX, y },
            end: { x: endX, y },
          },
          text: token,
          decorations: { underline: true, pointerCursor: true },
          activate: () => emit('preview-image', id),
        })
      }
      callback(links.length > 0 ? links : undefined)
    },
  })
}

onMounted(() => {
  if (!container.value) return
  paneElement = container.value
  terminal = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace",
    lineHeight: 1.25,
    scrollback: 4000,
    theme: {
      background: '#0c0c0c',
      foreground: '#d6d6d6',
      cursor: '#00e08a',
      cursorAccent: '#0c0c0c',
      selectionBackground: '#1f4d3a',
      black: '#1c1c1c',
      red: '#ff5f56',
      green: '#00e08a',
      yellow: '#e5b567',
      blue: '#58c8ff',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#d6d6d6',
    },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(paneElement)
  fit()

  for (const line of props.banner) {
    writeOutputLine(line, 'dim')
  }
  renderInput()
  terminal.onData(handleData)
  terminal.attachCustomKeyEventHandler(handleKey)
  registerImageLinks()
  // 捕获阶段拦截 xterm 隐藏 textarea 的默认粘贴，改由我们决定是文本还是图片。
  paneElement.addEventListener('paste', handlePaste, true)
  terminal.focus()

  resizeObserver = new ResizeObserver(() => fit())
  resizeObserver.observe(paneElement)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  linkProviderDisposable?.dispose()
  paneElement?.removeEventListener('paste', handlePaste, true)
  if (hintTimer) clearTimeout(hintTimer)
  terminal?.dispose()
  terminal = undefined
  paneElement = null
})

defineExpose({
  writeLines,
  writeLiveLines,
  endCommand,
  clearScreen,
  focus,
  submitExternal,
})
</script>

<template>
  <div class="terminal-pane">
    <div ref="container" class="terminal-pane__screen" @click="focus" />
    <span v-if="hint" class="terminal-pane__hint" aria-live="polite">{{ hint }}</span>
  </div>
</template>

<style scoped>
.terminal-pane {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 6px 2px 4px 8px;
  background: #0c0c0c;
}

.terminal-pane__screen {
  width: 100%;
  height: 100%;
}

.terminal-pane :deep(.xterm) {
  height: 100%;
}

.terminal-pane :deep(.xterm-viewport) {
  background: transparent !important;
}

.terminal-pane__hint {
  position: absolute;
  right: 14px;
  bottom: 10px;
  z-index: 5;
  padding: 3px 8px;
  border: 1px solid #2a5a46;
  border-radius: 3px;
  background: rgb(8 28 20 / 92%);
  color: #7ef0b8;
  font-family: 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;
  font-size: 10px;
  pointer-events: none;
}
</style>
