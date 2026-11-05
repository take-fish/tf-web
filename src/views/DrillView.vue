<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AnnotationTray from '@/modules/drill/components/AnnotationTray.vue'
import BattleArena from '@/modules/drill/components/BattleArena.vue'
import CommandBar from '@/modules/drill/components/CommandBar.vue'
import ConfirmDialog from '@/modules/drill/components/ConfirmDialog.vue'
import DraftCarousel from '@/modules/drill/components/DraftCarousel.vue'
import DrillChat from '@/modules/drill/components/DrillChat.vue'
import DrillHeader from '@/modules/drill/components/DrillHeader.vue'
import DrillStage from '@/modules/drill/components/DrillStage.vue'
import KnockoutBoard from '@/modules/drill/components/KnockoutBoard.vue'
import LineupPanel from '@/modules/drill/components/LineupPanel.vue'
import NamingBoard from '@/modules/drill/components/NamingBoard.vue'
import ProposalModal from '@/modules/drill/components/ProposalModal.vue'
import ReportModal from '@/modules/drill/components/ReportModal.vue'
import ResourceBar from '@/modules/drill/components/ResourceBar.vue'
import RoundMatchups from '@/modules/drill/components/RoundMatchups.vue'
import DrillStandings from '@/modules/drill/components/DrillStandings.vue'
import RosterPanel from '@/modules/drill/components/RosterPanel.vue'
import StageTrack from '@/modules/drill/components/StageTrack.vue'
import TraitPanel from '@/modules/drill/components/TraitPanel.vue'
import UnitDrawer from '@/modules/drill/components/UnitDrawer.vue'
import { BLOOD_TIDE_ROUND } from '@/modules/drill/core/engine'
import type { GameState } from '@/modules/drill/core/state'
import { useDrillStore } from '@/modules/drill/stores/drill'
import { useDrillKnockoutStore } from '@/modules/drill/stores/knockout'
import { useDrillRoomStore } from '@/modules/drill/stores/room'
import { useLineupStore } from '@/modules/drill/stores/lineup'
import { useDrillUiStore } from '@/modules/drill/stores/ui'
import { fetchMatch, reportMatchDrill } from '@/modules/games/gameApi'
import { formatDuration } from '@/modules/games/lib/gameFormat'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const drill = useDrillStore()
const room = useDrillRoomStore()
const knockout = useDrillKnockoutStore()
const ui = useDrillUiStore()
const lineup = useLineupStore()
const auth = useAuthStore()

const roomMode = computed(() => room.active)
const queryRoom = typeof route.query.room === 'string' ? route.query.room : ''
const queryMatch = typeof route.query.match === 'string' ? route.query.match : ''
const selfUserId = computed(() => (auth.user ? `u${auth.user.id}` : ''))

const battleActive = ref(false)
const progress = ref(0)
const confirmOpen = ref(false)
const restartOpen = ref(false)
const knockoutOpen = ref(false)
const knockoutContext = ref<{ matchId: string; game: number } | null>(null)
/** 淘汰赛局间带入的上一局终态：等级/经验/配额/阵容/装备/强化 */
const knockoutCarry = ref<GameState | null>(null)
const knockoutEntered = ref(false)
const knockoutPrepEndsAt = ref(0)

const KO_CARRY_PREFIX = 'fm.drill.knockout.carry.'

function knockoutCarryKey(): string {
  return room.roomId ? `${KO_CARRY_PREFIX}${room.roomId}` : ''
}

function saveKnockoutCarry(state: GameState | null) {
  const key = knockoutCarryKey()
  if (!key || !state) return
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    // 存储满或被禁用时退回内存带入
  }
}

function loadKnockoutCarry(): GameState | null {
  const key = knockoutCarryKey()
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as GameState) : null
  } catch {
    return null
  }
}

