<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title: string
    text: string
    confirmLabel?: string
  }>(),
  { confirmLabel: '确认' },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div v-if="open" class="drill__overlay" role="dialog" aria-modal="true" :aria-label="title">
    <div class="drill__modal drill__modal--confirm">
      <header class="drill__modal-head">
        <b>{{ title }}</b>
      </header>
      <p class="drill__confirm-text">{{ text }}</p>
      <div class="drill__report-actions">
        <button type="button" class="drill__ghost" @click="emit('cancel')">取消</button>
        <button type="button" class="drill__primary" @click="emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>
