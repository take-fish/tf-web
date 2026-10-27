<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  BLIND_HEIGHT,
  BLIND_WIDTH,
  colorOfPlayer,
  legalTargets,
  pieceGlyph,
  pieceLabel,
} from '../lib/blindXiangqi'
import type { BlindCell } from '../lib/blindXiangqi'
import type { BlindPieceColor, BlindPieceView, GameMove } from '../types'

const props = withDefaults(
  defineProps<{
    pieces: BlindPieceView[]
    moves?: GameMove[]
    selfUserId?: string
    firstUserId?: string
    secondUserId?: string
    turnUserId?: string | null
    interactive?: boolean
    disabled?: boolean
  }>(),
  {
    moves: () => [],
    selfUserId: '',
    firstUserId: '',
    secondUserId: '',
    turnUserId: null,
    interactive: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  reveal: [x: number, y: number]
  move: [fromX: number, fromY: number, toX: number, toY: number]
}>()

interface BoardCell extends BlindCell {
  key: string
  piece?: BlindPieceView
}

interface BoardRow {
  y: number
  label: string
  cells: BoardCell[]
}

const files = Array.from({ length: BLIND_WIDTH }, (_, index) =>
  String.fromCharCode(65 + index),
)

const selected = ref<BlindCell | null>(null)

const piecesByCell = computed(() => {
  const map = new Map<string, BlindPieceView>()
  for (const piece of props.pieces) map.set(`${piece.x},${piece.y}`, piece)
  return map
})

const rows = computed<BoardRow[]>(() =>
  Array.from({ length: BLIND_HEIGHT }, (_, y) => ({
    y,
    label: String(y + 1).padStart(2, '0'),
    cells: Array.from({ length: BLIND_WIDTH }, (_, x) => ({
      x,
      y,
      key: `${x},${y}`,
      piece: piecesByCell.value.get(`${x},${y}`),
    })),
  })),
)

const myColor = computed<BlindPieceColor | null>(() =>
  colorOfPlayer(props.selfUserId, props.firstUserId, props.secondUserId),
)

const isMyTurn = computed(
  () =>
    props.interactive &&
    !props.disabled &&
    Boolean(props.turnUserId) &&
    props.turnUserId === props.selfUserId,
)

const legalKeys = computed(() => {
  if (!selected.value || !myColor.value) return new Set<string>()
  return new Set(
    legalTargets(
      props.pieces,
      myColor.value,
      selected.value.x,
      selected.value.y,
    ).map((cell) => `${cell.x},${cell.y}`),
  )
})

const lastMove = computed<GameMove | undefined>(
  () => props.moves[props.moves.length - 1],
)
const lastFromKey = computed(() => {
  const move = lastMove.value
  if (!move || move.action !== 'MOVE' || move.fromX == null || move.fromY == null) {
    return ''
  }
  return `${move.fromX},${move.fromY}`
})
const lastToKey = computed(() => {
  const move = lastMove.value
  return move ? `${move.x},${move.y}` : ''
})

watch(
  () => props.turnUserId,
  () => {
    selected.value = null
  },
)

watch(
  () => [props.interactive, props.disabled] as const,
  () => {
    if (!props.interactive || props.disabled) selected.value = null
  },
)

watch(
  () => props.pieces,
  () => {
    const current = selected.value
    if (!current) return
    const piece = piecesByCell.value.get(`${current.x},${current.y}`)
    if (!piece?.revealed || piece.color !== myColor.value) selected.value = null
  },
  { deep: true },
)

function isSelected(cell: BlindCell): boolean {
  return selected.value?.x === cell.x && selected.value?.y === cell.y
}

function canInteractCell(cell: BoardCell): boolean {
  if (!isMyTurn.value) return false
  if (selected.value) {
    if (isSelected(cell)) return true
    if (cell.piece?.revealed && cell.piece.color === myColor.value) return true
    return legalKeys.value.has(cell.key)
  }
  return Boolean(
    cell.piece &&
      (!cell.piece.revealed || cell.piece.color === myColor.value),
  )
}

function onCellClick(cell: BoardCell) {
  if (!isMyTurn.value) return
  if (selected.value) {
    if (isSelected(cell)) {
      selected.value = null
      return
    }
    if (cell.piece?.revealed && cell.piece.color === myColor.value) {
      selected.value = { x: cell.x, y: cell.y }
      return
    }
    if (legalKeys.value.has(cell.key)) {
      emit('move', selected.value.x, selected.value.y, cell.x, cell.y)
      selected.value = null
    }
    return
  }
  if (cell.piece && !cell.piece.revealed) {
    emit('reveal', cell.x, cell.y)
    return
  }
  if (cell.piece?.revealed && cell.piece.color === myColor.value) {
    selected.value = { x: cell.x, y: cell.y }
  }
}

function pieceClasses(piece?: BlindPieceView): Record<string, boolean> {
  return {
    'is-hidden': Boolean(piece && !piece.revealed),
    'is-revealed': Boolean(piece?.revealed),
    'is-red': piece?.color === 'RED',
    'is-black': piece?.color === 'BLACK',
  }
}

function displayGlyph(piece?: BlindPieceView): string {
  if (!piece?.revealed || !piece.color || !piece.pieceType) return '?'
  return pieceGlyph(piece.color, piece.pieceType)
}

function cellClasses(cell: BoardCell): Record<string, boolean> {
  return {
    'is-river': cell.y === 5,
    'is-selected': isSelected(cell),
    'is-legal': legalKeys.value.has(cell.key),
    'is-last-from': lastFromKey.value === cell.key,
    'is-last-to': lastToKey.value === cell.key,
    'is-actionable': canInteractCell(cell),
  }
}

function cellAria(cell: BoardCell): string {
  const coordinate = `${files[cell.x] ?? ''}${String(cell.y + 1).padStart(2, '0')}`
  if (!cell.piece) return `${coordinate} 空位`
  if (!cell.piece.revealed) return `${coordinate} 反面棋`
  if (!cell.piece.color || !cell.piece.pieceType) return `${coordinate} 已翻开的棋`
  return `${coordinate} ${pieceLabel(cell.piece.color, cell.piece.pieceType)}`
}
</script>

<template>
  <div class="blind" :class="{ 'is-disabled': disabled }">
    <div class="blind__frame" role="grid" aria-label="盲棋 9×10 棋盘">
      <div class="blind__header" aria-hidden="true">
        <span class="blind__gutter">#</span>
        <span
          v-for="(file, x) in files"
          :key="file"
          class="blind__file"
          :class="{ 'is-current': selected?.x === x }"
        >
          {{ file }}
        </span>
      </div>

      <div
        v-for="row in rows"
        :key="row.y"
        class="blind__row"
        :class="{ 'is-current': selected?.y === row.y }"
        role="row"
      >
        <span class="blind__rank" aria-hidden="true">{{ row.label }}</span>
        <div class="blind__cells">
          <button
            v-for="cell in row.cells"
            :key="cell.key"
            type="button"
            class="blind__cell"
            :class="cellClasses(cell)"
            :disabled="!canInteractCell(cell)"
            :aria-label="cellAria(cell)"
            @click="onCellClick(cell)"
          >
            <span
              v-if="cell.piece"
              class="blind__piece"
              :class="pieceClasses(cell.piece)"
            >
              {{ displayGlyph(cell.piece) }}
            </span>
            <span v-else class="blind__empty" aria-hidden="true" />
            <span
              v-if="legalKeys.has(cell.key)"
              class="blind__target"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>

    <div class="blind__hint">
      <span v-if="isMyTurn">
        {{
          selected
            ? '选择目标格：空格走子、反面棋盲吃、敌方棋子吃子'
            : '点击反面棋翻开，或点击己方棋子选择'
        }}
      </span>
      <span v-else-if="interactive && !disabled">等待对方行动…</span>
      <span v-else>只读棋盘</span>
    </div>
  </div>
</template>

<style scoped>
.blind {
  --blind-red: #e06666;
  --blind-red-soft: rgba(224, 102, 102, 0.14);
  --blind-black: #d0d6e0;
  --blind-black-soft: rgba(208, 214, 224, 0.12);
  --blind-line: color-mix(in srgb, var(--fm-border) 70%, transparent);

  width: min(100%, 62vh, 720px);
  margin: 0 auto;
  padding: 8px 10px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--fm-bg) 82%, #090c10), var(--fm-bg));
  font-family: var(--fm-mono);
}

