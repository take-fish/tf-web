<script setup lang="ts">
import { computed } from 'vue'

import type { MatchupRow } from '../types'
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

/**
 * 本轮对阵。
 *
 * 数据只取当前回合：回合切走时 store 会整体重建，这里不做任何跨回合缓存。
 * 点已开演的一行 → 打开观察窗看这一场的轨迹。
 */

const drill = useDrillStore()
const ui = useDrillUiStore()

const rows = computed(() => drill.matchups)
const round = computed(() => drill.snapshot.round)

function open(row: MatchupRow) {
  if (!row.hasTrace) return
  if (drill.openMatchup(row.id)) ui.openArena()
}
</script>

<template>
  <section class="drill__panel drill__match">
    <header class="drill__panel-head">
      <b>本轮对阵</b>
      <span class="drill__match-round">第 {{ round }} 轮</span>
    </header>

    <ul class="drill__match-list">
      <li v-for="row in rows" :key="row.id" class="drill__match-item">
        <button
          type="button"
          class="drill__match-row"
          :class="{ 'is-pending': !row.played, 'is-player': row.isPlayer }"
          :disabled="!row.hasTrace"
          :title="row.hasTrace ? '查看本场回放' : row.played ? '本场轨迹已释放' : '本轮尚未开演'"
          @click="open(row)"
        >
          <span class="drill__match-side drill__match-side--home">{{ row.home }}</span>
          <span class="drill__match-vs">vs</span>
          <span class="drill__match-side drill__match-side--away">{{ row.away }}</span>
          <span class="drill__match-tag" :class="`is-${row.tone}`">{{ row.resultLabel }}</span>
        </button>
        <span v-if="row.detail" class="drill__match-detail">{{ row.detail }}</span>
      </li>
    </ul>

    <p v-if="rows.length === 0" class="drill__match-empty">本轮尚未配对</p>
    <p v-else class="drill__match-hint">点任意一行看这一场的演练轨迹</p>
  </section>
</template>
