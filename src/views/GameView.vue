<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import BreakoutCanvas from '@/modules/games/components/BreakoutCanvas.vue'
import GamePanel from '@/modules/games/components/GamePanel.vue'
import LeaderboardPanel from '@/modules/games/components/LeaderboardPanel.vue'
import MatchWindow from '@/modules/games/components/MatchWindow.vue'
import MetricChart from '@/modules/games/components/MetricChart.vue'
import TournamentBracket from '@/modules/games/components/TournamentBracket.vue'
import { fetchOverallLeaderboard, submitScore } from '@/modules/games/gameApi'
import { GAMES } from '@/modules/games/gameRegistry'
import {
  formatLabel,
  tournamentStatusLabel,
} from '@/modules/games/lib/gameFormat'
import {
  diskOption,
  heatmapOption,
  latencyOption,
  qpsOption,
  topologyOption,
} from '@/modules/games/lib/chartOptions'
import type { EChartsCoreOption } from 'echarts/core'
import type { LeaderboardEntry } from '@/modules/games/types'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'
import { useTournamentStore } from '@/stores/tournament'

const identity = useIdentityStore()
const skinStore = useSkinStore()
const auth = useAuthStore()
const tournamentStore = useTournamentStore()
const route = useRoute()
const router = useRouter()

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
const selectedTournamentId = ref('')

const playableCount = computed(() => GAMES.filter((game) => game.playable).length)
const pendingCount = computed(() => GAMES.length - playableCount.value)
const selectedTournament = computed(() =>
  tournamentStore.tournaments.find(
    (tournament) => tournament.id === selectedTournamentId.value,
  ),
)
const matchVisible = computed(() => Boolean(tournamentStore.currentMatchId))
/** 约战不进入演练入口，只在“一对一”面板中展示。 */
const myDrillMatches = computed(() =>
  tournamentStore.activeMatches.filter((match) => match.kind !== 'DUEL'),
)

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
    leaderboard.value = await fetchOverallLeaderboard(10)
    const own = leaderboard.value.find((entry) => entry.userId === identity.state.userId)
    if (own) {
      bestScore.value = own.points ?? own.score
      myRank.value = own.rank
    } else {
      bestScore.value = 0
      myRank.value = 0
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
    showNotice(`采样记录已提交：${score} · 综合排名 ${result.rank}`)
    await loadLeaderboard()
  } catch (error) {
    showNotice(formatApiError(error, '排行服务暂不可用'))
  }
}

function launchGame(gameId: string) {
  if (gameId === 'heatmap-gomoku') {
    tournamentStore.openLobby()
    return
  }
  showBreakout.value = true
}

function openLobby() {
  tournamentStore.openLobby()
}

function openMatch(matchId: string) {
  if (tournamentStore.currentMatchId === matchId) return
  void router.push({ path: '/games', query: { ...route.query, watch: matchId } })
}

function closeMatch() {
  tournamentStore.leaveWatch()
  const query = { ...route.query }
  delete query.watch
  // 关闭执行窗口后固定回到演练调度台，避免停留在打开窗口前的来源页面
  void router.replace({ path: '/games', query })
}

function selectTournament(id: string) {
  selectedTournamentId.value = id
}

function syncIdentity() {
  if (!auth.user) return
  identity.setAccount(`u${auth.user.id}`, auth.user.nickname)
}

watch(
  () => tournamentStore.tournaments,
  (tournaments) => {
    if (
      selectedTournamentId.value &&
      tournaments.some((tournament) => tournament.id === selectedTournamentId.value)
    ) {
      return
    }
    const preferred =
      tournaments.find((tournament) => tournament.status === 'RUNNING') ?? tournaments[0]
    selectedTournamentId.value = preferred?.id ?? ''
  },
  { deep: true, immediate: true },
)

watch(
  () => route.query.watch,
  (value) => {
    const matchId = typeof value === 'string' ? value : ''
    if (matchId) {
      if (tournamentStore.currentMatchId !== matchId) void tournamentStore.watch(matchId)
      return
    }
    if (tournamentStore.currentMatchId) tournamentStore.leaveWatch()
  },
  { immediate: true },
)

