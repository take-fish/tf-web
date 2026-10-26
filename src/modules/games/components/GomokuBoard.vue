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
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(255, 146, 60, 0.22);
  border-radius: 6px;
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 136, 51, 0.14), transparent 62%),
    linear-gradient(145deg, #171b20, #101318);
  box-shadow:
    inset 0 0 42px rgba(0, 0, 0, 0.5),
    0 12px 32px rgba(0, 0, 0, 0.28);
}

.gomoku__board {
  display: grid;
  grid-template-columns: repeat(15, minmax(0, 1fr));
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid rgba(255, 178, 108, 0.18);
  background: rgba(7, 9, 12, 0.4);
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
  background: rgba(240, 175, 108, 0.24);
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
  background: rgba(255, 147, 62, 0.08);
}

.gomoku__cell:focus-visible {
  outline: 1px solid var(--fm-accent);
  outline-offset: -2px;
}

.gomoku__star {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 187, 128, 0.55);
}

.gomoku__stone {
  position: relative;
  z-index: 2;
  width: 84%;
  height: 84%;
  border-radius: 50%;
  transition:
    box-shadow 180ms ease,
    transform 120ms ease;
}

.gomoku__stone.is-black {
  background: radial-gradient(circle at 34% 28%, #6b7280 0%, #262b33 36%, #0a0c0f 100%);
  box-shadow:
    inset -2px -3px 6px rgba(0, 0, 0, 0.7),
    inset 1px 2px 4px rgba(255, 255, 255, 0.16),
    0 2px 4px rgba(0, 0, 0, 0.55);
}

.gomoku__stone.is-white {
  background: radial-gradient(circle at 34% 28%, #ffffff 0%, #e7edf5 46%, #9aa7b8 100%);
  box-shadow:
    inset -2px -3px 6px rgba(88, 101, 119, 0.44),
    inset 1px 2px 4px rgba(255, 255, 255, 0.9),
    0 2px 4px rgba(0, 0, 0, 0.45);
}

.gomoku__stone.is-recent {
  box-shadow:
    0 0 0 2px rgba(255, 136, 51, 0.3),
    0 0 14px rgba(255, 136, 51, 0.42);
}

.gomoku__stone.is-last::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: #ff7a1a;
  content: '';
  transform: translate(-50%, -50%);
  box-shadow: 0 0 8px rgba(255, 122, 26, 0.9);
}

.gomoku__stone.is-ghost {
  opacity: 0;
  box-shadow: none;
  transition: opacity 120ms ease;
}

.gomoku__cell.can-place:hover .is-ghost {
  opacity: 0.32;
}

.gomoku.is-disabled .gomoku__board {
  opacity: 0.9;
}
</style>
