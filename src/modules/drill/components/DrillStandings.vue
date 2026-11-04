<script setup lang="ts">
import { computed, onBeforeUpdate, onUpdated, ref } from 'vue'

import { useDrillStore } from '../stores/drill'

interface Row {
  key: string
  name: string
  wins: number
  losses: number
  draws: number
  score: number
  self: boolean
}

const drill = useDrillStore()

const rows = computed<Row[]>(() =>
  (drill.snapshot.standings ?? [])
    .map((row) => ({
      key: row.name,
      name: row.self ? '我' : row.name,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      score: row.wins * 3 + row.draws,
      self: row.self,
    }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins || a.losses - b.losses),
)

const rankByKey = computed(() => new Map(rows.value.map((row, index) => [row.key, index + 1])))

const moved = ref<Record<string, number>>({})
const els = new Map<string, HTMLElement>()
let prevTops = new Map<string, number>()
let prevRanks = new Map<string, number>()
let clearTimer: ReturnType<typeof setTimeout> | undefined

function bindRow(key: string, el: Element | null): void {
  if (el instanceof HTMLElement) els.set(key, el)
  else els.delete(key)
}

onBeforeUpdate(() => {
  prevTops = new Map()
  prevRanks = new Map()
  els.forEach((el, key) => {
    prevTops.set(key, el.getBoundingClientRect().top)
    const rank = rankByKey.value.get(key)
    if (rank !== undefined) prevRanks.set(key, rank)
  })
})

onUpdated(() => {
  const deltas: Record<string, number> = {}
  els.forEach((el, key) => {
    // FLIP：先把行瞬移回旧位置，再动画回到新位置，肉眼可见「第三行滑到第一行」
    const prevTop = prevTops.get(key)
    if (prevTop !== undefined) {
      const dy = prevTop - el.getBoundingClientRect().top
      if (Math.abs(dy) >= 1 && typeof el.animate === 'function') {
        el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)' },
        )
      }
    }
    const before = prevRanks.get(key)
    const after = rankByKey.value.get(key)
    if (before !== undefined && after !== undefined && before !== after) {
      deltas[key] = before - after
    }
  })
  moved.value = deltas
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    moved.value = {}
  }, 1500)
})
</script>

<template>
  <section class="drill__panel drill__panel--standings" aria-label="战绩榜">
    <header class="drill__panel-head">
      <span>战绩榜</span>
      <em>{{ rows.length }} 席 · 实时</em>
    </header>

    <ol class="drill__standings">
      <li
        v-for="(row, index) in rows"
        :key="row.key"
        :ref="(el) => bindRow(row.key, el as Element | null)"
        class="drill__standing"
        :class="{ 'is-self': row.self }"
      >
        <span class="drill__standing-rank">{{ index + 1 }}</span>
        <span class="drill__standing-name">{{ row.name }}</span>
        <span class="drill__standing-record">{{ row.wins }}-{{ row.losses }}-{{ row.draws }}</span>
        <span class="drill__standing-score">{{ row.score }}</span>
        <span
          v-if="moved[row.key]"
          class="drill__standing-delta"
          :class="moved[row.key]! > 0 ? 'is-up' : 'is-down'"
        >
          {{ moved[row.key]! > 0 ? '↑' : '↓' }}{{ Math.abs(moved[row.key]!) }}
        </span>
      </li>
    </ol>
  </section>
</template>
