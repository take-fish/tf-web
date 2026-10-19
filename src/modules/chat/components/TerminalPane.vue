<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

export type TerminalTone = 'info' | 'ok' | 'warn' | 'error' | 'dim' | 'message' | 'ascii' | 'link'

const props = withDefaults(defineProps<{ prompt: string; banner?: string[] }>(), {
  banner: () => [],
})
const emit = defineEmits<{ command: [value: string]; interrupt: [] }>()

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

const container = ref<HTMLDivElement | null>(null)
let terminal: Terminal | undefined
let fitAddon: FitAddon | undefined
let resizeObserver: ResizeObserver | undefined
let input = ''
let enabled = true
let busy = false
const history: string[] = []
let historyIndex = 0

function promptText(): string {
  return `\x1b[38;5;42m${props.prompt}\x1b[0m `
}

function colored(text: string, tone: TerminalTone): string {
  return `${ANSI[tone]}${text}\x1b[0m`
}

function fit() {
  try {
    fitAddon?.fit()
  } catch {
    // 容器尚未完成布局时忽略
  }
}

function focus() {
  terminal?.focus()
}

function clearScreen() {
  terminal?.write('\x1b[2J\x1b[H')
}

function writeLines(lines: string[], tone: TerminalTone = 'message') {
  if (!terminal) return
  for (const line of lines) {
    terminal.write(`${colored(line, tone)}\r\n`)
  }
}

function writeLiveLines(lines: string[], tone: TerminalTone = 'message') {
  if (!terminal) return
  if (busy) {
    for (const line of lines) {
      terminal.write(`${colored(line, tone)}\r\n`)
    }
    return
  }
  terminal.write('\r\x1b[K')
  for (const line of lines) {
    terminal.write(`${colored(line, tone)}\r\n`)
  }
  terminal.write(promptText())
  if (input) terminal.write(input)
}

function endCommand() {
  if (!terminal) return
  busy = false
  enabled = true
  terminal.write(promptText())
  focus()
}

function submitExternal(value: string): boolean {
  if (!terminal || busy || !enabled) return false
  terminal.write('\r\x1b[K')
  terminal.write(promptText())
  terminal.write(value)
  input = value
  submit()
  return true
}

function redrawInput() {
  if (!terminal) return
  terminal.write('\r\x1b[K')
  terminal.write(promptText())
  terminal.write(input)
}

function submit() {
  if (!terminal) return
  terminal.write('\r\n')
  const value = input
  input = ''
  if (!value.trim()) {
    terminal.write(promptText())
    return
  }
  history.push(value)
  historyIndex = history.length
  busy = true
  enabled = false
  emit('command', value)
}

function backspace() {
  if (!input) return
  input = input.slice(0, -1)
  terminal?.write('\b \b')
}

function interrupt() {
  if (busy) {
    emit('interrupt')
    return
  }
  terminal?.write('^C\r\n')
  input = ''
  emit('interrupt')
  terminal?.write(promptText())
}

function recallHistory(direction: -1 | 1) {
  if (history.length === 0) return
  historyIndex = Math.min(history.length, Math.max(0, historyIndex + direction))
  input = history[historyIndex] ?? ''
  redrawInput()
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

  for (const char of data) {
    if (char === '\x03') {
      interrupt()
      continue
    }
    if (!enabled) continue
    if (char === '\r' || char === '\n') {
      submit()
      break
    }
    if (char === '\x7f') {
      backspace()
      continue
    }
    if (char >= ' ') {
      input += char
      terminal?.write(char)
    }
  }
}

onMounted(() => {
  if (!container.value) return
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
  terminal.open(container.value)
  fit()

  for (const line of props.banner) {
    terminal.write(`${colored(line, 'dim')}\r\n`)
  }
  terminal.write(promptText())
  terminal.onData(handleData)
  terminal.focus()

  resizeObserver = new ResizeObserver(() => fit())
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  terminal?.dispose()
  terminal = undefined
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
  <div ref="container" class="terminal-pane" @click="focus" />
</template>

<style scoped>
.terminal-pane {
  width: 100%;
  height: 100%;
  padding: 6px 2px 4px 8px;
  background: #0c0c0c;
}

.terminal-pane :deep(.xterm) {
  height: 100%;
}

.terminal-pane :deep(.xterm-viewport) {
  background: transparent !important;
}
</style>
