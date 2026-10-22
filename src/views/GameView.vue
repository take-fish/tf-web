<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'
import BreakoutCanvas from '@/modules/games/components/BreakoutCanvas.vue'
import GamePanel from '@/modules/games/components/GamePanel.vue'
import LeaderboardPanel from '@/modules/games/components/LeaderboardPanel.vue'
import MetricChart from '@/modules/games/components/MetricChart.vue'
import { fetchLeaderboard, submitScore } from '@/modules/games/gameApi'
import { GAMES } from '@/modules/games/gameRegistry'
import {
  diskOption,
  heatmapOption,
  latencyOption,
  qpsOption,
  topologyOption,
} from '@/modules/games/lib/chartOptions'
import type { EChartsCoreOption } from 'echarts/core'
import type { LeaderboardEntry } from '@/modules/games/types'

const identity = useIdentityStore()
const skinStore = useSkinStore()

const light = computed(() => skinStore.effectiveSkin === 'swagger')
const labels = ref<string[]>([])
const latencyValues = ref<number[]>([])
const qpsValues = ref<number[]>([])
const diskUsage = ref(58)
const heatmapData = ref<number[][]>([])
const updatedAt = ref(new Date())
const showBreakout = ref(false)
const notice = ref('')

const leaderboard = ref<LeaderboardEntry[]>([])
const leaderboardLoading = ref(false)
const leaderboardError = ref('')
const bestScore = ref(0)
const myRank = ref(0)

let refreshTimer: ReturnType<typeof setInterval> | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined

function createLabels(): string[] {
  const now = Date.now()
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(now - (23 - index) * 5 * 60 * 1000)
    return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
  })
}

function createHeatmap(): number[][] {
  const data: number[][] = []
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const base = 80 + y * 55 + x * 9
      const spike = x > 15 && x < 21 ? 160 : 0
      data.push([x, y, Math.round(base + spike + Math.random() * 90)])
    }
  }
  return data
}

function refreshCharts() {
  latencyValues.value = labels.value.map((_, index) => {
    const base = 180 + Math.sin(index / 2.4) * 45
    const spike = index === 17 ? 1600 : index === 8 ? 700 : 0
    return Math.round(base + spike + Math.random() * 90)
  })
  qpsValues.value = labels.value.map((_, index) => {
    const base = 520 + Math.sin(index / 3) * 160
    const spike = index === 19 ? 620 : index === 5 ? 260 : 0
    return Math.round(base + spike + Math.random() * 120)
  })
  diskUsage.value = Math.round(55 + Math.random() * 18)
  heatmapData.value = createHeatmap()
  updatedAt.value = new Date()
}

const chartOptions = computed<Record<string, EChartsCoreOption>>(() => ({
  'timeseries-runner': latencyOption(labels.value, latencyValues.value, light.value),
  'ring-2048': diskOption(diskUsage.value, light.value),
  'topology-minesweeper': topologyOption(light.value),
  'qps-breakout': qpsOption(labels.value, qpsValues.value, light.value),
  'heatmap-gomoku': heatmapOption(heatmapData.value, light.value),
}))

const updatedLabel = computed(() =>
  updatedAt.value.toLocaleTimeString('zh-CN', { hour12: false }),
)

function panelHeight(gameId: string): number {
  if (gameId === 'timeseries-runner') return 186
  if (gameId === 'ring-2048') return 158
  if (gameId === 'topology-minesweeper') return 184
  if (gameId === 'qps-breakout') return 176
  return 184
}

function showNotice(message: string) {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
  }, 2600)
}

async function loadLeaderboard() {
  leaderboardLoading.value = true
  leaderboardError.value = ''
  try {
    leaderboard.value = await fetchLeaderboard('qps-breakout', 10)
    const own = leaderboard.value.find((entry) => entry.userId === identity.state.userId)
    if (own) {
      bestScore.value = own.score
      myRank.value = own.rank
    }
  } catch (error) {
    leaderboardError.value = formatApiError(error, '排行服务暂不可用')
  } finally {
    leaderboardLoading.value = false
  }
}

async function onGameFinish(score: number) {
  if (!score) return
  try {
    const result = await submitScore({
      gameId: 'qps-breakout',
      userId: identity.state.userId,
      nickname: identity.state.nickname,
      score,
    })
    bestScore.value = result.bestScore
    myRank.value = result.rank
    showNotice(`演练记录已提交：${score} 分 · 当前第 ${result.rank} 名`)
    await loadLeaderboard()
  } catch (error) {
    showNotice(formatApiError(error, '排行服务暂不可用'))
  }
}

function launchGame() {
  showBreakout.value = true
}

