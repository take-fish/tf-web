<script setup lang="ts">
import { computed } from 'vue'

import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
const traits = computed(() => drill.snapshot.traits)
</script>

<template>
  <section class="drill__panel drill__panel--traits" aria-label="亲和组依赖">
    <header class="drill__panel-head">
      <span>亲和组依赖</span>
      <em>{{ traits.filter((trait) => trait.activeTier > 0).length }} 条生效</em>
    </header>

    <ul class="drill__trait-list">
      <li v-for="trait in traits" :key="trait.id" class="drill__trait">
        <div class="drill__trait-line">
          <span class="drill__trait-name" :class="{ 'is-active': trait.activeTier > 0 }">
            {{ trait.label }}
          </span>
          <span class="drill__trait-count">
            {{ trait.count }}/{{ trait.tiers[trait.tiers.length - 1] ?? 0 }}
          </span>
        </div>
        <div class="drill__pips">
          <span
            v-for="(tier, index) in trait.tiers"
            :key="tier"
            class="drill__pip"
            :class="{ 'is-on': trait.activeTier > index }"
            :title="`档位 ${tier}`"
          />
        </div>
      </li>
    </ul>
  </section>
</template>
