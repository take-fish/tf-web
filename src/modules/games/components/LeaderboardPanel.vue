<script setup lang="ts">
import { computed } from 'vue'

import type { LeaderboardEntry, LeaderboardGameId } from '../types'

const props = withDefaults(
  defineProps<{
    entries: LeaderboardEntry[]
    loading?: boolean
    error?: string
    bestScore?: number
    rank?: number
    gameId?: LeaderboardGameId
    gameOptions?: Array<{ id: LeaderboardGameId; label: string }>
  }>(),
  {
    loading: false,
    error: '',
    bestScore: 0,
    rank: 0,
    gameId: 'overall',
    gameOptions: () => [],
  },
)

const emit = defineEmits<{ change: [gameId: LeaderboardGameId] }>()

const title = computed(() => {
  if (props.gameId === 'blind-xiangqi') return '盲棋排行'
  if (props.gameId === 'heatmap-gomoku') return '五子棋排行'
  return '综合排行'
})

const hint = computed(() =>
  props.gameId === 'overall'
    ? '演练成功 +3 / 参与 +1 / 结果确认 +10 · 采样每 100 分折算 1 积分'
    : '演练成功 +3 / 参与 +1 / 结果确认 +10',
)
</script>

<template>
  <section class="leaderboard">
    <header class="leaderboard__head">
      <span>{{ title }}</span>
      <span class="leaderboard__meta">
        <template v-if="bestScore">我的积分 {{ bestScore }} · 排名 {{ rank }}</template>
        <template v-else>暂无个人记录</template>
      </span>
    </header>
    <div v-if="gameOptions.length" class="leaderboard__tabs">
      <button
        v-for="option in gameOptions"
        :key="option.id"
        type="button"
        :class="{ 'is-active': gameId === option.id }"
        @click="emit('change', option.id)"
      >
        {{ option.label }}
      </button>
    </div>
    <p class="leaderboard__hint">{{ hint }}</p>
    <div v-if="loading" class="leaderboard__empty">正在同步排行…</div>
    <div v-else-if="error" class="leaderboard__empty leaderboard__empty--err">{{ error }}</div>
    <div v-else-if="entries.length === 0" class="leaderboard__empty">暂无演练记录</div>
    <ol v-else class="leaderboard__list">
      <li v-for="entry in entries" :key="entry.userId">
        <span class="leaderboard__rank" :class="{ 'is-top': entry.rank <= 3 }">
          {{ String(entry.rank).padStart(2, '0') }}
        </span>
        <span class="leaderboard__name">
          {{ entry.nickname }}
          <em v-if="(entry.championships ?? 0) > 0" class="leaderboard__crown">
            T {{ entry.championships }}
          </em>
        </span>
        <span class="leaderboard__record">
          {{ entry.wins ?? 0 }}胜{{ entry.losses ?? 0 }}负
        </span>
        <span class="leaderboard__score">{{ entry.points ?? entry.score }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.leaderboard {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.leaderboard__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.leaderboard__head > span:first-child {
  color: var(--fm-text);
  font-size: 12px;
  font-weight: 600;
}

.leaderboard__meta {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.leaderboard__tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 7px;
}

.leaderboard__tabs button {
  padding: 3px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  cursor: pointer;
}

.leaderboard__tabs button:hover {
  border-color: color-mix(in srgb, var(--fm-accent) 45%, transparent);
  color: var(--fm-text-dim);
}

.leaderboard__tabs button.is-active {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
  color: var(--fm-accent);
}

.leaderboard__hint {
  margin: 0 0 8px;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  line-height: 1.5;
}

.leaderboard__crown {
  margin-left: 5px;
  color: var(--fm-warn);
  font-size: 8.5px;
  font-style: normal;
}

.leaderboard__record {
  flex: none;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
}

.leaderboard__empty {
  padding: 14px 4px;
  color: var(--fm-text-muted);
  font-size: 10.5px;
}

.leaderboard__empty--err {
  color: var(--fm-err);
}

.leaderboard__list {
  display: flex;
  flex-direction: column;
}

.leaderboard__list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 6px;
  border-bottom: 1px solid var(--fm-border);
  font-size: 10.5px;
}

.leaderboard__list li:last-child {
  border-bottom: 0;
}

.leaderboard__rank {
  width: 22px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.leaderboard__rank.is-top {
  color: var(--fm-warn);
}

.leaderboard__name {
  flex: 1;
  overflow: hidden;
  color: var(--fm-text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaderboard__score {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 10px;
}
</style>
