<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AnnotationTray from '@/modules/drill/components/AnnotationTray.vue'
import BattleReplay from '@/modules/drill/components/BattleReplay.vue'
import CommandBar from '@/modules/drill/components/CommandBar.vue'
import ConfirmDialog from '@/modules/drill/components/ConfirmDialog.vue'
import DrillHeader from '@/modules/drill/components/DrillHeader.vue'
import DrillStage from '@/modules/drill/components/DrillStage.vue'
import DraftCarousel from '@/modules/drill/components/DraftCarousel.vue'
import ProposalModal from '@/modules/drill/components/ProposalModal.vue'
import ReportModal from '@/modules/drill/components/ReportModal.vue'
import ResourceBar from '@/modules/drill/components/ResourceBar.vue'
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

function startBattle() {
  if (battleActive.value) return
  if (drill.snapshot.proposals.length > 0) return
  battleActive.value = true
  progress.value = 0
  battleTimer = window.setInterval(() => {
    progress.value = Math.min(100, progress.value + 5)
    if (progress.value < 100) return
    if (battleTimer) window.clearInterval(battleTimer)
    battleTimer = undefined
    battleActive.value = false
    progress.value = 0
    drill.startBattle()
  }, 70)
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
    if (value) ui.openReport()
  },
)

watch(
  () => drill.snapshot.proposals.length,
  (value) => {
    if (value > 0) ui.closeDrawer()
  },
)

onMounted(() => {
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
        <StageTrack />
      </div>
    </div>

    <template v-if="!ui.meetingMode">
      <AnnotationTray />
      <ResourceBar />
      <CommandBar :battle-active="battleActive" :progress="progress" @battle="startBattle" @skip="skipBattle" />
    </template>

    <UnitDrawer @remove="requestRemove" />
    <DraftCarousel />
    <BattleReplay />
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
