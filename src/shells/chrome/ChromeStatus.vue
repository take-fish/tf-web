<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'

const skinStore = useSkinStore()
const identity = useIdentityStore()
const skin = computed(() => skinStore.effectiveSkin)
const host = computed(() => identity.nodeName)

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const clock = computed(() =>
  now.value.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
)
</script>

<template>
  <footer class="chrome-status" :class="`chrome-status--${skin}`">
    <template v-if="skin === 'ide'">
      <span class="status-branch">
        <span class="status-icon">⑂</span> main*
        <span class="status-sync">⟳</span>
      </span>
      <span>⊗ 0</span>
      <span>△ 2</span>
      <span class="status-spacer" />
      <span>Ln {{ 20 + (now.getSeconds() % 40) }}, Col {{ 1 + (now.getSeconds() % 30) }}</span>
      <span>UTF-8</span>
      <span>Java</span>
      <span>fishmatrix-api</span>
      <span class="status-ok">● 已连接</span>
    </template>

    <template v-else-if="skin === 'terminal'">
      <span class="tmux-window">[0] bash*</span>
      <span class="tmux-window">[1] {{ host }}</span>
      <span class="tmux-window tmux-window--dim">[2] logs</span>
      <span class="status-spacer" />
      <span>{{ identity.state.nickname }}@{{ host }}</span>
      <span>UTF-8</span>
      <span>{{ clock }}</span>
    </template>

    <template v-else-if="skin === 'grafana'">
      <span>Grafana v11.2.0 (commit 7a9d1c2)</span>
      <span>最后刷新 {{ clock }}</span>
      <span class="status-spacer" />
      <span>时间范围: 最近 6 小时</span>
      <span>刷新: 30s</span>
    </template>

    <template v-else-if="skin === 'swagger'">
      <span>OAS 3.0</span>
      <span>服务器: http://devops-workspace.internal</span>
      <span class="status-spacer" />
      <span class="status-ok">● 已授权</span>
      <span>FishMatrix Internal API</span>
      <span>{{ clock }}</span>
    </template>

    <template v-else-if="skin === 'jenkins'">
      <span>
        <AppIcon name="build" :size="12" />
        构建 #128
      </span>
      <span>执行器 2/4</span>
      <span>Java 17</span>
      <span class="status-spacer" />
      <span class="status-ok">● 构建成功</span>
      <span>{{ host }}</span>
      <span>{{ clock }}</span>
    </template>

    <template v-else>
      <span>Discover</span>
      <span>1,248 条命中</span>
      <span>刷新已关闭</span>
      <span class="status-spacer" />
      <span>时间: 最近 15 分钟</span>
      <span>{{ clock }}</span>
    </template>
  </footer>
</template>