onMounted(() => {
  syncIdentity()
  labels.value = createLabels()
  refreshCharts()
  refreshTimer = setInterval(refreshCharts, 2000)
  void loadLeaderboard()
  void tournamentStore.refreshLobby()
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (noticeTimer) clearTimeout(noticeTimer)
  if (tournamentStore.currentMatchId) tournamentStore.leaveWatch()
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
        <span class="games__pill games__pill--live">
          <span class="games__live-dot" :class="{ 'is-online': tournamentStore.connected }" />
          {{ tournamentStore.connected ? '调度通道在线' : '调度通道离线' }}
        </span>
        <span class="games__pill">集群: fishmatrix-prod</span>
        <span class="games__pill">实例: dev-node-01</span>
        <span class="games__updated">刷新 {{ updatedLabel }}</span>
        <button class="games__connect" @click="openLobby">
          <AppIcon name="plus" :size="12" />
          调度台
          <em v-if="tournamentStore.pendingInvitationCount > 0">
            {{ tournamentStore.pendingInvitationCount }}
          </em>
        </button>
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
          :active="
            (showBreakout && game.id === 'qps-breakout') ||
            (tournamentStore.lobbyOpen && game.id === 'heatmap-gomoku')
          "
          :action-label="game.id === 'heatmap-gomoku' ? '进入演练' : '启动采样'"
          @launch="launchGame(game.id)"
        >
          <MetricChart
            :option="chartOptions[game.id] ?? latencyOption([], [], light)"
            :height="panelHeight(game.id)"
          />
        </GamePanel>
      </div>
    </div>

    <section v-if="myDrillMatches.length" class="games__my-match">
      <span class="games__my-match-icon">T</span>
      <div>
        <b>你有正在进行的演练</b>
        <span>
          {{
            myDrillMatches
              .map(
                (match) =>
                  `${match.player1Nickname || match.player1UserId} vs ${match.player2Nickname || match.player2UserId}`,
              )
              .join(' · ')
          }}
        </span>
      </div>
      <button
        type="button"
        class="games__refresh games__connect"
        @click="openMatch(myDrillMatches[0]!.id)"
      >
        进入演练
      </button>
    </section>

    <section class="games__tourneys">
      <header class="games__tourneys-head">
        <div class="games__tourneys-title">
          <span class="games__tourneys-mark">T</span>
          <div>
            <b>联调演练调度</b>
            <span>创建演练 · 邀请在线成员 · 轮次策略 · 查看与回放</span>
          </div>
        </div>
        <div class="games__tourneys-actions">
          <span class="games__tourneys-count">
            {{ tournamentStore.tournaments.length }} 个演练
            <template v-if="tournamentStore.pendingInvitationCount > 0">
              · {{ tournamentStore.pendingInvitationCount }} 个邀请待处理
            </template>
          </span>
          <button type="button" class="games__refresh" @click="tournamentStore.refreshLobby()">
            <AppIcon name="refresh" :size="12" />
            刷新演练
          </button>
          <button type="button" class="games__connect" @click="openLobby">
            <AppIcon name="plus" :size="12" />
            调度台
          </button>
        </div>
      </header>

      <div v-if="tournamentStore.lobbyLoading && tournamentStore.tournaments.length === 0" class="games__tourneys-empty">
        正在载入演练…
      </div>
      <div v-else-if="tournamentStore.tournaments.length === 0" class="games__tourneys-empty">
        <p>还没有联调演练。点击“调度台”选择在线成员，按 BO1 / BO3 / BO5 轮次策略创建。</p>
        <p>2/4/8/16 人自动生成分组推进；其他人数先循环计分，再进行收尾轮。</p>
        <button type="button" class="games__connect" @click="openLobby">创建第一场演练</button>
      </div>
      <template v-else>
        <div class="games__tournament-tabs">
          <button
            v-for="tournament in tournamentStore.tournaments"
            :key="tournament.id"
            type="button"
            class="games__tournament-tab"
            :class="{ 'is-active': selectedTournamentId === tournament.id }"
            @click="selectTournament(tournament.id)"
          >
            <span class="games__tournament-name">{{ tournament.name }}</span>
            <em>{{ tournamentStatusLabel(tournament.status) }}</em>
            <span>{{ formatLabel(tournament.format).split(' · ')[0] }}</span>
            <span>{{ tournament.players.filter((player) => player.status === 'ACCEPTED').length }}/{{ tournament.targetPlayers }}</span>
          </button>
        </div>
        <TournamentBracket
          v-if="selectedTournament"
          :tournament="selectedTournament"
          :self-user-id="tournamentStore.ownUserId"
          @watch="openMatch"
        />
      </template>
    </section>

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
          <em>{{ pendingCount }} 项待接入 · {{ playableCount }} 项可执行</em>
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

    <MatchWindow v-if="matchVisible" @close="closeMatch" />

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
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 36%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 13px;
  font-weight: 600;
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

.games__connect {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 25px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 55%, transparent);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-accent) 12%, transparent);
  color: var(--fm-accent);
  font-size: 9.5px;
  font-weight: 600;
  cursor: pointer;
}

.games__connect:hover {
  background: color-mix(in srgb, var(--fm-accent) 22%, transparent);
}

.games__connect em {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--fm-err);
  color: #fff;
  font-size: 8px;
  font-style: normal;
  line-height: 14px;
  text-align: center;
}

.games__pill--live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.games__live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--fm-text-muted);
}

.games__live-dot.is-online {
  background: var(--fm-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fm-ok) 16%, transparent);
}

.games__my-match {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 26%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel);
}

.games__my-match-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 36%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 11px;
  font-weight: 600;
}

.games__my-match > div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.games__my-match b {
  color: var(--fm-text);
  font-size: 11px;
}

.games__my-match span {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.games__tourneys {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: var(--fm-panel);
}

.games__tourneys-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.games__tourneys-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.games__tourneys-mark {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 32%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 10px;
  font-weight: 600;
}

.games__tourneys-title > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.games__tourneys-title b {
  color: var(--fm-text);
  font-size: 12px;
}

.games__tourneys-title span {
  color: var(--fm-text-muted);
  font-size: 8.5px;
}

.games__tourneys-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.games__tourneys-count {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
}

.games__tourneys-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 12px;
  border: 1px dashed var(--fm-border);
  border-radius: 3px;
  color: var(--fm-text-muted);
  font-size: 10px;
}

.games__tourneys-empty p {
  margin: 0;
  line-height: 1.6;
}

.games__tournaments-tabs,
.games__tournament-tabs {
  display: flex;
  gap: 6px;
  padding-bottom: 2px;
  overflow-x: auto;
}

.games__tournament-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  height: 27px;
  padding: 0 10px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  cursor: pointer;
}

.games__tournament-tab:hover {
  border-color: color-mix(in srgb, var(--fm-accent) 45%, transparent);
  color: var(--fm-text-dim);
}

.games__tournament-tab.is-active {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 12%, transparent);
  color: var(--fm-text);
}

.games__tournament-name {
  font-weight: 600;
}

.games__tournament-tab em {
  padding: 0 4px;
  border-radius: 2px;
  background: var(--fm-panel-2, rgba(255, 255, 255, 0.06));
  color: var(--fm-text-muted);
  font-size: 8px;
  font-style: normal;
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