function clearKnockoutCarry() {
  const key = knockoutCarryKey()
  if (!key) return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** 调度台锦标赛小局：同一 seed 的 8 人同局，双方各自演练并上报一轮战绩。 */
const matchDrillContext = ref<{
  matchId: string
  gameNo: number
  seed: number
  deadlineAt: number
} | null>(null)
const matchDrillSubmitted = ref(false)
const matchDrillBusy = ref(false)
const matchDrillError = ref('')
const matchDrillSettled = ref(false)
const matchDrillFinished = ref(false)
const matchDrillOpponentDone = ref(false)
const matchDrillReport = ref<{
  wins: number
  losses: number
  draws: number
  sli: number
  survivors: number
} | null>(null)
const matchNow = ref(Date.now())
const matchDrillLeft = computed(() => {
  const deadline = matchDrillContext.value?.deadlineAt ?? 0
  if (!deadline) return 0
  return Math.max(0, Math.ceil((deadline - matchNow.value) / 1000))
})

const MATCH_CARRY_PREFIX = 'fm.drill.match.carry.'
let matchPollTimer: number | undefined

function matchCarryKey(matchId: string): string {
  return `${MATCH_CARRY_PREFIX}${matchId}`
}

/** 局间成长要跨标签页保留，所以放 localStorage 而不是 sessionStorage。 */
function loadMatchCarry(matchId: string): GameState | null {
  try {
    const raw = localStorage.getItem(matchCarryKey(matchId))
    return raw ? (JSON.parse(raw) as GameState) : null
  } catch {
    return null
  }
}

function saveMatchCarry(matchId: string, state: GameState) {
  try {
    localStorage.setItem(matchCarryKey(matchId), JSON.stringify(state))
  } catch {
    // 存储满或被禁用时本局不带入成长
  }
}

function clearMatchCarry(matchId: string) {
  try {
    localStorage.removeItem(matchCarryKey(matchId))
  } catch {
    // ignore
  }
}

function stopMatchPolling() {
  if (matchPollTimer) window.clearInterval(matchPollTimer)
  matchPollTimer = undefined
}

function startMatchPolling() {
  stopMatchPolling()
  matchPollTimer = window.setInterval(() => void syncMatchDrill(), 3000)
}

/** 轮询小局状态：刷新对手是否提交，结算或比赛结束后收口。 */
async function syncMatchDrill() {
  const context = matchDrillContext.value
  if (!context || matchDrillSettled.value) return
  try {
    const value = await fetchMatch(context.matchId)
    const round = value.currentRound
    if (round?.drill && selfUserId.value) {
      matchDrillOpponentDone.value = round.drill.reportedUserIds.some(
        (userId) => userId !== selfUserId.value,
      )
    }
    if (value.status === 'FINISHED') {
      matchDrillFinished.value = true
      matchDrillSettled.value = true
      stopMatchPolling()
      clearMatchCarry(context.matchId)
      return
    }
    if (!round || round.gameNo !== context.gameNo || round.status !== 'RUNNING') {
      matchDrillSettled.value = true
      stopMatchPolling()
      ui.notify('本局已结算，回调度台查看比分与下一局')
    }
  } catch {
    // 网络抖动时保留本地状态，下一次轮询再试
  }
}

/** 从对局窗口带 ?match= 进入：校验参赛者与小局，再按服务端 seed 开一局。 */
async function enterMatchDrill(matchId: string) {
  matchDrillError.value = ''
  try {
    const value = await fetchMatch(matchId)
    const round = value.currentRound
    const self = selfUserId.value
    const isPlayer =
      Boolean(self) && (value.player1UserId === self || value.player2UserId === self)
    if (!round || round.gameId !== 'capacity-drill' || !round.drill) {
      ui.notify('当前小局不是容量编排演练')
      void router.replace('/games')
      return
    }
    if (!isPlayer) {
      ui.notify('只有参赛者可以进入本局演练工作区')
      void router.replace('/games')
      return
    }
    matchDrillContext.value = {
      matchId,
      gameNo: round.gameNo,
      seed: round.drill.seed,
      deadlineAt: round.drill.deadlineAt,
    }
    if (value.status !== 'RUNNING' || round.status !== 'RUNNING') {
      matchDrillSubmitted.value = round.drill.reportedUserIds.includes(self)
      matchDrillFinished.value = value.status === 'FINISHED'
      matchDrillSettled.value = true
      if (matchDrillFinished.value) clearMatchCarry(matchId)
      return
    }
    if (round.drill.reportedUserIds.includes(self)) {
      // 已上报过：只展示等待结算，不再重开一局
      matchDrillSubmitted.value = true
      startMatchPolling()
      return
    }
    drill.startKnockoutMatch(round.drill.seed, 1, loadMatchCarry(matchId) ?? undefined)
    // 快照可能本来就是锦标赛模式，watch 不一定触发；显式开一次 35 秒备战。
    startPrep()
    room.setLocalRound(drill.snapshot.round)
    startMatchPolling()
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '加载对局失败')
    void router.replace('/games')
  }
}

