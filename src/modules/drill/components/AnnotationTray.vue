<script setup lang="ts">
import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
</script>

<template>
  <section class="drill__tray" aria-label="注解仓库">
    <span class="drill__tray-label">注解仓库</span>
    <div class="drill__slots">
      <span
        v-for="slot in drill.snapshot.annotations"
        :key="slot.id"
        class="drill__slot"
        :class="{ 'is-combo': slot.combo, 'is-empty': slot.label === '' }"
      >
        {{ slot.label === '' ? '' : slot.label }}
      </span>
    </div>
    <span class="drill__tray-hint">已选 元注解·@Async → 点击实例完成装配</span>
  </section>
</template>
