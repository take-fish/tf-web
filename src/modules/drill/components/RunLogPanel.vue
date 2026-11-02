<script setup lang="ts">
import { computed, ref } from 'vue'

import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
const open = ref(false)

const history = computed(() => drill.snapshot.history)
const passed = computed(() => history.value.filter((entry) => entry.won !== false).length)
const last = computed(() => history.value[history.value.length - 1] ?? null)
</script>

<template>
  <section class="drill__panel drill__panel--run">
    <button type="button" class="drill__run-head" @click="open = !open">
      <span class="drill__run-title">运行记录</span>
      <span v-if="!open && last" class="drill__run-last" :class="{ 'is-fail': last.won === false }">
        R{{ last.round }} {{ last.won === false ? '未通过' : '通过' }}
      </span>
      <em v-else>{{ history.length }} 轮 · {{ passed }} 通过</em>
      <i class="drill__run-toggle">{{ open ? '−' : '+' }}</i>
    </button>

    <ul v-if="open" class="drill__run-list">
      <li
        v-for="entry in [...history].reverse()"
        :key="entry.round"
        :class="{ 'is-fail': entry.won === false }"
      >
        <span class="drill__run-round">R{{ String(entry.round).padStart(2, '0') }}</span>
        <em class="drill__run-mode">{{ entry.mode === 'PVE' ? '预检' : '对齐' }}</em>
        <span class="drill__run-text">{{ entry.text }}</span>
      </li>
      <li v-if="history.length === 0" class="drill__run-empty">暂无轮次记录</li>
    </ul>
  </section>
</template>
