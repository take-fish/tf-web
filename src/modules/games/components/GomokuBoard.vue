<script setup lang="ts">
import { computed } from 'vue'

import type { GameMove } from '../types'

const SIZE = 15
const STAR_POINTS = new Set(['3,3', '3,11', '7,7', '11,3', '11,11'])

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

const cells = Array.from({ length: SIZE * SIZE }, (_, index) => {
  const x = index % SIZE
  const y = Math.floor(index / SIZE)
  return { x, y, key: `${x},${y}` }
})

const stoneMap = computed(() => {
  const map = new Map<string, { color: 'black' | 'white'; moveNo: number }>()
  for (const move of props.moves) {
    map.set(`${move.x},${move.y}`, {
      color: move.userId === props.blackUserId ? 'black' : 'white',
      moveNo: move.moveNo,
    })
  }
  return map
})

const recentKeys = computed(() => {
  const recent = new Set<string>()
  for (const move of props.moves.slice(-5)) {
    recent.add(`${move.x},${move.y}`)
  }
  return recent
})

const lastMove = computed(() => props.moves[props.moves.length - 1] ?? null)
const selfColor = computed(() =>
  props.selfUserId && props.selfUserId === props.blackUserId ? 'black' : 'white',
)

function stoneAt(key: string) {
  return stoneMap.value.get(key)
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
  <div class="gomoku" :class="{ 'is-disabled': disabled }">
    <div class="gomoku__board" role="grid" aria-label="15×15 五子棋棋盘">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="gomoku__cell"
        :class="{
          'has-star': STAR_POINTS.has(cell.key),
          'is-empty': !stoneAt(cell.key),
          'can-place': canPlace(cell.x, cell.y),
        }"
        :disabled="!canPlace(cell.x, cell.y)"
        :aria-label="`第 ${cell.y + 1} 行第 ${cell.x + 1} 列`"
        @click="place(cell.x, cell.y)"
      >
        <span v-if="STAR_POINTS.has(cell.key)" class="gomoku__star" aria-hidden="true" />
        <span
          v-if="stoneAt(cell.key)"
          class="gomoku__stone"
          :class="[
            `is-${stoneAt(cell.key)?.color}`,
            {
              'is-recent': recentKeys.has(cell.key),
              'is-last':
                lastMove?.x === cell.x && lastMove?.y === cell.y,
            },
          ]"
          aria-hidden="true"
        />
        <span
          v-else-if="interactive"
          class="gomoku__stone is-ghost"
          :class="`is-${selfColor}`"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.gomoku {
  width: min(100%, 58vh, 640px);
  margin: 0 auto;
  padding: 8px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 42%, var(--fm-panel));
}

.gomoku__board {
  display: grid;
  grid-template-columns: repeat(15, minmax(0, 1fr));
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-border) 82%, transparent);
  background: color-mix(in srgb, var(--fm-bg) 58%, transparent);
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

.gomoku__cell::before,
.gomoku__cell::after {
  position: absolute;
  content: '';
  background: color-mix(in srgb, var(--fm-text-muted) 32%, transparent);
  pointer-events: none;
}

.gomoku__cell::before {
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
}

.gomoku__cell::after {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
}

.gomoku__cell.can-place {
  cursor: crosshair;
}

.gomoku__cell.can-place:hover {
  background: var(--fm-hover);
}

.gomoku__cell:focus-visible {
  outline: 1px solid var(--fm-accent);
  outline-offset: -2px;
}

.gomoku__star {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fm-text-muted) 68%, transparent);
}

.gomoku__stone {
  position: relative;
  z-index: 2;
  width: 80%;
  height: 80%;
  border-radius: 50%;
  transition:
    outline-color 140ms ease,
    transform 120ms ease;
}

.gomoku__stone.is-black {
  background: radial-gradient(circle at 34% 28%, #5f6670 0%, #272b31 38%, #101216 100%);
  box-shadow:
    inset -1px -2px 4px rgba(0, 0, 0, 0.55),
    inset 1px 1px 2px rgba(255, 255, 255, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.4);
}

.gomoku__stone.is-white {
  background: radial-gradient(circle at 34% 28%, #f4f6f8 0%, #dfe4ea 48%, #aab2bd 100%);
  box-shadow:
    inset -1px -2px 4px rgba(88, 101, 119, 0.3),
    inset 1px 1px 2px rgba(255, 255, 255, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 用描边标记最近落子，不覆盖棋子本身的明暗，避免中央高亮过曝。 */
.gomoku__stone.is-recent {
  outline: 1px solid color-mix(in srgb, var(--fm-accent) 42%, transparent);
  outline-offset: 1px;
}

.gomoku__stone.is-last::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22%;
  height: 22%;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fm-accent) 55%, var(--fm-bg));
  content: '';
  transform: translate(-50%, -50%);
}

.gomoku__stone.is-ghost {
  opacity: 0;
  box-shadow: none;
  transition: opacity 120ms ease;
}

.gomoku__cell.can-place:hover .is-ghost {
  opacity: 0.2;
}

.gomoku.is-disabled .gomoku__board {
  opacity: 0.86;
}

@media (max-width: 620px) {
  .gomoku {
    width: 100%;
    padding: 6px;
  }
}
</style>