/** 本轮打完：先把战绩报给调度台，成功后落盘成长，等待对手提交。 */
async function finishMatchDrill() {
  const context = matchDrillContext.value
  if (!context || matchDrillSubmitted.value || matchDrillBusy.value) return
  const snapshot = drill.snapshot
  const report = {
    gameNo: context.gameNo,
    wins: snapshot.record.wins,
    losses: snapshot.record.losses,
    draws: snapshot.record.draws,
    sli: snapshot.sli,
    survivors: snapshot.units.length,
  }
  matchDrillReport.value = report
  matchDrillBusy.value = true
  matchDrillError.value = ''
  try {
    const updated = await reportMatchDrill(context.matchId, report)
    const current = updated.currentRound
    const stillRunning =
      updated.status === 'RUNNING' &&
      current?.status === 'RUNNING' &&
      current.gameNo === context.gameNo
    if (!stillRunning) {
      // 截止后才上报：服务端已按超时收口，不再显示「等待对手」
      matchDrillSubmitted.value = Boolean(current?.drill?.reportedUserIds.includes(selfUserId.value))
      matchDrillFinished.value = updated.status === 'FINISHED'
      matchDrillSettled.value = true
      stopMatchPolling()
      if (matchDrillFinished.value) clearMatchCarry(context.matchId)
      return
    }
    matchDrillSubmitted.value = true
    saveMatchCarry(context.matchId, drill.captureKnockoutCarry())
    startMatchPolling()
  } catch (error) {
    matchDrillError.value = error instanceof Error ? error.message : '上报本局失败，请重试'
    // 可能已因超时被服务端结算，刷新一次让提示回到「已结算」
    void syncMatchDrill()
  } finally {
    matchDrillBusy.value = false
  }
}

function openRestart() {
  if (matchDrillContext.value) {
    ui.notify('锦标赛小局不能重开，请完成本局')
    return
  }
  restartOpen.value = true
}

function closeMatchDrillPage() {
  window.close()
  void router.push('/games')
}

const knockoutPrepLeft = computed(() => {
  if (!knockoutContext.value || !knockoutPrepEndsAt.value) return null
  return Math.max(0, Math.ceil((knockoutPrepEndsAt.value - room.nowMs) / 1000))
})

/** 锦标赛备战倒计时：进局前 35 秒、局间 25 秒，归零后弹「演练开始/是否观战」 */
const PRELUDE_SECONDS = 35
const INTERMISSION_SECONDS = 25
const prepLeft = ref<number | null>(null)
/** 备战截止时间（epoch millis）；按截止时间算剩余秒，避免后台节流把倒计时拖停 */
let prepEndsAt = 0
let prepTimer: number | undefined

function stopPrep() {
  if (prepTimer) window.clearInterval(prepTimer)
  prepTimer = undefined
  prepEndsAt = 0
  prepLeft.value = null
}

function tickPrep() {
  if (!prepEndsAt) return
  prepLeft.value = Math.max(0, Math.ceil((prepEndsAt - Date.now()) / 1000))
  if ((prepLeft.value ?? 0) > 0) return
  // 归零后不立刻收掉计时器：强化提案未选完或战斗动画还没结束时先保持 0s，
  // 等状态解除后的下一次 tick 再弹「演练开始」，避免倒计时停在中间不再继续。
  if (battleActive.value || drill.snapshot.over || drill.snapshot.proposals.length > 0) return
  stopPrep()
  requestBattle()
}

function startPrep() {
  stopPrep()
  if (room.active || knockoutContext.value) return
  if (!drill.snapshot.tournament || drill.snapshot.over) return
  const seconds = drill.snapshot.round <= 1 ? PRELUDE_SECONDS : INTERMISSION_SECONDS
  prepEndsAt = Date.now() + seconds * 1000
  prepLeft.value = seconds
  prepTimer = window.setInterval(tickPrep, 250)
}

/** 备战窗口「直接开始」：本地演练跳过剩余等待；联机房间交给服务端投票。 */
function skipPrep() {
  if (room.active) {
    void room.skip()
    return
  }
  if (prepLeft.value === null) return
  stopPrep()
  if (!battleActive.value && !drill.snapshot.over) requestBattle()
}

