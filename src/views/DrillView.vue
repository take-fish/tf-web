<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import AnnotationTray from '@/modules/drill/components/AnnotationTray.vue'
import CommandBar from '@/modules/drill/components/CommandBar.vue'
import ConfirmDialog from '@/modules/drill/components/ConfirmDialog.vue'
import DrillHeader from '@/modules/drill/components/DrillHeader.vue'
import DrillStage from '@/modules/drill/components/DrillStage.vue'
import ProposalModal from '@/modules/drill/components/ProposalModal.vue'
import ReportModal from '@/modules/drill/components/ReportModal.vue'
import ResourceBar from '@/modules/drill/components/ResourceBar.vue'
import RosterPanel from '@/modules/drill/components/RosterPanel.vue'
import TraitPanel from '@/modules/drill/components/TraitPanel.vue'
import UnitDrawer from '@/modules/drill/components/UnitDrawer.vue'
import { useDrillStore } from '@/modules/drill/stores/drill'
import { useProposalStore } from '@/modules/drill/stores/proposal'
import { useDrillUiStore } from '@/modules/drill/stores/ui'

const drill = useDrillStore()
const proposal = useProposalStore()
const ui = useDrillUiStore()

const battleActive = ref(false)
const progress = ref(0)
const confirmOpen = ref(false)

let clockTimer: number | undefined
let battleTimer: number | undefined
let reviewTimer: number | undefined

function startReview() {
  if (proposal.open) return
  if (proposal.picks.length >= 3) return
  proposal.openReview(drill.snapshot.round + 1, drill.snapshot.proposals)
}

function finishBattle() {
  if (battleTimer) {
    window.clearInterval(battleTimer)
    battleTimer = undefined
  }
  battleActive.value = false
  progress.value = 0
  drill.settle(6)
  if (drill.snapshot.phase === 'TERMINATED') ui.openReport()
  else startReview()
}

function startBattle() {
  if (battleActive.value) return
  battleActive.value = true
  progress.value = 0
  drill.startBattle()
  battleTimer = window.setInterval(() => {
    progress.value = Math.min(100, progress.value + 4)
    if (progress.value >= 100) finishBattle()
  }, 90)
}

function requestRemove() {
  confirmOpen.value = true
}

function confirmRemove() {
  confirmOpen.value = false
  ui.closeDrawer()
}

onMounted(() => {
  clockTimer = window.setInterval(() => drill.tick(), 1000)
  reviewTimer = window.setTimeout(startReview, 9000)
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  if (battleTimer) window.clearInterval(battleTimer)
  if (reviewTimer) window.clearTimeout(reviewTimer)
  proposal.dispose()
})
</script>

<template>
  <div class="drill" :class="{ 'is-meeting': ui.meetingMode }">
    <DrillHeader />

    <div class="drill__body">
      <TraitPanel v-if="!ui.meetingMode" />
      <DrillStage />
      <RosterPanel v-if="!ui.meetingMode" />
    </div>

    <template v-if="!ui.meetingMode">
      <AnnotationTray />
      <ResourceBar />
      <CommandBar
        :battle-active="battleActive"
        :progress="progress"
        @battle="startBattle"
        @skip="finishBattle"
      />
    </template>

    <UnitDrawer @remove="requestRemove" />
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
  </div>
</template>

<style src="./drill-view.css"></style>
