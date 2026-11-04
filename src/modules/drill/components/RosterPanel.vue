<script setup lang="ts">
import { computed } from 'vue'

import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
const roster = computed(() => drill.snapshot.roster)
const alive = computed(() => roster.value.filter((entry) => entry.alive).length)
</script>

<template>
  <section class="drill__panel drill__panel--roster" aria-label="对照组状态">
    <header class="drill__panel-head">
      <span>对照组</span>
      <em>{{ alive }} 组在线</em>
    </header>

    <ul class="drill__roster">
      <li
        v-for="entry in roster"
        :key="entry.id"
        class="drill__roster-row"
        :class="{ 'is-offline': !entry.alive }"
      >
        <span class="drill__roster-name">{{ entry.label }}</span>
        <template v-if="!drill.snapshot.tournament">
          <span class="drill__roster-bar">
            <i :style="{ width: `${entry.alive ? entry.sli : 0}%` }" />
          </span>
          <span class="drill__roster-sli">{{ entry.alive ? entry.sli : '—' }}</span>
        </template>
        <span v-else class="drill__roster-sli">在榜</span>
      </li>
    </ul>
  </section>
</template>
