<script setup lang="ts">
import { computed } from 'vue'

import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
const traits = computed(() => drill.snapshot.traits)

function reached(count: number, tier: number): boolean {
  return count >= tier
}
</script>

<template>
  <section class="drill__panel drill__panel--traits" aria-label="亲和组依赖">
    <header class="drill__panel-head">
      <span>亲和组依赖</span>
      <em>{{ traits.length }} 条</em>
    </header>

    <ul class="drill__trait-list">
      <li v-for="trait in traits" :key="trait.id" class="drill__trait">
        <div class="drill__trait-line">
          <span class="drill__trait-name">{{ trait.label }}</span>
          <span class="drill__trait-count">{{ trait.count }}/{{ trait.tiers[trait.tiers.length - 1] }}</span>
        </div>
        <div class="drill__pips">
          <span
            v-for="tier in trait.tiers"
            :key="tier"
            class="drill__pip"
            :class="{ 'is-on': reached(trait.count, tier) }"
            :title="`档位 ${tier}`"
          />
        </div>
      </li>
    </ul>
  </section>
</template>