.blind__frame {
  border: 1px solid var(--blind-line);
  border-radius: 2px;
  overflow: hidden;
}

.blind__header {
  display: grid;
  grid-template-columns: 30px repeat(9, minmax(0, 1fr));
  align-items: center;
  height: 22px;
  color: var(--fm-text-muted);
  font-size: 9px;
}

.blind__gutter {
  padding-right: 7px;
  text-align: right;
  opacity: 0.45;
}

.blind__file {
  text-align: center;
  opacity: 0.55;
  transition: color 120ms ease, opacity 120ms ease;
}

.blind__file.is-current {
  color: var(--fm-text-dim);
  opacity: 0.95;
}

.blind__row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  min-height: 38px;
}

.blind__rank {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  opacity: 0.5;
}

.blind__row.is-current .blind__rank {
  color: var(--fm-text-dim);
  opacity: 0.95;
}

.blind__cells {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
}

.blind__cell {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--blind-line) 42%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--blind-line) 42%, transparent);
  background: transparent;
  cursor: default;
  appearance: none;
}

.blind__cell:nth-child(9) {
  border-right: 0;
}

.blind__row.is-river .blind__cell {
  border-top: 1px solid color-mix(in srgb, var(--fm-accent) 26%, var(--blind-line));
}

.blind__cell:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--fm-accent) 60%, transparent);
  outline-offset: -2px;
}

