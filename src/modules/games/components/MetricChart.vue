<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { echarts } from '@/modules/games/lib/echartsSetup'

const props = defineProps<{ option: EChartsCoreOption; height?: number }>()

const host = ref<HTMLDivElement | null>(null)
let chart: ECharts | undefined
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!host.value) return
  chart = echarts.init(host.value, undefined, { renderer: 'canvas' })
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(host.value)
})

watch(
  () => props.option,
  (option) => {
    chart?.setOption(option, true)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div
    ref="host"
    class="metric-chart"
    :style="{ height: `${height ?? 190}px` }"
  />
</template>

<style scoped>
.metric-chart {
  width: 100%;
}
</style>
