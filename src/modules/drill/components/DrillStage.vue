<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { createStage } from '../stage/createStage'
import type { StageHandle } from '../types'
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()
const host = ref<HTMLElement | null>(null)
let stage: StageHandle | undefined

onMounted(() => {
  if (!host.value) return
  stage = createStage(host.value, {
    getSnapshot: () => drill.snapshot,
    onUnitPointer: (unitId) => ui.openDrawer(unitId),
    onHover: () => undefined,
    onDrop: ({ unitId, zone, slot }) => {
      drill.move(unitId, zone, slot)
    },
  })
})

onBeforeUnmount(() => {
  stage?.destroy()
  stage = undefined
})

const phaseLabel = computed(() => {
  const phase = drill.snapshot.phase
  if (phase === 'BATTLE') return '一致性校验中'
  if (phase === 'TERMINATED') return '演练已终止'
  return '编排中'
})
</script>

<template>
  <div class="drill__stage-wrap">
    <div ref="host" class="drill__stage" />
    <span class="drill__stage-badge">{{ phaseLabel }}</span>
    <span class="drill__stage-tip">拖动实例在网格与待命席之间移动</span>
  </div>
</template>
