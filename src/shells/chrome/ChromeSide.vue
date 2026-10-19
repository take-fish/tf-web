<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import ModuleNav from '@/components/ModuleNav.vue'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'

const skinStore = useSkinStore()
const identity = useIdentityStore()
const skin = computed(() => skinStore.effectiveSkin)
const host = computed(() => identity.nodeName)

const IDE_ACTIVITY = [
  { icon: 'file', title: '资源管理器' },
  { icon: 'search', title: '搜索' },
  { icon: 'overview', title: '源代码管理' },
  { icon: 'play', title: '运行和调试' },
  { icon: 'activity', title: '扩展' },
] as const

const FAKE_LOGS = [
  ['INFO', 'node sync completed', '16:28'],
  ['INFO', 'config reloaded', '16:21'],
  ['WARN', 'queue latency 312ms', '15:57'],
  ['INFO', 'healthcheck ok', '15:44'],
] as const
</script>

<template>
  <aside class="chrome-side" :class="`chrome-side--${skin}`">
    <template v-if="skin === 'ide'">
      <div class="ide-activity">
        <button
          v-for="item in IDE_ACTIVITY"
          :key="item.title"
          class="ide-activity__btn"
          :class="{ 'is-active': item.icon === 'file' }"
          :title="item.title"
        >
          <AppIcon :name="item.icon" :size="19" />
        </button>
        <span class="ide-activity__spacer" />
        <button class="ide-activity__btn" title="账户">
          <AppIcon name="user" :size="18" />
        </button>
        <button class="ide-activity__btn" title="设置">
          <AppIcon name="settings" :size="18" />
        </button>
      </div>
      <div class="ide-explorer">
        <div class="ide-explorer__head">
          <span>资源管理器</span>
          <span class="ide-explorer__actions">⋯</span>
        </div>
        <div class="ide-project">
          <AppIcon name="chevron" :size="12" class="is-open" />
          <span>FISHMATRIX-API</span>
        </div>
        <ModuleNav variant="explorer" />
        <div class="ide-explorer__section">大纲</div>
        <div class="ide-outline">
          <span>▸ services</span>
          <span>▸ controllers</span>
          <span>▸ repositories</span>
        </div>
        <div class="ide-explorer__section">时间线</div>
        <div class="ide-timeline">
          <span><b>16:28</b> chore: refresh service registry</span>
          <span><b>15:51</b> feat: update metric pipeline</span>
          <span><b>15:12</b> fix: retry gateway handshake</span>
        </div>
      </div>
    </template>

    <template v-else-if="skin === 'grafana'">
      <div class="side-head">
        <div class="side-search">
          <AppIcon name="search" :size="13" />
          <span>搜索仪表盘</span>
        </div>
      </div>
      <div class="side-section-label">工作区</div>
      <ModuleNav />
      <div class="side-section-label">仪表盘</div>
      <div class="side-list">
        <span class="is-active">FishMatrix Metrics</span>
        <span>Node Exporter</span>
        <span>Service Mesh</span>
        <span>Build Analytics</span>
        <span>Log Volume</span>
      </div>
      <div class="side-section-label">最近</div>
      <div class="side-list side-list--dim">
        <span>API Latency</span>
        <span>Redis Overview</span>
      </div>
    </template>

    <template v-else-if="skin === 'swagger'">
      <div class="side-head side-head--swagger">
        <span class="swagger-title">FishMatrix Internal API</span>
        <span class="swagger-version">OAS 3.0</span>
        <span class="swagger-server">http://devops-workspace.internal</span>
      </div>
      <ModuleNav />
      <div class="side-section-label">服务</div>
      <div class="side-list side-list--api">
        <span><b class="method method--get">GET</b> /chat/health</span>
        <span><b class="method method--get">GET</b> /reader/books</span>
        <span><b class="method method--get">GET</b> /game/leaderboard</span>
        <span><b class="method method--post">POST</b> /music/records</span>
      </div>
    </template>

    <template v-else-if="skin === 'jenkins'">
      <div class="side-head">
        <span class="jenkins-side-title">构建队列</span>
        <span class="jenkins-badge">2</span>
      </div>
      <div class="side-list side-list--queue">
        <span>▶ fishmatrix-api #128</span>
        <span class="is-dim">◷ tf-web #86</span>
      </div>
      <div class="side-section-label">任务</div>
      <ModuleNav />
      <div class="side-section-label">节点</div>
      <div class="side-list side-list--dim">
        <span>built-in (2/4 执行器)</span>
        <span>{{ host }} (在线)</span>
      </div>
    </template>

    <template v-else-if="skin === 'kibana'">
      <div class="side-head side-head--kibana">
        <AppIcon name="search" :size="13" />
        <span>发现</span>
      </div>
      <ModuleNav />
      <div class="side-section-label">已保存搜索</div>
      <div class="side-list">
        <span class="is-active">FishMatrix: errors</span>
        <span>Gateway: 5xx</span>
        <span>P2P: handshake</span>
      </div>
      <div class="side-section-label">日志流</div>
      <div class="kibana-streams">
        <span v-for="line in FAKE_LOGS" :key="`${line[0]}-${line[2]}`" class="kibana-stream">
          <i :class="`level-${line[0].toLowerCase()}`">{{ line[0] }}</i>
          <em>{{ line[1] }}</em>
          <time>{{ line[2] }}</time>
        </span>
      </div>
    </template>
  </aside>
</template>
