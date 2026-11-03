<script setup lang="ts">
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()

function toggle(id: string, kind: string | null) {
  if (!kind) return
  ui.selectAnnotation(ui.selectedAnnotationId === id ? null : id)
}
</script>

<template>
  <section class="drill__tray" aria-label="注解仓库">
    <span class="drill__tray-label">注解仓库</span>
    <div class="drill__slots">
      <button
        v-for="slot in drill.snapshot.annotations"
        :key="slot.id"
        type="button"
        class="drill__slot"
        :class="{
          'is-combo': slot.combo,
          'is-empty': slot.label === '',
          'is-selected': ui.selectedAnnotationId === slot.id,
        }"
        :disabled="slot.label === ''"
        @click="toggle(slot.id, slot.kind)"
      >
        {{ slot.label === '' ? '' : slot.label }}
      </button>
    </div>
    <span class="drill__tray-hint">
      {{
        ui.selectedAnnotationId
          ? '已选注解 → 在实例详情里点击「装配注解」'
          : '选中一个注解后可装配到实例'
      }}
    </span>
  </section>
</template>