onMounted(() => {
  labels.value = createLabels()
  refreshCharts()
  refreshTimer = setInterval(refreshCharts, 2000)
  void loadLeaderboard()
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="games">
    <header class="games__head">
      <div class="games__title">
        <span class="games__logo">G</span>
        <div>
          <div class="games__eyebrow">DASHBOARDS / FISHMATRIX METRICS</div>
          <h1>核心指标概览</h1>
        </div>
      </div>
      <div class="games__toolbar">
        <span class="games__pill">集群: fishmatrix-prod</span>
        <span class="games__pill">实例: dev-node-01</span>
        <span class="games__updated">刷新 {{ updatedLabel }}</span>
        <button class="games__refresh" @click="refreshCharts">
          <AppIcon name="refresh" :size="12" />
          刷新
        </button>
      </div>
    </header>

    <div class="games__grid">
      <div
        v-for="game in GAMES"
        :key="game.id"
        class="games__cell"
        :style="{ gridColumn: `span ${game.span}` }"
      >
        <GamePanel
          :title="game.metricTitle"
          :subtitle="game.name"
          :playable="game.playable"
          :active="showBreakout && game.id === 'qps-breakout'"
          @launch="launchGame"
        >
          <MetricChart
            :option="chartOptions[game.id] ?? latencyOption([], [], light)"
            :height="panelHeight(game.id)"
          />
        </GamePanel>
      </div>
    </div>

    <div class="games__bottom">
      <section class="games__bottom-panel">
        <LeaderboardPanel
          :entries="leaderboard"
          :loading="leaderboardLoading"
          :error="leaderboardError"
          :best-score="bestScore"
          :rank="myRank"
        />
      </section>
      <section class="games__bottom-panel games__tasks">
        <div class="games__tasks-head">
          <span>演练任务</span>
          <em>4 项待接入 · 1 项可执行</em>
        </div>
        <div class="games__task-list">
          <div v-for="game in GAMES" :key="game.id" class="games__task">
            <span class="games__task-dot" :class="{ 'is-playable': game.playable }" />
            <span class="games__task-name">{{ game.name }}</span>
            <span class="games__task-metric">{{ game.metricTitle }}</span>
            <span class="games__task-state">
              {{ game.playable ? '可执行' : '待接入' }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <div v-if="showBreakout" class="games__stage">
      <div class="games__stage-panel">
        <header class="games__stage-head">
          <div>
            <span class="games__eyebrow">DRILL / QPS PEAK SHAVER</span>
            <b>QPS 流量削峰演练</b>
          </div>
          <button class="games__close" @click="showBreakout = false">×</button>
        </header>
        <BreakoutCanvas @finish="onGameFinish" @exit="showBreakout = false" />
      </div>
    </div>

    <div v-if="notice" class="games__notice">{{ notice }}</div>
  </div>
</template>

<style scoped>
.games {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: 16px 18px 22px;
}

.games__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.games__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.games__logo {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(160deg, #ff9830, #f46800);
  color: #23160a;
  font-size: 16px;
  font-weight: 800;
}

.games__eyebrow {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
  letter-spacing: 0.09em;
}

.games__title h1 {
  margin-top: 2px;
  color: var(--fm-text);
  font-size: 18px;
  font-weight: 600;
}

.games__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.games__pill {
  padding: 4px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel);
  color: var(--fm-text-dim);
  font-size: 9.5px;
}

.games__updated {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.games__refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 25px;
  padding: 0 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel);
  color: var(--fm-text-dim);
  font-size: 9.5px;
  cursor: pointer;
}

.games__refresh:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.games__grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px;
}

.games__cell {
  min-width: 0;
}

.games__bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 10px;
}

.games__bottom-panel {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: var(--fm-panel);
}

.games__tasks-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.games__tasks-head span {
  color: var(--fm-text);
  font-size: 12px;
  font-weight: 600;
}

.games__tasks-head em {
  color: var(--fm-text-muted);
  font-size: 9px;
  font-style: normal;
}

.games__task-list {
  display: flex;
  flex-direction: column;
}

.games__task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 2px;
  border-bottom: 1px solid var(--fm-border);
  font-size: 10px;
}

.games__task:last-child {
  border-bottom: 0;
}

.games__task-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--fm-text-muted);
}

.games__task-dot.is-playable {
  background: var(--fm-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fm-ok) 15%, transparent);
}

.games__task-name {
  width: 84px;
  color: var(--fm-text);
}

.games__task-metric {
  flex: 1;
  overflow: hidden;
  color: var(--fm-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.games__task-state {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 8.5px;
}

.games__stage {
  position: fixed;
  inset: 0;
  z-index: 700;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.games__stage-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(1080px, 100%);
  max-height: 92vh;
  padding: 14px 16px 16px;
  overflow-y: auto;
  border: 1px solid var(--fm-border);
  border-radius: 5px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
}

.games__stage-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.games__stage-head b {
  display: block;
  margin-top: 2px;
  color: var(--fm-text);
  font-size: 14px;
}

.games__close {
  width: 26px;
  height: 26px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 15px;
  cursor: pointer;
}

.games__close:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.games__notice {
  position: fixed;
  right: 20px;
  bottom: 44px;
  z-index: 800;
  padding: 8px 12px;
  border: 1px solid var(--fm-accent);
  border-radius: 4px;
  background: var(--fm-panel);
  color: var(--fm-accent);
  font-size: 10.5px;
  box-shadow: var(--fm-shadow);
}

@media (max-width: 1100px) {
  .games__cell {
    grid-column: span 6 !important;
  }

  .games__bottom {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .games__cell {
    grid-column: span 12 !important;
  }

  .games__head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