watch(
  () => [drill.snapshot.tournament, drill.snapshot.round, drill.snapshot.phase, drill.snapshot.over],
  () => {
    if (room.active) {
      stopPrep()
      return
    }
    if (drill.snapshot.tournament && drill.snapshot.phase === 'PREP' && !drill.snapshot.over) {
      if (prepLeft.value === null) startPrep()
    } else {
      stopPrep()
    }
  },
  { immediate: true },
)

let clockTimer: number | undefined
let battleTimer: number | undefined

/** 点「发起校验」先问一句：进观察窗看过程，还是直接结算。 */
function requestBattle() {
  if (battleActive.value) return
  if (drill.snapshot.proposals.length > 0) return
  if (drill.snapshot.over) return
  if (matchDrillSettled.value || matchDrillSubmitted.value) return
  if (room.active && !knockoutContext.value && !room.canFight) {
    ui.notify(room.gateMessage)
    return
  }
  ui.openPrompt()
}

/** 本地结算一局；联机房间把「刚打完的轮次 + 胜负」上报给服务端。 */
function completeBattle(): boolean {
  const finishedRound = drill.snapshot.round
  const before = drill.snapshot.record
  if (!drill.startBattle()) return false
  if (!room.active || knockoutContext.value) return true
  const after = drill.snapshot.record
  const result =
    after.wins > before.wins ? 'WIN' : after.draws > before.draws ? 'DRAW' : 'LOSS'
  void room.report({
    round: finishedRound,
    hp: drill.snapshot.sli,
    result,
  })
  return true
}

function resolveBattle(watchLive: boolean) {
  ui.closePrompt()
  if (watchLive) {
    if (completeBattle()) ui.openArena()
    return
  }
  battleActive.value = true
  progress.value = 0
  battleTimer = window.setInterval(() => {
    progress.value = Math.min(100, progress.value + 8)
    if (progress.value < 100) return
    if (battleTimer) window.clearInterval(battleTimer)
    battleTimer = undefined
    battleActive.value = false
    progress.value = 0
    completeBattle()
  }, 60)
}

function skipBattle() {
  if (battleTimer) window.clearInterval(battleTimer)
  battleTimer = undefined
  battleActive.value = false
  progress.value = 0
  completeBattle()
}

function requestRemove() {
  confirmOpen.value = true
}

function confirmRestart() {
  restartOpen.value = false
  ui.closeArena()
  ui.closeReport()
  ui.closePrompt()
  lineup.clearActive()
  if (room.active) {
    leaveRoom()
    return
  }
  drill.restart()
}

function leaveRoom() {
  clearKnockoutCarry()
  room.leave()
  knockout.leave()
  knockoutCarry.value = null
  knockoutEntered.value = false
  knockoutPrepEndsAt.value = 0
  void router.push('/games/autochess')
}

/** 从对阵图进入自己的一局：按服务端 seed 打一轮，带入上一局成长。 */
function startKnockoutGame(payload: {
  matchId: string
  game: number
  seed: number
  prepEndsAt?: number
}) {
  const carry =
    knockoutCarry.value ??
    loadKnockoutCarry() ??
    (knockoutEntered.value ? undefined : drill.captureKnockoutCarry())
  knockoutContext.value = { matchId: payload.matchId, game: payload.game }
  knockoutOpen.value = false
  knockoutEntered.value = true
  knockoutCarry.value = null
  knockoutPrepEndsAt.value = payload.prepEndsAt ?? 0
  ui.closeArena()
  ui.closeReport()
  ui.closePrompt()
  battleActive.value = false
  drill.startKnockoutMatch(payload.seed, 1, carry)
  room.setLocalRound(drill.snapshot.round)
}

/** 一轮打完，把本轮战绩报给淘汰赛服务端，回到对阵图等待对手。 */
async function finishKnockoutGame() {
  const context = knockoutContext.value
  if (!context) return
  const snapshot = drill.snapshot
  const carryState = drill.captureKnockoutCarry()
  let match = knockout.matches.find((entry) => entry.id === context.matchId)
  if (!match) {
    await knockout.refresh()
    match = knockout.matches.find((entry) => entry.id === context.matchId)
  }
  if (match) {
    const ok = await knockout.report(match, {
      game: context.game,
      wins: snapshot.record.wins,
      losses: snapshot.record.losses,
      draws: snapshot.record.draws,
      sli: snapshot.sli,
      survivors: snapshot.units.length,
    })
    if (ok) {
      // 上报成功才落盘，避免上报失败后重开同一局却带入更超前的状态
      knockoutCarry.value = carryState
      saveKnockoutCarry(carryState)
    } else {
      ui.notify(knockout.error ?? '上报对局失败')
    }
  }
  knockoutContext.value = null
  knockoutOpen.value = true
}

