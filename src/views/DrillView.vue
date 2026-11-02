<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AnnotationTray from '@/modules/drill/components/AnnotationTray.vue'
import BattleArena from '@/modules/drill/components/BattleArena.vue'
import CommandBar from '@/modules/drill/components/CommandBar.vue'
import ConfirmDialog from '@/modules/drill/components/ConfirmDialog.vue'
import DrillHeader from '@/modules/drill/components/DrillHeader.vue'
import DrillStage from '@/modules/drill/components/DrillStage.vue'
import DraftCarousel from '@/modules/drill/components/DraftCarousel.vue'
import NamingBoard from '@/modules/drill/components/NamingBoard.vue'
import ProposalModal from '@/modules/drill/components/ProposalModal.vue'
import ReportModal from '@/modules/drill/components/ReportModal.vue'
import ResourceBar from '@/modules/drill/components/ResourceBar.vue'
import RoundMatchups from '@/modules/drill/components/RoundMatchups.vue'
import RosterPanel from '@/modules/drill/components/RosterPanel.vue'
import StageTrack from '@/modules/drill/components/StageTrack.vue'
import TraitPanel from '@/modules/drill/components/TraitPanel.vue'
import UnitDrawer from '@/modules/drill/components/UnitDrawer.vue'
import { useDrillStore } from '@/modules/drill/stores/drill'
import { useDrillUiStore } from '@/modules/drill/stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()

const battleActive = ref(false)
const progress = ref(0)
const confirmOpen = ref(false)

let clockTimer: number | undefined
let battleTimer: number | undefined

/** 点「发起校验」先问一句：进观察窗看过程，还是直接结算。 */
function requestBattle() {
  if (battleActive.value) return
  if (drill.snapshot.proposals.length > 0) return
  if (drill.snapshot.over) return
  ui.openPrompt()
}

function resolveBattle(watchLive: boolean) {
  ui.closePrompt()
  if (watchLive) {
    if (drill.startBattle()) ui.openArena()
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
    drill.startBattle()
  }, 60)
}

function skipBattle() {
  if (battleTimer) window.clearInterval(battleTimer)
  battleTimer = undefined
  battleActive.value = false
  progress.value = 0
  drill.startBattle()
}

function requestRemove() {
  confirmOpen.value = true
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
    // 观察窗开着时先不压报告，等关窗再看
    if (value && !ui.arenaOpen) ui.openReport()
  },
)

watch(
  () => ui.arenaOpen,
  (open) => {
    if (!open && drill.snapshot.over) ui.openReport()
  },
)

watch(
  () => drill.snapshot.proposals.length,
  (value) => {
    if (value > 0) ui.closeDrawer()
  },
)

onMounted(() => {
  if (drill.mode === null) drill.startSolo()
  clockTimer = window.setInterval(() => drill.tick(), 1000)
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  if (battleTimer) window.clearInterval(battleTimer)
})
</script>

<template>
  <div class="drill" :class="{ 'is-meeting': ui.meetingMode }">
    <DrillHeader />

    <div class="drill__body">
      <TraitPanel v-if="!ui.meetingMode" />
      <DrillStage />
      <div v-if="!ui.meetingMode" class="drill__side">
        <RosterPanel />
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
    <DraftCarousel />
    <NamingBoard />
    <BattleArena />

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
            <b>发起一致性校验</b>
          </div>
        </header>
        <p class="drill__prompt-text">
          是否进入演练观察窗查看本次对齐过程？观察窗里可以调速、缩放、拖进度；不看也能稍后用底部的「回放」再看一遍。
        </p>
        <footer class="drill__prompt-actions">
          <button type="button" class="drill__ghost" @click="resolveBattle(false)">直接结算</button>
          <button type="button" class="drill__primary" @click="resolveBattle(true)">进入观察窗</button>
        </footer>
      </div>
    </div>

    <ProposalModal />
    <ReportModal />
    <ConfirmDialog
      :open="confirmOpen"
      title="下架实例"
      text="下架后实例进入待命实例池，注解原样回仓。确认继续？"
      confirm-label="确认下架"
      @confirm="confirmRemove"
      @cancel="confirmOpen = false"
    />

    <div v-if="ui.toast" class="drill__toast">{{ ui.toast }}</div>
  </div>
</template>

<style src="./drill-view.css"></style>
