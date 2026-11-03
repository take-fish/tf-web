<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { TRAIT_DEFS, type TraitDef, type TraitEffect } from '../core/content'
import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()
const traits = computed(() => drill.snapshot.traits)

const DEF_BY_ID = new Map<string, TraitDef>(TRAIT_DEFS.map((def) => [def.id, def]))

const preview = ref<{ id: string; top: number; left: number } | null>(null)
const detail = ref<string | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | undefined

const detailDef = computed(() => (detail.value ? (DEF_BY_ID.get(detail.value) ?? null) : null))
const detailLine = computed(() => traits.value.find((trait) => trait.id === detail.value) ?? null)

const EFFECT_TEXT: Record<keyof TraitEffect, (value: number) => string> = {
  atk: (value) => `攻击 +${Math.round(value * 100)}%`,
  as: (value) => `攻速 +${Math.round(value * 100)}%`,
  ap: (value) => `法强 +${Math.round(value * 100)}%`,
  armor: (value) => `护甲 +${Math.round(value * 100)}%`,
  mr: (value) => `魔抗 +${Math.round(value * 100)}%`,
  hp: (value) => `生命 +${Math.round(value * 100)}%`,
  goldPerRound: (value) => `每轮 +${value} 配额`,
  interestCap: (value) => `利息上限 +${value}`,
  onHitFlat: (value) => `普攻附加 ${value} 点`,
  executeBonus: (value) => `斩杀加成 +${Math.round(value * 100)}%`,
  reviveRatio: (value) => `复活 ${Math.round(value * 100)}% 生命`,
  deathAoe: (value) => `亡语溅射 ${value}`,
}

function effectText(effect: TraitEffect): string {
  const parts = (Object.keys(effect) as (keyof TraitEffect)[])
    .map((key) => {
      const value = effect[key]
      return value === undefined ? '' : (EFFECT_TEXT[key]?.(value) ?? '')
    })
    .filter(Boolean)
  return parts.join(' · ') || '无额外加成'
}

function rowOf(id: string) {
  return traits.value.find((trait) => trait.id === id) ?? null
}

function showPreview(id: string, event: MouseEvent | FocusEvent): void {
  if (hideTimer) clearTimeout(hideTimer)
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const width = 268
  const left = Math.min(rect.right + 10, window.innerWidth - width - 12)
  const top = Math.min(rect.top - 8, window.innerHeight - 220)
  preview.value = { id, top: Math.max(12, top), left }
}

function scheduleHide(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    preview.value = null
  }, 120)
}

function keepPreview(): void {
  if (hideTimer) clearTimeout(hideTimer)
}

function openDetail(id: string): void {
  preview.value = null
  detail.value = id
}

function closeDetail(): void {
  detail.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeDetail()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<template>
  <section class="drill__panel drill__panel--traits" aria-label="亲和组依赖">
    <header class="drill__panel-head">
      <span>亲和组依赖</span>
      <em>{{ traits.filter((trait) => trait.activeTier > 0).length }} 条生效</em>
    </header>

    <ul class="drill__trait-list">
      <li
        v-for="trait in traits"
        :key="trait.id"
        class="drill__trait"
        :class="{ 'is-hover': preview?.id === trait.id }"
        tabindex="0"
        @mouseenter="showPreview(trait.id, $event)"
        @mouseleave="scheduleHide()"
        @focus="showPreview(trait.id, $event)"
        @blur="scheduleHide()"
        @click="openDetail(trait.id)"
        @keydown.enter="openDetail(trait.id)"
        @keydown.space.prevent="openDetail(trait.id)"
      >
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

    <Teleport to="body">
      <!-- 悬停预览：各档效果，已达成的高亮 -->
      <div
        v-if="preview"
        class="drill__trait-pop"
        :style="{ top: `${preview.top}px`, left: `${preview.left}px` }"
        @mouseenter="keepPreview()"
        @mouseleave="scheduleHide()"
      >
        <div class="drill__trait-pop-head">
          <b>{{ DEF_BY_ID.get(preview.id)?.label ?? '' }}</b>
          <em>已上 {{ rowOf(preview.id)?.count ?? 0 }}</em>
        </div>
        <ul class="drill__trait-pop-tiers">
          <li
            v-for="(tier, index) in DEF_BY_ID.get(preview.id)?.tiers ?? []"
            :key="tier"
            :class="{ 'is-on': (rowOf(preview.id)?.activeTier ?? 0) > index }"
          >
            <span class="drill__tier-threshold">{{ tier }} 人</span>
            <span class="drill__tier-effect">
              {{ effectText(DEF_BY_ID.get(preview.id)?.effects[index] ?? {}) }}
            </span>
          </li>
        </ul>
        <p class="drill__trait-pop-hint">点击查看详情</p>
      </div>

      <!-- 点击详情 -->
      <div v-if="detailDef" class="drill__trait-modal" @click.self="closeDetail()">
        <div class="drill__trait-card" role="dialog" aria-modal="true">
          <header class="drill__trait-card-head">
            <div>
              <b>{{ detailDef.label }}</b>
              <span>
                已上 {{ detailLine?.count ?? 0 }} 人 · 生效
                {{ (detailLine?.activeTier ?? 0) > 0 ? `${detailLine?.activeTier} 档` : '未生效' }}
              </span>
            </div>
            <button type="button" class="drill__trait-close" @click="closeDetail()">关闭</button>
          </header>
          <ul class="drill__trait-card-tiers">
            <li
              v-for="(tier, index) in detailDef.tiers"
              :key="tier"
              :class="{ 'is-on': (detailLine?.activeTier ?? 0) > index }"
            >
              <span class="drill__tier-threshold">{{ tier }} 人</span>
              <span class="drill__tier-effect">{{ effectText(detailDef.effects[index] ?? {}) }}</span>
              <span v-if="(detailLine?.activeTier ?? 0) > index" class="drill__tier-on">生效中</span>
            </li>
          </ul>
          <p class="drill__trait-card-hint">达成人数按上场＋待命席计，档位取最高达成的一档。</p>
        </div>
      </div>
    </Teleport>
  </section>
</template>
