<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    playable?: boolean
    active?: boolean
  }>(),
  { subtitle: '', playable: false, active: false },
)

const emit = defineEmits<{ launch: [] }>()
</script>

<template>
  <section class="game-panel" :class="{ 'is-active': active }">
    <header class="game-panel__head">
      <div class="game-panel__title">
        <span class="game-panel__dot" />
        <b>{{ title }}</b>
        <span v-if="subtitle" class="game-panel__sub">{{ subtitle }}</span>
      </div>
      <div class="game-panel__actions">
        <span class="game-panel__status">LIVE · 30s</span>
        <button
          v-if="playable"
          class="game-panel__launch"
          @click="emit('launch')"
        >
          <AppIcon name="play" :size="10" />
          启动演练
        </button>
        <span v-else class="game-panel__pending">采集任务待接入</span>
      </div>
    </header>
    <div class="game-panel__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.game-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: var(--fm-panel);
}

.game-panel.is-active {
  border-color: var(--fm-accent);
}

.game-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--fm-border);
}

.game-panel__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 11px;
}

.game-panel__title b {
  overflow: hidden;
  color: var(--fm-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-panel__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--fm-ok);
}

.game-panel__sub {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.game-panel__status {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
}

.game-panel__launch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 21px;
  padding: 0 8px;
  border: 1px solid var(--fm-accent);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-accent);
  font-size: 9px;
  cursor: pointer;
}

.game-panel__launch:hover {
  background: var(--fm-accent-soft);
}

.game-panel__pending {
  color: var(--fm-text-muted);
  font-size: 8.5px;
}

.game-panel__body {
  flex: 1;
  min-height: 0;
  padding: 6px 8px 8px;
}
</style>
