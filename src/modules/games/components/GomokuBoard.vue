<script setup lang="ts">
import { computed } from 'vue'

import type { GameMove } from '../types'

const SIZE = 15

/**
 * 深色代码编辑器风格的棋盘：底纹是一段稀疏的代码片段，
 * 落子后保留原文字并变色；空白格落子显示 A / B。
 */
interface CodeToken {
  col: number
  text: string
}

const CODE_ROWS: CodeToken[][] = [
  [
    { col: 0, text: '//' },
    { col: 1, text: 'scan' },
    { col: 2, text: 'grid' },
    { col: 10, text: '//' },
    { col: 11, text: 'init' },
  ],
  [
    { col: 0, text: 'fn' },
    { col: 1, text: 'scan' },
    { col: 2, text: 'cells' },
    { col: 3, text: '{' },
    { col: 10, text: '//' },
    { col: 11, text: 'base' },
  ],
  [
    { col: 2, text: 'let' },
    { col: 3, text: 'hits' },
    { col: 4, text: '=' },
    { col: 5, text: '0' },
    { col: 10, text: '//' },
    { col: 11, text: 'count' },
  ],
  [
    { col: 2, text: 'for' },
    { col: 3, text: 'row' },
    { col: 4, text: 'in' },
    { col: 5, text: 'rows' },
    { col: 10, text: '//' },
    { col: 11, text: 'walk' },
  ],
  [
    { col: 4, text: 'for' },
    { col: 5, text: 'col' },
    { col: 6, text: 'in' },
    { col: 7, text: 'cols' },
    { col: 11, text: '//' },
    { col: 12, text: 'scan' },
  ],
  [
    { col: 6, text: 'if' },
    { col: 7, text: 'hit' },
    { col: 8, text: '{' },
    { col: 11, text: '//' },
    { col: 12, text: 'match' },
  ],
  [
    { col: 8, text: 'hits' },
    { col: 9, text: '++' },
    { col: 11, text: '//' },
    { col: 12, text: 'count' },
  ],
  [
    { col: 6, text: '}' },
    { col: 11, text: '//' },
    { col: 12, text: 'next' },
  ],
  [{ col: 4, text: '}' }],
  [{ col: 2, text: '}' }],
  [
    { col: 2, text: 'return' },
    { col: 3, text: 'hits' },
    { col: 4, text: '>' },
    { col: 5, text: '4' },
    { col: 11, text: '//' },
    { col: 12, text: 'win' },
  ],
  [
    { col: 0, text: '}' },
    { col: 2, text: '//' },
    { col: 3, text: 'scan' },
    { col: 4, text: 'done' },
  ],
  [
    { col: 0, text: 'const' },
    { col: 1, text: 'grid' },
    { col: 2, text: '=' },
    { col: 3, text: '[' },
    { col: 11, text: '//' },
    { col: 12, text: 'base' },
  ],
  [
    { col: 2, text: '[0,0]' },
    { col: 3, text: '0' },
    { col: 4, text: '0' },
    { col: 5, text: '0' },
    { col: 11, text: '//' },
    { col: 12, text: 'row' },
  ],
  [
    { col: 0, text: ']' },
    { col: 2, text: '//' },
    { col: 3, text: 'end' },
    { col: 4, text: 'file' },
  ],
]

const columns = Array.from({ length: SIZE }, (_, index) => String.fromCharCode(65 + index))
const rows = Array.from({ length: SIZE }, (_, y) => {
  const tokens = new Map<number, string>()
  for (const token of CODE_ROWS[y] ?? []) tokens.set(token.col, token.text)
  return {
    y,
    label: String(y + 1).padStart(2, '0'),
    cells: Array.from({ length: SIZE }, (_, x) => ({
      x,
      key: `${x},${y}`,
      token: tokens.get(x) ?? '',
    })),
  }
})

const props = withDefaults(
  defineProps<{
    moves: GameMove[]
    blackUserId?: string
    whiteUserId?: string
    selfUserId?: string
    turnUserId?: string | null
    interactive?: boolean
    disabled?: boolean
  }>(),
  {
    blackUserId: '',
    whiteUserId: '',
    selfUserId: '',
    turnUserId: null,
    interactive: false,
    disabled: false,
  },
)

