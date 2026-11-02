<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()
const router = useRouter()

const snapshot = computed(() => drill.snapshot)

function backToWorkbench() {
  ui.closeReport()
  void router.push('/games')
}

function replay() {
  ui.closeReport()
  drill.reset()
}
</script>

<template>
  <div v-if="ui.reportOpen" class="drill__overlay" role="dialog" aria-modal="true" aria-label="稳态报告">
    <div class="drill__modal drill__modal--report">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">STEADY-STATE REPORT</span>
          <b>稳态报告 · {{ snapshot.drillName }}</b>
        </div>
      </header>

      <dl class="drill__report-rows">
        <div><dt>稳态达成度</dt><dd>{{ snapshot.achievement }} / {{ snapshot.scale }}</dd></div>
        <div><dt>最终 SLI</dt><dd>{{ snapshot.sli }}</dd></div>
        <div><dt>轮次</dt><dd>{{ snapshot.round }} / {{ snapshot.totalRounds }}</dd></div>
        <div><dt>配额结余</dt><dd>{{ snapshot.quotas }}</dd></div>
        <div><dt>实例</dt><dd>{{ snapshot.units.length }} / {{ snapshot.level }}</dd></div>
        <div><dt>注解</dt><dd>{{ snapshot.annotations.filter((slot) => slot.label !== '').length }}</dd></div>
      </dl>

      <div class="drill__report-block">
        <span>亲和组</span>
        <p>
          {{ snapshot.traits.filter((trait) => trait.count > 0).map((trait) => `${trait.label} ${trait.count}`).join(' · ') }}
        </p>
      </div>

      <div class="drill__report-block">
        <span>技术方案</span>
        <p>{{ snapshot.picks.map((card) => card.name).join(' · ') }}</p>
      </div>

      <div class="drill__report-actions">
        <button type="button" class="drill__ghost" @click="replay">复盘</button>
        <button type="button" class="drill__primary" @click="backToWorkbench">返回工作台</button>
      </div>
    </div>
  </div>
</template>
