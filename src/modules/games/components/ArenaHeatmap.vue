<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { GameArenaAction, HeatmapCell, HeatmapState } from '../types'

const props = defineProps<{
  state: HeatmapState
  selfUserId: string
  playerNames: Record<string, string>
  interactive: boolean
}>()

const emit = defineEmits<{ action: [action: GameArenaAction] }>()

type HeatmapActionType = 'CLAIM' | 'RAID' | 'FORTIFY'
type HeatmapSkill = 'sweep' | 'reinforce' | 'burst'

const SKILLS: { id: HeatmapSkill; label: string; cost: number; cooldown: number; hint: string }[] = [
  { id: 'sweep', label: '批量巡检', cost: 30, cooldown: 20, hint: '3×3 范围内认领中立格、削弱对方格' },
  { id: 'reinforce', label: '基线加固', cost: 25, cooldown: 20, hint: '3×3 范围内己方格 +2 HP' },
  { id: 'burst', label: '定向深挖', cost: 40, cooldown: 30, hint: '直接夺取一个对方格子' },
]

const now = ref(Date.now())
const selectedIndex = ref<number | null>(null)
let clockTimer: ReturnType<typeof setInterval> | undefined

const selfId = computed(() => props.selfUserId)
const opponentId = computed(
  () => props.state.players.find((player) => player !== selfId.value) ?? '',
)
const remaining = computed(() =>
  Math.max(0, Math.ceil((props.state.endsAt - now.value) / 1000)),
)
const selfEnergy = computed(() => Math.floor(props.state.energy[selfId.value] ?? 0))
const opponentEnergy = computed(() => Math.floor(props.state.energy[opponentId.value] ?? 0))
const selfScore = computed(() => Math.floor(props.state.scores[selfId.value] ?? 0))
const opponentScore = computed(() => Math.floor(props.state.scores[opponentId.value] ?? 0))
const selectedCell = computed<HeatmapCell | null>(() => {
  if (selectedIndex.value == null) return null
  return props.state.cells[selectedIndex.value] ?? null
})
const cellSize = computed(() => {
  const cols = props.state.cols || 12
  return `repeat(${cols}, minmax(0, 1fr))`
})

function nameOf(userId: string | null): string {
  if (!userId) return '中立'
  return props.playerNames[userId] ?? userId
}

function cellClass(cell: HeatmapCell): Record<string, boolean> {
  return {
    'is-selected': selectedIndex.value === cell.index,
    'is-self': cell.owner === selfId.value,
    'is-peer': Boolean(cell.owner) && cell.owner !== selfId.value,
    'is-neutral': !cell.owner,
  }
}

function heatValue(cell: HeatmapCell): number {
  return Math.max(1, Math.min(3, cell.heat))
}

function selfProgress(cell: HeatmapCell): number {
  return cell.progress[selfId.value] ?? 0
}

function selectCell(cell: HeatmapCell) {
  selectedIndex.value = selectedIndex.value === cell.index ? null : cell.index
}

function canClaim(): boolean {
  return Boolean(props.interactive && selectedCell.value && !selectedCell.value.owner)
}

function canRaid(): boolean {
  const cell = selectedCell.value
  return Boolean(
    props.interactive && cell && cell.owner && cell.owner !== selfId.value,
  )
}

function canFortify(): boolean {
  const cell = selectedCell.value
  return Boolean(
    props.interactive && cell && cell.owner === selfId.value && cell.hp < 6,
  )
}

function cooldownLeft(skill: HeatmapSkill): number {
  const readyAt = props.state.cooldowns[`${selfId.value}|${skill}`] ?? 0
  return Math.max(0, Math.ceil((readyAt - now.value) / 1000))
}

function canCast(skill: HeatmapSkill): boolean {
  const definition = SKILLS.find((item) => item.id === skill)
  if (!props.interactive || !selectedCell.value || !definition) return false
  return (
    cooldownLeft(skill) === 0 && selfEnergy.value >= definition.cost
  )
}

