<script setup lang="ts">
import { ref } from 'vue'

import { formatApiError } from '@/lib/http'
import { reorderMatchRecords, updateMatchRecord } from '@/modules/games/gameApi'
import type { MatchRecordPreview } from '@/types/games'

/**
 * 赛事记录列表：只展示预览（赛事、对阵、比分、状态），点开详情仍然走比赛窗口。
 * 管理员是特殊玩家：记录行上多出「隐藏 / 上移 / 下移」，普通玩家只读。
 */
const props = withDefaults(
  defineProps<{
    records: MatchRecordPreview[]
    loading?: boolean
    error?: string
    admin?: boolean
  }>(),
  { loading: false, error: '', admin: false },
)

const emit = defineEmits<{ updated: [records: MatchRecordPreview[]] }>()

const busyMatchId = ref('')
const actionError = ref('')

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待开始',
  READY: '待开局',
  RUNNING: '进行中',
  REST: '休息中',
  FINISHED: '已结束',
  BYE: '轮空',
}

function statusLabel(status: string | null): string {
  return status ? (STATUS_LABELS[status] ?? status) : '未知'
}

function timeLabel(at: number | null): string {
  if (!at) return '—'
  return new Date(at).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function versus(record: MatchRecordPreview): string {
  const left = record.player1Nickname ?? '待定'
  const right = record.player2Nickname ?? '待定'
  return `${left} ${record.player1Score} : ${record.player2Score} ${right}`
}

async function toggleVisible(record: MatchRecordPreview) {
  if (busyMatchId.value) return
  busyMatchId.value = record.matchId
  actionError.value = ''
  try {
    const updated = await updateMatchRecord(record.matchId, { visible: !record.visible })
    emit(
      'updated',
      props.records.map((item) => (item.matchId === updated.matchId ? updated : item)),
    )
  } catch (error) {
    actionError.value = formatApiError(error, '调整记录展示失败')
  } finally {
    busyMatchId.value = ''
  }
}

/**
 * 上移 / 下移：按当前列表顺序整体重写权重（越大越靠前），
 * 避免只交换两行的 0 权重导致顺序不生效。
 */
async function move(index: number, delta: number) {
  const target = index + delta
  if (busyMatchId.value || target < 0 || target >= props.records.length) return
  busyMatchId.value = props.records[index]?.matchId ?? ''
  actionError.value = ''
  const next = [...props.records]
  const [item] = next.splice(index, 1)
  if (!item) return
  next.splice(target, 0, item)
  try {
    const updated = await reorderMatchRecords(
      next.map((record, position) => ({
        id: record.matchId,
        displayOrder: (next.length - position) * 10,
      })),
    )
    emit('updated', updated)
  } catch (error) {
    actionError.value = formatApiError(error, '调整记录顺序失败')
  } finally {
    busyMatchId.value = ''
  }
}
</script>

<template>
  <div class="records">
    <div v-if="loading" class="records__empty">正在同步赛事记录…</div>
    <div v-else-if="error" class="records__empty records__empty--err">{{ error }}</div>
    <div v-else-if="records.length === 0" class="records__empty">还没有赛事记录</div>
    <template v-else>
      <p v-if="actionError" class="records__empty records__empty--err">{{ actionError }}</p>
      <ol class="records__list">
        <li
          v-for="(record, index) in records"
          :key="record.matchId"
          :class="{ 'is-hidden': !record.visible }"
        >
          <span class="records__time">{{ timeLabel(record.createdAt) }}</span>
          <span class="records__name">
            <strong>
              {{ record.tournamentName ?? '未命名赛事' }}
              <i v-if="!record.visible" class="records__tag">已隐藏</i>
              <i v-else-if="admin && record.displayOrder > 0" class="records__tag is-order">
                权重 {{ record.displayOrder }}
              </i>
            </strong>
            <em>{{ record.gameId ?? '—' }} · 第 {{ record.roundNo }} 轮</em>
          </span>
          <span class="records__versus">{{ versus(record) }}</span>
          <span class="records__status" :class="{ 'is-live': record.status === 'RUNNING' }">
            {{ statusLabel(record.status) }}
          </span>
          <span v-if="admin" class="records__actions">
            <button type="button" :disabled="Boolean(busyMatchId)" @click="move(index, -1)">
              ↑
            </button>
            <button type="button" :disabled="Boolean(busyMatchId)" @click="move(index, 1)">
              ↓
            </button>
            <button
              type="button"
              class="records__toggle"
              :disabled="Boolean(busyMatchId)"
              @click="toggleVisible(record)"
            >
              {{ record.visible ? '隐藏' : '恢复' }}
            </button>
          </span>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.records {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.records__empty {
  padding: 12px 4px;
  color: var(--fm-text-muted);
  font-size: 10.5px;
}

.records__empty--err {
  color: var(--fm-err);
}

.records__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.records__list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px;
  border-bottom: 1px solid var(--fm-border);
  font-size: 10.5px;
}

.records__list li:last-child {
  border-bottom: 0;
}

.records__list li.is-hidden {
  opacity: 0.55;
}

.records__time {
  flex: none;
  width: 78px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
}

.records__name {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  color: var(--fm-text-dim);
}

.records__name strong {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.records__name em {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.records__tag {
  flex: none;
  padding: 1px 4px;
  border: 1px solid color-mix(in srgb, var(--fm-err) 40%, transparent);
  border-radius: 2px;
  color: var(--fm-err);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  font-style: normal;
}

.records__tag.is-order {
  border-color: color-mix(in srgb, var(--fm-accent) 40%, transparent);
  color: var(--fm-accent);
}

.records__versus {
  flex: none;
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 9.5px;
}

.records__status {
  flex: none;
  width: 48px;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  text-align: right;
}

.records__status.is-live {
  color: var(--fm-warn);
}

.records__actions {
  display: flex;
  flex: none;
  gap: 4px;
}

.records__actions button {
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  cursor: pointer;
}

.records__actions button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--fm-accent) 45%, transparent);
  color: var(--fm-accent);
}

.records__actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.records__toggle {
  min-width: 34px;
}
</style>