const emit = defineEmits<{ place: [x: number, y: number] }>()

type StoneColor = 'blue' | 'cyan'

const stoneMap = computed(() => {
  const map = new Map<string, { color: StoneColor }>()
  for (const move of props.moves) {
    map.set(`${move.x},${move.y}`, {
      color: move.userId === props.blackUserId ? 'blue' : 'cyan',
    })
  }
  return map
})

const lastMove = computed(() => props.moves[props.moves.length - 1] ?? null)
const currentRow = computed(() => lastMove.value?.y ?? null)
const currentColumn = computed(() => lastMove.value?.x ?? null)
const lastColor = computed<StoneColor | null>(() => {
  const move = lastMove.value
  if (!move) return null
  return stoneMap.value.get(`${move.x},${move.y}`)?.color ?? null
})
const selfColor = computed<StoneColor>(() =>
  props.selfUserId && props.selfUserId === props.blackUserId ? 'blue' : 'cyan',
)

function stoneAt(key: string) {
  return stoneMap.value.get(key)
}

function displayText(base: string, x: number, y: number): string {
  if (base) return base
  const stone = stoneMap.value.get(`${x},${y}`)
  if (!stone) return ''
  return stone.color === 'blue' ? 'A' : 'B'
}

function isLast(x: number, y: number): boolean {
  return lastMove.value?.x === x && lastMove.value?.y === y
}

function canPlace(x: number, y: number): boolean {
  if (!props.interactive || props.disabled) return false
  return !stoneMap.value.has(`${x},${y}`)
}

function place(x: number, y: number) {
  if (!canPlace(x, y)) return
  emit('place', x, y)
}
</script>

<template>
  <div class="gomoku" :class="[`is-self-${selfColor}`, { 'is-disabled': disabled }]">
    <div class="gomoku__frame" role="grid" aria-label="15×15 代码矩阵面板">
      <div class="gomoku__header" aria-hidden="true">
        <span class="gomoku__gutter">#</span>
        <span
          v-for="(label, col) in columns"
          :key="label"
          class="gomoku__col-label"
          :class="{ 'is-current': currentColumn === col }"
        >
          {{ label }}
        </span>
      </div>

      <div
        v-for="row in rows"
        :key="row.y"
        class="gomoku__row"
        :class="{
          'is-current': currentRow === row.y,
          'is-blue': currentRow === row.y && lastColor === 'blue',
          'is-cyan': currentRow === row.y && lastColor === 'cyan',
        }"
        role="row"
      >
        <span class="gomoku__lineno" aria-hidden="true">{{ row.label }}</span>
        <div class="gomoku__cells">
          <button
            v-for="cell in row.cells"
            :key="cell.key"
            type="button"
            class="gomoku__cell"
            :class="{
              'can-place': canPlace(cell.x, row.y),
              'is-blank': !cell.token && !stoneAt(cell.key),
            }"
            :disabled="!canPlace(cell.x, row.y)"
            :aria-label="`第 ${row.y + 1} 行第 ${cell.x + 1} 列`"
            @click="place(cell.x, row.y)"
          >
            <span
              v-if="displayText(cell.token, cell.x, row.y)"
              class="gomoku__token"
              :class="{
                'is-placed': Boolean(stoneAt(cell.key)),
                'is-blue': stoneAt(cell.key)?.color === 'blue',
                'is-cyan': stoneAt(cell.key)?.color === 'cyan',
                'is-last': isLast(cell.x, row.y),
              }"
              aria-hidden="true"
            >
              {{ displayText(cell.token, cell.x, row.y) }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gomoku {
  --code-blue: #6799ff;
  --code-cyan: #3fc7b3;
  --code-token: color-mix(in srgb, var(--fm-text-muted) 62%, transparent);
  --code-line: color-mix(in srgb, var(--fm-border) 62%, transparent);

  width: min(100%, 68vh, 820px);
  margin: 0 auto;
  padding: 8px 10px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 78%, #090c10);
  font-family: var(--fm-mono);
}

.gomoku.is-self-blue {
  --code-self: var(--code-blue);
}

.gomoku.is-self-cyan {
  --code-self: var(--code-cyan);
}

.gomoku__header {
  display: grid;
  grid-template-columns: 30px repeat(15, minmax(0, 1fr));
  align-items: center;
  height: 22px;
  color: var(--fm-text-muted);
  font-size: 9px;
}

.gomoku__gutter {
  padding-right: 7px;
  text-align: right;
  opacity: 0.45;
}

.gomoku__col-label {
  text-align: center;
  opacity: 0.55;
  transition: color 120ms ease, opacity 120ms ease;
}

.gomoku__col-label.is-current {
  color: var(--fm-text-dim);
  opacity: 0.9;
}

.gomoku__row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: stretch;
  min-height: 17px;
  border-radius: 2px;
  transition: background-color 140ms ease;
}