function confirmRemove() {
  confirmOpen.value = false
  ui.closeDrawer()
}

watch(
  () => drill.error,
  (value) => {
    if (value) ui.notify(value)
  },
)

watch(
  () => drill.snapshot.over,
  (value) => {
    if (!value) return
    if (matchDrillContext.value) {
      void finishMatchDrill()
      return
    }
    if (knockoutContext.value) {
      void finishKnockoutGame()
      return
    }
    // 观察窗开着时先不压报告，等关窗再看
    if (ui.arenaOpen) return
    if (roomMode.value && room.isTournament) {
      knockoutOpen.value = true
      return
    }
    ui.openReport()
  },
)

watch(
  () => ui.arenaOpen,
  (open) => {
    if (open || !drill.snapshot.over || knockoutContext.value || matchDrillContext.value) return
    if (roomMode.value && room.isTournament) {
      // 排位终态先落盘，刷新/关页后进入八强仍能沿用
      if (room.status === 'FINISHED') saveKnockoutCarry(drill.captureKnockoutCarry())
      knockoutOpen.value = true
    } else ui.openReport()
  },
)

// 排位赛结束：自动打开淘汰赛对阵，并保存排位终态作为八强第一局的带入
watch(
  () => [room.status, room.isTournament],
  () => {
    if (room.active && room.isTournament && room.status === 'FINISHED' && !knockoutContext.value) {
      if (drill.snapshot.over) saveKnockoutCarry(drill.captureKnockoutCarry())
      knockoutOpen.value = true
    }
  },
)

watch(
  () => drill.snapshot.proposals.length,
  (value) => {
    if (value > 0) ui.closeDrawer()
  },
)

// 血潮预警：提前 3 轮提示，进入当轮再提示一次
watch(
  () => drill.snapshot.round,
  (round) => {
    if (round === BLOOD_TIDE_ROUND - 3) {
      ui.notify(`第 ${BLOOD_TIDE_ROUND} 轮血潮来袭：掉血翻倍，一波决胜负`)
    }
    if (round === BLOOD_TIDE_ROUND) {
      ui.notify('血潮开始：本轮起掉血 ×2')
    }
  },
)

onMounted(async () => {
  if (queryMatch) {
    await enterMatchDrill(queryMatch)
  } else if (queryRoom) {
    const ok = await room.connect(queryRoom)
    if (!ok) {
      ui.notify(room.error ?? '进入房间失败')
      void router.replace('/games/autochess')
      return
    }
    const view = room.room
    if (view) {
      const adopted = drill.adoptRoom(view.seed, view.mode === 'TOURNAMENT', view.round)
      if (!adopted) ui.notify('本局已开始，暂不支持断线重连；请等本局结束后再进入')
    }
  } else if (drill.mode === null) {
    drill.startSolo()
  }
  room.setLocalRound(drill.snapshot.round)
  clockTimer = window.setInterval(() => {
    drill.tick()
    matchNow.value = Date.now()
  }, 1000)
})

watch(
  () => drill.snapshot.round,
  (round) => room.setLocalRound(round),
)

watch(
  () => room.error,
  (value) => {
    if (!value) return
    ui.notify(value)
    // 房间过期（404）后视图已清空，留在工作区只会卡在无倒计时的半局里，退回入口重开。
    if (!room.active && queryRoom) void router.replace('/games/autochess')
  },
)

// 服务端放行本轮后自动弹「演练开始/观战」，和本地备战倒计时归零的体验一致
watch(
  () => [room.status, room.phase, room.room?.round, room.selfReported, room.localRound],
  () => {
    if (!room.active || drill.snapshot.over) return
    if (!room.canFight) return
    if (battleActive.value || ui.promptOpen) return
    if (drill.snapshot.proposals.length > 0) return
    requestBattle()
  },
)

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  if (battleTimer) window.clearInterval(battleTimer)
  stopMatchPolling()
  clearKnockoutCarry()
  room.leave()
  knockout.leave()
})
</script>

