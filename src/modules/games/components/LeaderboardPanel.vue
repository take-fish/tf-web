<script setup lang="ts">
import type { LeaderboardEntry } from '../types'

withDefaults(
  defineProps<{
    entries: LeaderboardEntry[]
    loading?: boolean
    error?: string
    bestScore?: number
    rank?: number
  }>(),
  { loading: false, error: '', bestScore: 0, rank: 0 },
)
</script>

<template>
  <section class="leaderboard">
    <header class="leaderboard__head">
      <span>综合排行</span>
      <span class="leaderboard__meta">
        <template v-if="bestScore">我的积分 {{ bestScore }} · 排名 {{ rank }}</template>
        <template v-else>暂无个人记录</template>
      </span>
    </header>
    <p class="leaderboard__hint">五子棋胜 +3 / 负 +1 / 冠军 +10 · 打砖块每 100 分折算 1 积分</p>
    <div v-if="loading" class="leaderboard__empty">正在同步排行…</div>
    <div v-else-if="error" class="leaderboard__empty leaderboard__empty--err">{{ error }}</div>
    <div v-else-if="entries.length === 0" class="leaderboard__empty">暂无比赛记录</div>
    <ol v-else class="leaderboard__list">
      <li v-for="entry in entries" :key="entry.userId">
        <span class="leaderboard__rank" :class="{ 'is-top': entry.rank <= 3 }">
          {{ String(entry.rank).padStart(2, '0') }}
        </span>
        <span class="leaderboard__name">
          {{ entry.nickname }}
          <em v-if="(entry.championships ?? 0) > 0" class="leaderboard__crown">
            ♛ {{ entry.championships }}
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