.gomoku__row.is-current {
  background: color-mix(in srgb, var(--fm-text) 3.5%, transparent);
}

.gomoku__lineno {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding-right: 8px;
  color: var(--fm-text-muted);
  font-size: 9px;
  opacity: 0.55;
  transition: color 140ms ease, opacity 140ms ease;
}

.gomoku__lineno::before {
  color: var(--code-blue);
  content: '›';
  opacity: 0;
}

.gomoku__row.is-current .gomoku__lineno {
  color: var(--fm-text-dim);
  opacity: 0.95;
}

.gomoku__row.is-current .gomoku__lineno::before {
  opacity: 0.9;
}

.gomoku__row.is-cyan .gomoku__lineno::before {
  color: var(--code-cyan);
}

.gomoku__cells {
  display: grid;
  grid-template-columns: repeat(15, minmax(0, 1fr));
}

.gomoku__cell {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: default;
  appearance: none;
}

.gomoku__cell::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: var(--code-line);
  content: '';
  opacity: 0.28;
  pointer-events: none;
}

.gomoku__cell:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--code-self, var(--code-blue)) 55%, transparent);
  outline-offset: -2px;
}

.gomoku__cell.can-place {
  cursor: crosshair;
}

.gomoku__cell.can-place:hover {
  background: color-mix(in srgb, var(--fm-text) 4%, transparent);
}

.gomoku__cell.is-blank.can-place:hover::before {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--code-self, var(--code-cyan));
  content: '';
  opacity: 0.55;
}

.gomoku__token {
  position: relative;
  z-index: 1;
  padding: 1px 3px;
  border-radius: 2px;
  color: var(--code-token);
  font-size: 10px;
  letter-spacing: 0.1px;
  line-height: 1;
  transition:
    color 120ms ease,
    background-color 120ms ease,
    box-shadow 120ms ease;
}

.gomoku__token.is-placed {
  font-weight: 700;
}

.gomoku__token.is-blue {
  background: color-mix(in srgb, var(--code-blue) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--code-blue) 34%, transparent);
  color: var(--code-blue);
}

.gomoku__token.is-cyan {
  background: color-mix(in srgb, var(--code-cyan) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--code-cyan) 34%, transparent);
  color: var(--code-cyan);
}

.gomoku__token.is-last {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.gomoku__token.is-last::after {
  position: absolute;
  top: 1px;
  right: -3px;
  bottom: 1px;
  width: 1px;
  background: currentColor;
  content: '';
}

.gomoku__cell.can-place:hover .gomoku__token {
  background: color-mix(in srgb, var(--code-self, var(--code-cyan)) 9%, transparent);
  color: var(--code-self, var(--code-cyan));
}

.gomoku.is-disabled .gomoku__frame {
  opacity: 0.93;
}

@media (max-width: 620px) {
  .gomoku {
    width: 100%;
    padding: 5px 7px 7px;
  }

  .gomoku__header {
    grid-template-columns: 24px repeat(15, minmax(0, 1fr));
    height: 18px;
    font-size: 8px;
  }

  .gomoku__gutter,
  .gomoku__lineno {
    padding-right: 6px;
  }

  .gomoku__row {
    grid-template-columns: 24px minmax(0, 1fr);
    min-height: 15px;
  }

  .gomoku__lineno {
    font-size: 8px;
  }

  .gomoku__token {
    padding: 0 1px;
    font-size: 8px;
  }
}
</style>