<template>
  <div class="drill" :class="{ 'is-meeting': ui.meetingMode }">
    <DrillHeader @restart="openRestart" />
    <span v-if="roomMode" class="drill__room-chip">
      联机 {{ room.room?.id }} · 第 {{ room.room?.round }} 轮
      <em v-if="room.selfReported">已上报</em>
      <button
        v-if="room.isTournament && room.status === 'FINISHED'"
        type="button"
        class="drill__room-chip-btn"
        @click="knockoutOpen = true"
      >
        对阵
      </button>
    </span>
    <span v-if="matchDrillContext" class="drill__room-chip">
      锦标赛第 {{ matchDrillContext.gameNo }} 局 · 剩余 {{ formatDuration(matchDrillLeft) }}
      <em v-if="matchDrillSubmitted">已上报</em>
      <em v-else-if="matchDrillOpponentDone">对手已提交</em>
    </span>
    <span
      v-if="
        knockoutContext &&
        knockoutPrepLeft !== null &&
        drill.snapshot.round === 1 &&
        drill.snapshot.phase === 'PREP'
      "
      class="drill__prep-chip drill__prep-chip--knockout"
    >
      {{ knockoutPrepLeft > 0 ? `局间备战 ${knockoutPrepLeft}s` : '局间备战结束' }} ·
      可升级/购买/装备
    </span>
    <span v-if="roomMode ? room.prepRemaining !== null : prepLeft !== null" class="drill__prep-chip">
      备战 {{ roomMode ? room.prepRemaining : prepLeft }}s
      <button
        type="button"
        class="drill__prep-skip"
        :disabled="roomMode && room.selfSkipped"
        @click="skipPrep"
      >
        {{ roomMode && room.selfSkipped ? `已请求 ${room.skipCount}/${room.playerCount}` : '直接开始' }}
      </button>
    </span>

    <div class="drill__body">
      <div v-if="!ui.meetingMode" class="drill__rail drill__rail--left">
        <TraitPanel />
        <DrillChat />
      </div>
      <DrillStage />
      <div v-if="!ui.meetingMode" class="drill__side">
        <DrillStandings v-if="drill.snapshot.tournament" />
        <RosterPanel v-else />
        <RoundMatchups />
        <StageTrack />
      </div>
    </div>

    <template v-if="!ui.meetingMode">
      <AnnotationTray />
      <ResourceBar />
      <CommandBar :battle-active="battleActive" :progress="progress" @battle="requestBattle" @skip="skipBattle" />
    </template>

    <UnitDrawer @remove="requestRemove" />
    <LineupPanel />
    <DraftCarousel />
    <NamingBoard />
    <BattleArena />
    <KnockoutBoard
      v-if="knockoutOpen && room.roomId"
      :room-id="room.roomId"
      @play="startKnockoutGame"
      @close="knockoutOpen = false"
    />

    <div
      v-if="ui.promptOpen"
      class="drill__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="是否查看演练过程"
    >
      <div class="drill__modal drill__modal--prompt">
        <header class="drill__modal-head">
          <div>
            <span class="drill__eyebrow">ALIGNMENT</span>
            <b>{{ drill.snapshot.tournament ? '演练开始' : '发起一致性校验' }}</b>
          </div>
        </header>
        <p v-if="drill.snapshot.tournament" class="drill__prompt-text">
          是否观战？观战会打开观察窗逐帧看本局演练；跳过则直接出本局结果，进入结算与备战。
        </p>
        <p v-else class="drill__prompt-text">
          是否进入演练观察窗查看本次对齐过程？观察窗里可以调速、缩放、拖进度；不看也能稍后用底部的「回放」再看一遍。
        </p>
        <footer class="drill__prompt-actions">
          <button type="button" class="drill__ghost" @click="resolveBattle(false)">{{ drill.snapshot.tournament ? '跳过' : '直接结算' }}</button>
          <button type="button" class="drill__primary" @click="resolveBattle(true)">{{ drill.snapshot.tournament ? '观战' : '进入观察窗' }}</button>
        </footer>
      </div>
    </div>

    <ProposalModal />
    <ReportModal />
    <ConfirmDialog
      :open="restartOpen"
      title="重新演练"
      text="当前演练会退出，已上阵的实例与配额进度不保留；组队席位不变，以新种子重开一局。"
      confirm-label="退出并重开"
      @confirm="confirmRestart"
      @cancel="restartOpen = false"
    />
    <ConfirmDialog
      :open="confirmOpen"
      title="下架实例"
      text="下架后实例进入待命实例池，注解原样回仓。确认继续？"
      confirm-label="确认下架"
      @confirm="confirmRemove"
      @cancel="confirmOpen = false"
    />

    <div
      v-if="roomMode && room.status === 'WAITING'"
      class="drill__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="房间候场"
    >
      <div class="drill__modal drill__modal--lobby">
        <header class="drill__modal-head">
          <div>
            <span class="drill__eyebrow">{{ room.isTournament ? 'TOURNAMENT ROOM' : 'PARTY ROOM' }}</span>
            <b>候场 · 房间号 {{ room.room?.id }}</b>
          </div>
        </header>
        <p class="drill__prompt-text">
          把房间号发给同伴，至少 2 人准备后开局；{{ room.isTournament ? '8 人同局、15 轮、按战绩排名。' : '8 席，人少时由教练补位。' }}
        </p>
        <ul class="drill__lobby-list">
          <li
            v-for="player in room.room?.players ?? []"
            :key="player.userId"
            :class="{ 'is-self': player.userId === room.selfId, 'is-ready': player.ready }"
          >
            <span class="drill__lobby-name">{{ player.nickname || player.userId }}</span>
            <em v-if="player.seat === 0">房主</em>
            <b>{{ player.ready ? '已准备' : '未准备' }}</b>
          </li>
        </ul>
        <footer class="drill__prompt-actions">
          <button type="button" class="drill__ghost" @click="leaveRoom">退出房间</button>
          <button
            type="button"
            class="drill__primary"
            :disabled="!room.canReady"
            @click="room.ready()"
          >
            {{ room.self?.ready ? '已准备，等待其他人' : '准备' }}
          </button>
        </footer>
      </div>
    </div>

    <div
      v-if="
        matchDrillContext &&
        (matchDrillSubmitted || matchDrillBusy || matchDrillError || matchDrillSettled)
      "
      class="drill__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="锦标赛小局上报"
    >
      <div class="drill__modal drill__modal--prompt">
        <header class="drill__modal-head">
          <div>
            <span class="drill__eyebrow">TOURNAMENT MATCH</span>
            <b>
              {{
                matchDrillSettled
                  ? '本局已结算'
                  : matchDrillSubmitted
                    ? '本局已提交'
                    : matchDrillError
                      ? '上报失败'
                      : '正在上报本局战绩'
              }}
            </b>
          </div>
        </header>
        <p v-if="matchDrillReport" class="drill__prompt-text">
          第 {{ matchDrillContext.gameNo }} 局 · {{ matchDrillReport.wins }} 胜
          {{ matchDrillReport.draws }} 平 {{ matchDrillReport.losses }} 负 · SLI
          {{ matchDrillReport.sli }} · 存活 {{ matchDrillReport.survivors }}
        </p>
        <p v-if="matchDrillSettled" class="drill__prompt-text">
          {{
            matchDrillFinished
              ? '比赛已结束，回调度台查看最终比分与晋级结果。'
              : '回调度台查看小局比分；下一局开始后重新从对局窗口进入。'
          }}
        </p>
        <p v-else-if="matchDrillSubmitted" class="drill__prompt-text">
          等待对手提交，双方完成后自动结算；可以关闭本页，调度台会持续同步比分。
        </p>
        <p v-else-if="matchDrillError" class="drill__prompt-text">{{ matchDrillError }}</p>
        <p v-else class="drill__prompt-text">正在把本局战绩同步到调度台…</p>
        <footer class="drill__prompt-actions">
          <button type="button" class="drill__ghost" @click="router.push('/games')">
            回调度台
          </button>
          <button
            v-if="matchDrillError && !matchDrillSettled"
            type="button"
            class="drill__primary"
            :disabled="matchDrillBusy"
            @click="finishMatchDrill"
          >
            重试上报
          </button>
          <button
            v-else-if="matchDrillSettled"
            type="button"
            class="drill__primary"
            @click="closeMatchDrillPage"
          >
            关闭本页
          </button>
        </footer>
      </div>
    </div>

    <div v-if="ui.toast" class="drill__toast">{{ ui.toast }}</div>
  </div>
</template>

<style src="./drill-view.css"></style>