.blind__cell.is-actionable {
  cursor: pointer;
}

.blind__cell.is-actionable:hover {
  background: color-mix(in srgb, var(--fm-accent) 7%, transparent);
}

.blind__piece {
  display: grid;
  place-items: center;
  width: 76%;
  max-width: 44px;
  aspect-ratio: 1;
  border-radius: 50%;
  font-size: clamp(15px, 2.2vh, 22px);
  font-weight: 700;
  line-height: 1;
  user-select: none;
  transition:
    color 120ms ease,
    background-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.blind__piece.is-hidden {
  border: 1px solid color-mix(in srgb, var(--fm-accent) 30%, var(--fm-border));
  background:
    repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--fm-accent) 8%, transparent) 0 3px,
      transparent 3px 7px
    ),
    color-mix(in srgb, var(--fm-bg) 60%, var(--fm-panel-2));
  color: color-mix(in srgb, var(--fm-accent) 55%, var(--fm-text-muted));
  font-size: 13px;
}

.blind__piece.is-hidden:hover {
  border-color: var(--fm-accent);
}

.blind__piece.is-red {
  border: 1px solid color-mix(in srgb, var(--blind-red) 60%, transparent);
  background: var(--blind-red-soft);
  color: var(--blind-red);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blind-red) 18%, transparent);
}

.blind__piece.is-black {
  border: 1px solid color-mix(in srgb, var(--blind-black) 52%, transparent);
  background: var(--blind-black-soft);
  color: var(--blind-black);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blind-black) 16%, transparent);
}

.blind__cell.is-selected .blind__piece {
  transform: scale(1.08);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--fm-accent) 70%, transparent),
    0 0 12px color-mix(in srgb, var(--fm-accent) 24%, transparent);
}

.blind__cell.is-last-from .blind__piece {
  opacity: 0.65;
}

.blind__cell.is-last-to .blind__piece {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--fm-accent) 55%, transparent),
    0 0 10px color-mix(in srgb, var(--fm-accent) 20%, transparent);
}

.blind__empty {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fm-text-muted) 30%, transparent);
  opacity: 0.42;
}

.blind__cell.is-actionable .blind__empty {
  opacity: 0.75;
}

.blind__target {
  position: absolute;
  width: 9px;
  height: 9px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 78%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--fm-accent) 26%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--fm-accent) 34%, transparent);
  pointer-events: none;
}

.blind__hint {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 2px 0;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  line-height: 1.5;
}

.blind.is-disabled .blind__frame {
  opacity: 0.9;
}

.blind.is-disabled .blind__cell {
  cursor: default;
}

@media (max-width: 620px) {
  .blind {
    width: 100%;
    padding: 5px 7px 7px;
  }

  .blind__header {
    grid-template-columns: 24px repeat(9, minmax(0, 1fr));
    height: 18px;
    font-size: 8px;
  }

  .blind__row {
    grid-template-columns: 24px minmax(0, 1fr);
    min-height: 31px;
  }

  .blind__rank {
    padding-right: 6px;
    font-size: 7.5px;
  }

  .blind__piece {
    font-size: 14px;
  }
}
</style>