function act(type: HeatmapActionType) {
  if (!selectedCell.value || !props.interactive) return
  emit('action', { action: type, cell: selectedCell.value.index })
}

function cast(skill: HeatmapSkill) {
  if (!selectedCell.value || !props.interactive) return
  emit('action', { action: 'SKILL', skill, cell: selectedCell.value.index })
}

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 500)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <section class="heatmap" aria-label="日志热点排查竞赛">
    <header class="heatmap__hud">
      <div class="heatmap__side" :class="{ 'is-self': true }">
        <span class="heatmap__side-name">{{ nameOf(selfId) }} · 你</span>
        <span class="heatmap__side-score">{{ selfScore }}</span>
        <span class="heatmap__side-meta">排查积分 · 配额 {{ selfEnergy }}</span>
      </div>
      <div class="heatmap__clock">
        <span class="heatmap__clock-label">REMAINING</span>
        <b :class="{ 'is-danger': remaining <= 20 }">
          {{ Math.floor(remaining / 60) }}:{{ String(remaining % 60).padStart(2, '0') }}
        </b>
        <span class="heatmap__clock-sub">热区每 30 秒漂移</span>
      </div>
      <div class="heatmap__side heatmap__side--right">
        <span class="heatmap__side-name">{{ nameOf(opponentId) }}</span>
        <span class="heatmap__side-score">{{ opponentScore }}</span>
        <span class="heatmap__side-meta">排查积分 · 配额 {{ opponentEnergy }}</span>
      </div>
    </header>

    <div class="heatmap__body">
      <div class="heatmap__grid-wrap">
        <div class="heatmap__grid" :style="{ gridTemplateColumns: cellSize }">
          <button
            v-for="cell in state.cells"
            :key="cell.index"
            type="button"
            class="heatmap__cell"
            :class="[cellClass(cell), `is-heat-${heatValue(cell)}`]"
            :title="`#${cell.index} · 热度 ${cell.heat} · ${nameOf(cell.owner)}`"
            @click="selectCell(cell)"
          >
            <span class="heatmap__cell-index">{{ cell.index }}</span>
            <span v-if="cell.owner" class="heatmap__cell-hp">HP {{ cell.hp }}</span>
            <span
              v-else-if="selfProgress(cell) > 0"
              class="heatmap__cell-progress"
              :style="{ width: `${selfProgress(cell)}%` }"
            />
            <span v-if="cell.owner" class="heatmap__cell-owner">
              {{ cell.owner === selfId ? '己' : '对' }}
            </span>
          </button>
        </div>
        <div class="heatmap__legend">
          <span><i class="is-heat-1" />低热</span>
          <span><i class="is-heat-2" />中热</span>
          <span><i class="is-heat-3" />高热</span>
          <span><i class="is-self" />你的排查</span>
          <span><i class="is-peer" />对方排查</span>
        </div>
      </div>

      <aside class="heatmap__panel">
        <div class="heatmap__panel-head">
          <span>排查操作</span>
          <em v-if="selectedCell">#{{ selectedCell.index }} · 热度 {{ selectedCell.heat }}</em>
          <em v-else>先选择一个格子</em>
        </div>

        <div class="heatmap__selection">
          <template v-if="selectedCell">
            <span>
              归属：<b>{{ nameOf(selectedCell.owner) }}</b>
              <template v-if="selectedCell.owner"> · HP {{ selectedCell.hp }}</template>
              <template v-else> · 我方进度 {{ selfProgress(selectedCell) }}%</template>
            </span>
            <span v-if="!selectedCell.owner" class="heatmap__selection-hint">
              认领两次完成标记；复核三次推翻归属
            </span>
          </template>
          <span v-else class="heatmap__selection-hint">
            中立格可认领，对方格可复核，己方格可固化
          </span>
        </div>

        <div class="heatmap__actions">
          <button type="button" :disabled="!canClaim()" @click="act('CLAIM')">
            认领
            <em>+50%</em>
          </button>
          <button type="button" :disabled="!canRaid()" @click="act('RAID')">
            复核
            <em>-1 HP</em>
          </button>
          <button type="button" :disabled="!canFortify()" @click="act('FORTIFY')">
            固化
            <em>8 配额</em>
          </button>
        </div>

        <div class="heatmap__skills">
          <button
            v-for="skill in SKILLS"
            :key="skill.id"
            type="button"
            class="heatmap__skill"
            :disabled="!canCast(skill.id)"
            :title="skill.hint"
            @click="cast(skill.id)"
          >
            <b>{{ skill.label }}</b>
            <span>{{ skill.cost }} 配额</span>
            <em v-if="cooldownLeft(skill.id) > 0">冷却 {{ cooldownLeft(skill.id) }}s</em>
            <em v-else-if="selfEnergy < skill.cost">配额不足</em>
            <em v-else>{{ skill.cooldown }}s 冷却</em>
          </button>
        </div>

        <div class="heatmap__feed">
          <div class="heatmap__feed-head">
            <span>实时事件</span>
            <em>{{ state.seq }} 帧</em>
          </div>
          <ul>
            <li v-for="(event, index) in state.events.slice(-7).reverse()" :key="`${event.at}-${index}`">
              <b>{{ clock(event.at) }}</b>
              <span>{{ event.text }}</span>
            </li>
            <li v-if="state.events.length === 0" class="is-empty">等待第一条排查记录</li>
          </ul>
        </div>
      </aside>
    </div>

    <footer v-if="state.finished" class="heatmap__result">
      <b>{{ state.winnerUserId ? nameOf(state.winnerUserId) : '平局' }}</b>
      <span>{{ state.finishReason || '排查结束' }}</span>
      <em>{{ selfScore }} : {{ opponentScore }}</em>
    </footer>
  </section>
