<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import BreakoutCanvas from '@/modules/games/components/BreakoutCanvas.vue'
import ExerciseLobby from '@/modules/games/components/ExerciseLobby.vue'
import GamePanel from '@/modules/games/components/GamePanel.vue'
import LeaderboardPanel from '@/modules/games/components/LeaderboardPanel.vue'
import MatchWindow from '@/modules/games/components/MatchWindow.vue'
import MetricChart from '@/modules/games/components/MetricChart.vue'
import TournamentBracket from '@/modules/games/components/TournamentBracket.vue'
import { fetchOverallLeaderboard, submitScore } from '@/modules/games/gameApi'
import { GAMES } from '@/modules/games/gameRegistry'
import { ARENA_SCRIPTS } from '@/modules/games/lib/arenaScripts'
import {
  formatLabel,
  modeShortLabel,
  tournamentStatusLabel,
  tournamentTypeLabel,
} from '@/modules/games/lib/gameFormat'
import {
  diskOption,
  heatmapOption,
  latencyOption,
  qpsOption,
  topologyOption,
} from '@/modules/games/lib/chartOptions'
import type { EChartsCoreOption } from 'echarts/core'
import type { ArenaGameId, LeaderboardEntry } from '@/types/games'
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
  'blind-xiangqi': heatmapOption(heatmapData.value, light.value),
}))

const updatedLabel = computed(() =>
  updatedAt.value.toLocaleTimeString('zh-CN', { hour12: false }),
)

function panelHeight(gameId: string): number {
  if (gameId === 'timeseries-runner') return 186
  if (gameId === 'ring-2048') return 158
  if (gameId === 'topology-minesweeper') return 184
  if (gameId === 'qps-breakout') return 176
  if (gameId === 'blind-xiangqi') return 184
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
    // 冠军榜只由赛事冠亚军结算，采样小游戏不再写入总积分。
    leaderboard.value = await fetchOverallLeaderboard(10)
  } catch (error) {
    leaderboardError.value = formatApiError(error, '排行服务暂不可用')
  } finally {
    leaderboardLoading.value = false
  }
}

async function onGameFinish(score: number) {
  if (!score) return
  try {
    await submitScore({
      gameId: 'qps-breakout',
      userId: identity.state.userId,
      nickname: identity.state.nickname,
      score,
    })
    showNotice(`采样记录已提交：${score} · 不计入冠军榜`)
    await loadLeaderboard()
  } catch (error) {
    showNotice(formatApiError(error, '排行服务暂不可用'))
  }
}

function launchGame(gameId: string) {
  const game = GAMES.find((entry) => entry.id === gameId)
  if (game?.scriptId) {
    tournamentStore.openLobby(game.scriptId)
    return
  }
  if (gameId === 'blind-xiangqi') {
    tournamentStore.openLobby('blind-xiangqi')
    return
  }
  if (gameId === 'qps-breakout') showBreakout.value = true
}

function launchScript(scriptId: ArenaGameId) {
  if (scriptId === 'cluster-patrol-arena') {
    tournamentStore.closeLobby()
    tournamentStore.openExerciseLobby()
    return
  }
  tournamentStore.openLobby(scriptId)
}

function openLobby() {
  tournamentStore.openLobby()
}

/** 游戏卡片/剧本卡片进入调度台时，对应锦标赛剧本高亮。 */
function championshipSelected(gameId: string | undefined): boolean {
  return (
    tournamentStore.lobbyOpen &&
    tournamentStore.lobbyMode === 'CHAMPIONSHIP' &&
    Boolean(gameId) &&
    tournamentStore.lobbyPreferredGameId === gameId
  )
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
  () => tournamentStore.lastResult,
  (result) => {
    if (result) void loadLeaderboard()
  },
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

    <section class="games__scripts" aria-label="演练剧本">
      <button
        v-for="script in ARENA_SCRIPTS"
        :key="script.id"
        type="button"
        class="games__script"
        :class="{
          'is-active':
            script.id === 'cluster-patrol-arena'
              ? tournamentStore.exerciseOpen
              : championshipSelected(script.id),
        }"
        @click="launchScript(script.id)"
      >
        <span class="games__script-tag">{{ script.tag }}</span>
        <span class="games__script-main">
          <b>{{ script.name }}</b>
          <em>{{ script.description }}</em>
        </span>
        <span class="games__script-duration">{{ script.duration }}</span>
      </button>
    </section>

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
            championshipSelected(
              game.id === 'blind-xiangqi' ? 'blind-xiangqi' : game.scriptId,
            )
          "
          :action-label="
            game.id === 'heatmap-gomoku'
              ? '进入演练'
              : game.id === 'blind-xiangqi'
                ? '进入盲棋'
                : '启动采样'
          "
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
                  `${modeShortLabel(match.gameId, match.blindLayout)} · ` +
                  `${match.player1Nickname || match.player1UserId} vs ` +
                  `${match.player2Nickname || match.player2UserId}`,
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
            <span>S赛随机抽签 · 锦标赛剧本专精 · 邀请在线成员 · 查看与回放</span>
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
        <p>
          还没有联调演练。点击“调度台”选择 S赛或锦标赛、邀请在线成员，按 BO1 / BO3 / BO5
          轮次策略创建。
        </p>
        <p>2/4/8/16 人随机单败；其他人数先循环/瑞士排位，前四进入页面淘汰（三打四、胜者打二、决赛打一）。</p>
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
            <span
              class="games__tournament-type"
              :class="{ 'is-series': tournament.gameId === 'random' }"
            >
              {{ tournamentTypeLabel(tournament.gameId) }}
            </span>
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

    <ExerciseLobby v-if="tournamentStore.exerciseOpen" />

    <MatchWindow v-if="matchVisible" @close="closeMatch" />

    <div v-if="notice" class="games__notice">{{ notice }}</div>
  </div>
</template>

<style scoped src="./game-view.css"></style>
