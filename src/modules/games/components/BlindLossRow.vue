<script setup lang="ts">
import { computed } from 'vue'

import { pieceGlyph, pieceLabel } from '../lib/blindXiangqi'
import type { LostPieceGroup } from '../lib/blindXiangqi'
import type { BlindPieceColor } from '@/types/games'

const props = withDefaults(
  defineProps<{
    color?: BlindPieceColor | null
    groups?: LostPieceGroup[]
    align?: 'left' | 'right'
  }>(),
  {
    color: null,
    groups: () => [],
    align: 'left',
  },
)

const colorClass = computed(() =>
  props.color ? `is-${props.color.toLowerCase()}` : '',
)

const lostGroups = computed(() => props.groups ?? [])

function glyphFor(group: LostPieceGroup): string {
  return props.color ? pieceGlyph(props.color, group.pieceType) : ''
}

function labelFor(group: LostPieceGroup): string {
  return props.color
    ? `${pieceLabel(props.color, group.pieceType)} ×${group.count}`
    : ''
}
</script>

<template>
  <div
    v-if="color"
    class="blind-loss"
    :class="[colorClass, { 'is-right': align === 'right' }]"
  >
    <span class="blind-loss__label">已损失</span>
    <span v-if="lostGroups.length === 0" class="blind-loss__empty">暂无损失</span>
    <span
      v-for="group in lostGroups"
      :key="group.pieceType"
      class="blind-loss__piece"
      :title="labelFor(group)"
      :aria-label="labelFor(group)"
    >
      {{ glyphFor(group) }}
      <em v-if="group.count > 1">×{{ group.count }}</em>
    </span>
  </div>
</template>

<style scoped>
.blind-loss {
  --loss-color: var(--fm-text-muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
  width: 100%;
  margin-top: 2px;
  font-family: var(--fm-mono);
  line-height: 1;
}

.blind-loss.is-right {
  justify-content: flex-end;
  text-align: right;
}

.blind-loss.is-red {
  --loss-color: #e06666;
}

.blind-loss.is-black {
  --loss-color: #d0d6e0;
}

.blind-loss__label,
.blind-loss__empty {
  color: var(--fm-text-muted);
  font-size: 7px;
  opacity: 0.72;
  white-space: nowrap;
}

.blind-loss__piece {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  min-width: 15px;
  height: 16px;
  padding: 0 3px;
  border: 1px solid color-mix(in srgb, var(--loss-color) 34%, var(--fm-border));
  border-radius: 2px;
  background: color-mix(in srgb, var(--loss-color) 7%, transparent);
  color: color-mix(in srgb, var(--loss-color) 82%, var(--fm-text-muted));
  font-size: 9px;
  font-weight: 600;
  opacity: 0.78;
}

.blind-loss__piece em {
  font-size: 7px;
  font-style: normal;
  font-weight: 500;
  opacity: 0.8;
}

@media (max-width: 620px) {
  .blind-loss {
    gap: 2px;
  }

  .blind-loss__piece {
    height: 14px;
    font-size: 8px;
  }
}
</style>
