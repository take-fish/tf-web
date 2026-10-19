<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { SKINS } from '@/skins/registry'
import { useSkinStore } from '@/stores/skin'

const emit = defineEmits<{ close: [] }>()
const skinStore = useSkinStore()
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" aria-label="切换工作台视图" @click.self="emit('close')">
    <div class="sheet skin-sheet">
      <header class="sheet__head">
        <div>
          <h2>切换工作区视图</h2>
          <p>不同视图共享同一套会话与数据，切换不会中断任务。</p>
        </div>
        <button class="icon-button" aria-label="关闭" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </header>

      <div class="skin-grid">
        <button
          v-for="skin in SKINS"
          :key="skin.id"
          class="skin-card"
          :class="{ 'is-active': skinStore.activeSkin === skin.id }"
          @click="skinStore.selectSkin(skin.id)"
        >
          <span class="skin-card__preview" :data-preview="skin.id">
            <i /><i /><i />
          </span>
          <span class="skin-card__body">
            <b>{{ skin.name }}</b>
            <em>{{ skin.appName }}</em>
            <small>{{ skin.description }}</small>
          </span>
          <AppIcon v-if="skinStore.activeSkin === skin.id" name="check" :size="15" class="skin-card__check" />
        </button>
      </div>

      <footer class="sheet__foot">
        <span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> 快速打开</span>
        <span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> 立即切换到工作台</span>
      </footer>
    </div>
  </div>
</template>
