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
      :class="{ 'is-active': activeId === item.id }"
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