</template>

<style scoped>
.heatmap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.heatmap__hud {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 40%, transparent);
}

.heatmap__side {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.heatmap__side--right {
  align-items: flex-end;
  text-align: right;
}

.heatmap__side-name {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 9.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heatmap__side-score {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 17px;
  line-height: 1.1;
}

.heatmap__side.is-self .heatmap__side-score {
  color: #48bfae;
}

.heatmap__side-meta {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.heatmap__clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.heatmap__clock-label {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  letter-spacing: 0.12em;
}

.heatmap__clock b {
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 18px;
  font-weight: 600;
}

.heatmap__clock b.is-danger {
  color: var(--fm-err);
  animation: heatmap-clock 1s ease-in-out infinite;
}

@keyframes heatmap-clock {
  50% {
    opacity: 0.4;
  }
}

.heatmap__clock-sub {
  color: var(--fm-text-muted);
  font-size: 7.5px;
}

.heatmap__body {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 1fr);
  gap: 10px;
  min-height: 0;
}

.heatmap__grid-wrap {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.heatmap__grid {
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 55%, transparent);
}

.heatmap__cell {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-border) 80%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, #2a6f8f 12%, transparent);
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  cursor: pointer;
}

.heatmap__cell.is-heat-1 {
  background: color-mix(in srgb, #2a6f8f 10%, transparent);
}

.heatmap__cell.is-heat-2 {
  background: color-mix(in srgb, #c98a2e 16%, transparent);
  color: color-mix(in srgb, var(--fm-warn) 70%, var(--fm-text-muted));
}

.heatmap__cell.is-heat-3 {
  background: color-mix(in srgb, #d9534f 22%, transparent);
  color: color-mix(in srgb, var(--fm-err) 65%, var(--fm-text-muted));
}

.heatmap__cell.is-self {
  border-color: color-mix(in srgb, #48bfae 65%, transparent);
  background: color-mix(in srgb, #48bfae 24%, transparent);
  color: #9fe8dd;
}

.heatmap__cell.is-peer {
  border-color: color-mix(in srgb, #6f9fec 65%, transparent);
  background: color-mix(in srgb, #6f9fec 24%, transparent);
  color: #b4ccf5;
}

.heatmap__cell.is-selected {
  outline: 2px solid var(--fm-accent);
  outline-offset: 1px;
}

.heatmap__cell-index {
  position: absolute;
  top: 1px;
  left: 3px;
  opacity: 0.55;
}

.heatmap__cell-hp {
  font-size: 8px;
}

.heatmap__cell-owner {
  position: absolute;
  right: 3px;
  bottom: 1px;
  font-size: 7px;
}

.heatmap__cell-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: #48bfae;
}

.heatmap__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  color: var(--fm-text-muted);
  font-size: 7.5px;
}

.heatmap__legend span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.heatmap__legend i {
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: color-mix(in srgb, #2a6f8f 30%, transparent);
}

.heatmap__legend i.is-heat-2 {
  background: color-mix(in srgb, #c98a2e 40%, transparent);
}

.heatmap__legend i.is-heat-3 {
  background: color-mix(in srgb, #d9534f 45%, transparent);
}

.heatmap__legend i.is-self {
  background: #48bfae;
}

.heatmap__legend i.is-peer {
  background: #6f9fec;
}

.heatmap__panel {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 35%, transparent);
}

.heatmap__panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.heatmap__panel-head span {
  color: var(--fm-text);
  font-size: 10px;
  font-weight: 600;
}

.heatmap__panel-head em {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  font-style: normal;
}

.heatmap__selection {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 30px;
  padding: 5px 7px;
  border: 1px dashed var(--fm-border);
  border-radius: 3px;
  color: var(--fm-text-dim);
  font-size: 8.5px;
}

.heatmap__selection b {
  color: var(--fm-text);
  font-weight: 500;
}

.heatmap__selection-hint {
  color: var(--fm-text-muted);
  font-size: 7.5px;
}

.heatmap__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.heatmap__actions button,
.heatmap__skill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 4px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9px;
  cursor: pointer;
}

.heatmap__actions button:hover:not(:disabled),
.heatmap__skill:hover:not(:disabled) {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.heatmap__actions button:disabled,
.heatmap__skill:disabled {
  opacity: 0.4;
  cursor: default;
}

.heatmap__actions em,
.heatmap__skill em,
.heatmap__skill span {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  font-style: normal;
}

.heatmap__skills {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.heatmap__skill b {
  font-size: 8.5px;
  font-weight: 500;
}

.heatmap__feed {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-height: 70px;
  overflow: hidden;
}

.heatmap__feed-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: var(--fm-text-dim);
  font-size: 8.5px;
}

.heatmap__feed-head em {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  font-style: normal;
}

.heatmap__feed ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.heatmap__feed li {
  display: flex;
  gap: 5px;
  color: var(--fm-text-muted);
  font-size: 7.5px;
  line-height: 1.45;
}

.heatmap__feed li b {
  flex: none;
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 7px;
  font-weight: 400;
}

.heatmap__feed li.is-empty {
  justify-content: center;
  color: var(--fm-text-muted);
}

.heatmap__result {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, var(--fm-ok) 38%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-ok) 6%, transparent);
  color: var(--fm-text-dim);
  font-size: 9px;
}

.heatmap__result b {
  color: var(--fm-ok);
}

.heatmap__result em {
  margin-left: auto;
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-style: normal;
}

@media (max-width: 980px) {
  .heatmap__body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .heatmap__hud {
    grid-template-columns: minmax(0, 1fr) 90px minmax(0, 1fr);
  }

  .heatmap__grid {
    gap: 2px;
    padding: 4px;
  }

  .heatmap__cell {
    font-size: 6px;
  }
}
</style>
