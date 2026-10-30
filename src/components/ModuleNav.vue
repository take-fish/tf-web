<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { MODULES, moduleByPath, type ModuleDef } from '@/modules/registry'

withDefaults(defineProps<{ variant?: 'explorer' | 'plain' | 'tabs' }>(), { variant: 'plain' })

const route = useRoute()
const activeId = computed(() => moduleByPath(route.path).id)

const EXPLORER_NAMES: Record<string, string> = {
  overview: 'workspace',
  chat: 'chat.log',
  reader: 'ReaderService.java',
  games: 'dashboard.json',
  music: 'Jenkinsfile',
}

const TAG_NAMES: Record<string, string> = {
  overview: 'dir',
  chat: 'log',
  reader: 'java',
  games: 'json',
  music: 'groovy',
}

function explorerName(item: ModuleDef): string {
  return EXPLORER_NAMES[item.id] ?? item.label
}

function tagName(item: ModuleDef): string {
  return TAG_NAMES[item.id] ?? 'file'
}
</script>

<template>
  <nav class="module-nav" :class="`module-nav--${variant}`" aria-label="工作区模块">
    <RouterLink
      v-for="item in MODULES"
      :key="item.id"
      :to="item.path"
      class="module-nav__item"
      :class="{ 'is-active': activeId === item.id, 'module-nav__item--agent': item.id === 'agent' }"
      :title="item.description"
    >
      <AppIcon :name="item.icon" class="module-nav__icon" />
      <span class="module-nav__label">
        {{ variant === 'explorer' ? explorerName(item) : item.label }}
      </span>
      <span v-if="variant === 'explorer'" class="module-nav__tag">{{ tagName(item) }}</span>
      <span v-else-if="variant === 'tabs'" class="module-nav__dot" />
    </RouterLink>
  </nav>
</template>

<style scoped>
/* Agent 入口：做成和其他模块不同的"胶囊按钮"，视觉上突出成第二入口 */
.module-nav__item--agent {
  margin: 10px 8px 6px;
  border: 1px solid rgba(88, 166, 255, 0.45);
  border-radius: 9px;
  background:
    linear-gradient(135deg, rgba(88, 166, 255, 0.16), rgba(163, 113, 247, 0.16)),
    rgba(30, 30, 30, 0.4);
  box-shadow: inset 0 0 12px rgba(88, 166, 255, 0.08);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.module-nav__item--agent:hover {
  border-color: rgba(88, 166, 255, 0.85);
  box-shadow:
    0 0 0 1px rgba(88, 166, 255, 0.35),
    0 0 14px rgba(88, 166, 255, 0.22);
  transform: translateY(-1px);
}

.module-nav__item--agent.is-active {
  border-color: #58a6ff;
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.55);
}

.module-nav__item--agent .module-nav__icon {
  color: #79c0ff;
}

.module-nav__item--agent .module-nav__label {
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
