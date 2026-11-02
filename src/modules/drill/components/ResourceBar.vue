<script setup lang="ts">
import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()

function pick(index: number) {
  drill.buy(index)
}

function lock(index: number) {
  drill.toggleLock(index)
}
</script>

<template>
  <section class="drill__resources" aria-label="资源目录">
    <div class="drill__resources-head">
      <span>资源目录</span>
      <em>重新编排 -{{ drill.rerollCost }}{{ drill.rerollCost === 0 ? '（免费）' : '' }}</em>
    </div>
    <div class="drill__resource-list">
      <div
        v-for="(slot, index) in drill.snapshot.shop"
        :key="slot.slot"
        class="drill__resource"
        :class="{ 'is-locked': slot.locked, 'is-sold': slot.soldOut }"
      >
        <button
          type="button"
          class="drill__resource-buy"
          :disabled="slot.soldOut"
          @click="pick(index)"
        >
          <span class="drill__resource-slot">{{ String(slot.slot).padStart(2, '0') }}</span>
          <span class="drill__resource-name">{{ slot.soldOut ? '无可用资源' : slot.name }}</span>
          <span class="drill__resource-traits">
            {{ slot.soldOut ? '—' : slot.traits.join(' · ') }}
          </span>
          <span class="drill__resource-cost">配额 {{ slot.cost }}</span>
        </button>
        <button
          type="button"
          class="drill__resource-lock"
          :aria-label="slot.locked ? '解除锁定' : '锁定资源'"
          @click="lock(index)"
        >
          {{ slot.locked ? '已锁定' : '锁定' }}
        </button>
      </div>
    </div>
  </section>
</template>
