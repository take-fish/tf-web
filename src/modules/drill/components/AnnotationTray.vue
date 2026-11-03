<script setup lang="ts">
import { computed, ref } from 'vue'

import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()

/** 备注：注解的加成口径与 core/combat.ts 的 buildFighter 一致 */
const EFFECT: Record<string, string> = {
  async: '攻速 +15%',
  tx: '护甲 +10',
  cache: '开局法力 +20（更快放技能）',
  retry: '重试：额外触发一次',
}

const hoverId = ref<string | null>(null)

const busy = computed(
  () => drill.snapshot.phase === 'BATTLE' || drill.snapshot.phase === 'SETTLE',
)
const targetId = computed(() => ui.drawerUnitId)
const targetUnit = computed(() =>
  targetId.value ? drill.snapshot.units.find((unit) => unit.id === targetId.value) : null,
)

function toggle(id: string, kind: string | null) {
  if (busy.value || !kind) return
  if (targetId.value) {
    equip(id)
    return
  }
  ui.selectAnnotation(ui.selectedAnnotationId === id ? null : id)
}

function equip(annotationId: string) {
  const uid = targetId.value
  if (!uid) return
  if (drill.equip(uid, annotationId)) ui.selectAnnotation(null)
}

function unequip() {
  const uid = targetId.value
  const unit = targetUnit.value
  if (!uid || !unit || unit.annotations.length === 0) return
  drill.unequip(uid, unit.annotations.length - 1)
}

function onDragStart(event: DragEvent, id: string, kind: string | null) {
  if (busy.value || !kind) {
    event.preventDefault()
    return
  }
  ui.selectAnnotation(id)
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
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
        :disabled="slot.label === '' || busy"
        :draggable="!busy && !!slot.kind"
        :aria-label="slot.label ? `${slot.label}：${EFFECT[slot.kind ?? ''] ?? '注解'}` : ''"
        @click="toggle(slot.id, slot.kind)"
        @contextmenu.prevent="unequip()"
        @dragstart="onDragStart($event, slot.id, slot.kind)"
        @mouseenter="hoverId = slot.id"
        @mouseleave="hoverId = null"
        @focus="hoverId = slot.id"
        @blur="hoverId = null"
      >
        {{ slot.label === '' ? '' : slot.label }}
        <span v-if="hoverId === slot.id && slot.kind" class="drill__slot-tip">
          <b>{{ slot.label }}</b>
          <em>{{ EFFECT[slot.kind] ?? '注解加成' }}</em>
          <span v-if="targetUnit" class="drill__slot-tip-sub">
            左键装到「{{ targetUnit.name }}」· 右键卸下
          </span>
        </span>
      </button>
    </div>
    <span class="drill__tray-hint">
      {{
        busy
          ? '战斗中不可装配，等待本轮结束'
          : targetUnit
            ? `目标：${targetUnit.name} · 左键装配 / 右键卸下`
            : ui.selectedAnnotationId
              ? '已选注解 → 在实例详情里点击「装配注解」'
              : '悬停看加成，左键装到当前实例，右键卸下'
      }}
    </span>
  </section>
</template>
