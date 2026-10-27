<script setup lang="ts">
import type { LeaderboardEntry } from '../types'

withDefaults(
  defineProps<{
    entries: LeaderboardEntry[]
    loading?: boolean
    error?: string
  }>(),
  { loading: false, error: '' },
)
</script>

<template>
  <section class="leaderboard">
    <header class="leaderboard__head">
      <span>冠军榜</span>
      <span class="leaderboard__meta">冠军 30 分 · 亚军 10 分</span>
    </header>
    <p class="leaderboard__hint">赛事只认输赢，对局内得分不计入总积分。</p>
    <div v-if="loading" class="leaderboard__empty">正在同步排行…</div>
    <div v-else-if="error" class="leaderboard__empty leaderboard__empty--err">{{ error }}</div>
    <div v-else-if="entries.length === 0" class="leaderboard__empty">暂无冠军记录</div>
    <template v-else>
      <div class="leaderboard__columns" aria-hidden="true">
        <span>#</span>
        <span>名号 / ID</span>
        <span>冠军</span>
        <span>亚军</span>
        <span>总积分</span>
      </div>
      <ol class="leaderboard__list">
        <li v-for="entry in entries" :key="entry.userId">
          <span class="leaderboard__rank" :class="{ 'is-top': entry.rank <= 3 }">
            {{ String(entry.rank).padStart(2, '0') }}
          </span>
          <span class="leaderboard__name">
            <strong>{{ entry.nickname }}</strong>
            <em>{{ entry.userId }}</em>
          </span>
          <span class="leaderboard__count leaderboard__count--gold">{{ entry.championships }}</span>
          <span class="leaderboard__count">{{ entry.runnerUps }}</span>
          <span class="leaderboard__score">{{ entry.points }}</span>
        </li>
      </ol>
    </template>
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

.leaderboard__columns {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 4px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.leaderboard__columns > span:first-child {
  width: 22px;
}

.leaderboard__columns > span:nth-child(2) {
  flex: 1;
}

.leaderboard__columns > span:nth-child(n + 3) {
  width: 38px;
  text-align: right;
}

.leaderboard__columns > span:last-child {
  width: 52px;
}

.leaderboard__count {
  flex: none;
  width: 38px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 10px;
  text-align: right;
}

.leaderboard__count--gold {
  color: var(--fm-warn);
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
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  color: var(--fm-text-dim);
}

.leaderboard__name strong {
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaderboard__name em {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaderboard__score {
  flex: none;
  width: 52px;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 10px;
  text-align: right;
}
</style>
