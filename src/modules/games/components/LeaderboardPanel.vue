<script setup lang="ts">
import { reactive, ref } from 'vue'

import { formatApiError } from '@/lib/http'
import { updateLeaderboardEntry } from '@/modules/games/gameApi'
import type { LeaderboardEntry } from '@/types/games'

/**
 * 冠军榜。管理员是特殊玩家：同一块面板上多出「调整」入口，
 * 可以改统计数值、下架、调整展示权重；普通玩家只看到榜单。
 */
const props = withDefaults(
  defineProps<{
    entries: LeaderboardEntry[]
    loading?: boolean
    error?: string
    admin?: boolean
    gameId?: string
  }>(),
  { loading: false, error: '', admin: false, gameId: '' },
)

const emit = defineEmits<{ saved: [] }>()

const editingUserId = ref('')
const saving = ref(false)
const saveError = ref('')

const draft = reactive({
  points: 0,
  matches: 0,
  wins: 0,
  losses: 0,
  championships: 0,
  runnerUps: 0,
  bestScore: 0,
  displayOrder: 0,
  visible: true,
})

function startEdit(entry: LeaderboardEntry) {
  editingUserId.value = entry.userId
  saveError.value = ''
  draft.points = entry.points
  draft.matches = entry.matches ?? 0
  draft.wins = entry.wins ?? 0
  draft.losses = entry.losses ?? 0
  draft.championships = entry.championships
  draft.runnerUps = entry.runnerUps
  draft.bestScore = entry.bestScore ?? 0
  draft.displayOrder = entry.displayOrder ?? 0
  draft.visible = entry.visible ?? true
}

function cancelEdit() {
  editingUserId.value = ''
  saveError.value = ''
}

async function save(entry: LeaderboardEntry) {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await updateLeaderboardEntry(
      entry.userId,
      {
        points: draft.points,
        matches: draft.matches,
        wins: draft.wins,
        losses: draft.losses,
        championships: draft.championships,
        runnerUps: draft.runnerUps,
        bestScore: draft.bestScore,
        displayOrder: draft.displayOrder,
        visible: draft.visible,
      },
      props.gameId,
    )
    editingUserId.value = ''
    emit('saved')
  } catch (error) {
    saveError.value = formatApiError(error, '保存榜单调整失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="leaderboard">
    <header class="leaderboard__head">
      <span>冠军榜</span>
      <span class="leaderboard__meta">
        <template v-if="admin">管理员视角 · 权重优先</template>
        <template v-else>冠军 30 分 · 亚军 10 分</template>
      </span>
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
        <template v-for="entry in entries" :key="entry.userId">
          <li :class="{ 'is-hidden-entry': entry.visible === false }">
            <span class="leaderboard__rank" :class="{ 'is-top': entry.rank <= 3 }">
              {{ String(entry.rank).padStart(2, '0') }}
            </span>
            <span class="leaderboard__name">
              <strong>
                {{ entry.nickname }}
                <i v-if="entry.visible === false" class="leaderboard__tag">已下架</i>
                <i
                  v-else-if="admin && (entry.displayOrder ?? 0) > 0"
                  class="leaderboard__tag is-order"
                >
                  权重 {{ entry.displayOrder }}
                </i>
              </strong>
              <em>{{ entry.userId }}</em>
            </span>
            <span class="leaderboard__count leaderboard__count--gold">{{ entry.championships }}</span>
            <span class="leaderboard__count">{{ entry.runnerUps }}</span>
            <span class="leaderboard__score">{{ entry.points }}</span>
            <button
              v-if="admin"
              type="button"
              class="leaderboard__manage"
              @click="editingUserId === entry.userId ? cancelEdit() : startEdit(entry)"
            >
              {{ editingUserId === entry.userId ? '收起' : '调整' }}
            </button>
          </li>
          <li v-if="admin && editingUserId === entry.userId" class="leaderboard__editor">
            <div class="leaderboard__editor-grid">
              <label>积分<input v-model.number="draft.points" type="number" min="0" /></label>
              <label>场次<input v-model.number="draft.matches" type="number" min="0" /></label>
              <label>胜<input v-model.number="draft.wins" type="number" min="0" /></label>
              <label>负<input v-model.number="draft.losses" type="number" min="0" /></label>
              <label>冠军<input v-model.number="draft.championships" type="number" min="0" /></label>
              <label>亚军<input v-model.number="draft.runnerUps" type="number" min="0" /></label>
              <label>最高分<input v-model.number="draft.bestScore" type="number" min="0" /></label>
              <label>权重<input v-model.number="draft.displayOrder" type="number" min="0" /></label>
            </div>
            <div class="leaderboard__editor-actions">
              <label class="leaderboard__editor-toggle">
                <input v-model="draft.visible" type="checkbox" />
                在榜单展示
              </label>
              <span v-if="saveError" class="leaderboard__editor-err">{{ saveError }}</span>
              <button type="button" class="leaderboard__save" :disabled="saving" @click="save(entry)">
                {{ saving ? '保存中…' : '保存' }}
              </button>
            </div>
          </li>
        </template>
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

.leaderboard__list li.is-hidden-entry {
  opacity: 0.55;
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
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaderboard__tag {
  flex: none;
  padding: 1px 4px;
  border: 1px solid color-mix(in srgb, var(--fm-err) 40%, transparent);
  border-radius: 2px;
  color: var(--fm-err);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  font-style: normal;
}

.leaderboard__tag.is-order {
  border-color: color-mix(in srgb, var(--fm-accent) 40%, transparent);
  color: var(--fm-accent);
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

.leaderboard__manage {
  flex: none;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 35%, transparent);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 8px;
  cursor: pointer;
}

.leaderboard__manage:hover {
  background: color-mix(in srgb, var(--fm-accent) 10%, transparent);
}

.leaderboard__editor {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px;
  border: 1px dashed color-mix(in srgb, var(--fm-accent) 30%, var(--fm-border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-accent) 4%, transparent);
}

.leaderboard__editor-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.leaderboard__editor-grid label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--fm-text-muted);
  font-size: 8px;
}

.leaderboard__editor-grid input {
  width: 100%;
  padding: 3px 5px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 9.5px;
}

.leaderboard__editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.leaderboard__editor-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--fm-text-dim);
  font-size: 8.5px;
}

.leaderboard__editor-err {
  color: var(--fm-err);
  font-size: 8.5px;
}

.leaderboard__save {
  margin-left: auto;
  padding: 3px 10px;
  border: 1px solid var(--fm-accent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--fm-accent) 12%, transparent);
  color: var(--fm-accent);
  font-size: 9px;
  cursor: pointer;
}

.leaderboard__save:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
