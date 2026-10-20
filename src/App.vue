<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import AppShell from '@/shells/AppShell.vue'

const route = useRoute()
const blank = computed(() => route.meta.blank === true)
</script>

<template>
  <RouterView v-if="blank" />
  <AppShell v-else />
</template>
