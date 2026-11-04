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

const route = useRoute()
const router = useRouter()
const drill = useDrillStore()
const room = useDrillRoomStore()
const knockout = useDrillKnockoutStore()
const ui = useDrillUiStore()
const lineup = useLineupStore()

const roomMode = computed(() => room.active)
const queryRoom = typeof route.query.room === 'string' ? route.query.room : ''

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

const knockoutPrepLeft = computed(() => {
  if (!knockoutContext.value || !knockoutPrepEndsAt.value) return null
  return Math.max(0, Math.ceil((knockoutPrepEndsAt.value - room.nowMs) / 1000))
})

/** 锦标赛备战倒计时：进局前 35 秒、局间 25 秒，归零后弹「演练开始/是否观战」 */
const PRELUDE_SECONDS = 35
const INTERMISSION_SECONDS = 25
const prepLeft = ref<number | null>(null)
let prepTimer: number | undefined

function stopPrep() {
  if (prepTimer) window.clearInterval(prepTimer)
  prepTimer = undefined
  prepLeft.value = null
}

function startPrep() {
  stopPrep()
  if (room.active || knockoutContext.value) return
  if (!drill.snapshot.tournament || drill.snapshot.over) return
  prepLeft.value = drill.snapshot.round <= 1 ? PRELUDE_SECONDS : INTERMISSION_SECONDS
  prepTimer = window.setInterval(() => {
    if (prepLeft.value === null) return
    prepLeft.value -= 1
    if (prepLeft.value > 0) return
    stopPrep()
    if (!battleActive.value && !drill.snapshot.over) requestBattle()
  }, 1000)
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
    if (open || !drill.snapshot.over || knockoutContext.value) return
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
  if (queryRoom) {
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
  } else if (drill.mode === 'tournament' && !drill.snapshot.tournament) {
    drill.startTournament()
  }
  room.setLocalRound(drill.snapshot.round)
  clockTimer = window.setInterval(() => drill.tick(), 1000)
})

watch(
  () => drill.snapshot.round,
  (round) => room.setLocalRound(round),
)

watch(
  () => room.error,
  (value) => {
    if (value) ui.notify(value)
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
  clearKnockoutCarry()
  room.leave()
  knockout.leave()
})
</script>

<template>
  <div class="drill" :class="{ 'is-meeting': ui.meetingMode }">
    <DrillHeader @restart="restartOpen = true" />
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

    <div v-if="ui.toast" class="drill__toast">{{ ui.toast }}</div>
  </div>
</template>

<style src="./drill-view.css"></style>
