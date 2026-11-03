<script setup lang="ts">
import { computed, ref } from 'vue'

import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
const selected = ref<number | null>(null)

const snapshot = computed(() => drill.snapshot)
const activeStage = computed(() => selected.value ?? snapshot.value.stage)

const rows = computed(() => {
  const stage = activeStage.value
  return Array.from({ length: 5 }, (_, offset) => {
    const round = (stage - 1) * 5 + offset + 1
    if (round > snapshot.value.totalRounds) return null
    const entry = snapshot.value.history.find((item) => item.round === round)
    return {
      round,
      label: `${stage}-${offset + 1}`,
      won: entry ? entry.won !== false : null,
      text: entry?.text ?? '',
    }
  })
})

const played = computed(() => rows.value.filter((row) => row !== null && row.won !== null))
const passed = computed(() => played.value.filter((row) => row?.won === true).length)

function select(stage: number) {
  selected.value = stage === snapshot.value.stage ? null : stage
}
</script>

<template>
  <section class="drill__panel drill__panel--stage">
    <div class="drill__stage-tabs" role="tablist" aria-label="阶段">
      <button
        v-for="stage in snapshot.stageCount"
        :key="stage"
        type="button"
        role="tab"
        class="drill__stage-tab"
        :class="{ 'is-on': stage === activeStage, 'is-current': stage === snapshot.stage }"
        :aria-selected="stage === activeStage"
        @click="select(stage)"
      >
        {{ stage }}
      </button>
    </div>

    <div class="drill__stage-now">
      <b class="drill__stage-code">{{ snapshot.stageLabel }}</b>
      <span>第 {{ activeStage }} 阶段 · {{ passed }}/{{ played.length }} 通过</span>
    </div>

    <ul class="drill__stage-rounds">
      <li
        v-for="(row, index) in rows"
        :key="index"
        class="drill__stage-round"
        :class="
          row === null
            ? 'is-empty'
            : row.won === null
              ? 'is-pending'
              : row.won
                ? 'is-win'
                : 'is-loss'
        "
        :title="row ? row.text || `第 ${row.label} 回合未开始` : ''"
      >
        <span>{{ row?.label ?? '—' }}</span>
      </li>
    </ul>
  </section>
</template>
