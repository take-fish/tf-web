<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { moduleByPath } from '@/modules/registry'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'
import { useTournamentStore } from '@/stores/tournament'

const emit = defineEmits<{ settings: []; skins: []; tournament: [] }>()

const route = useRoute()
const skinStore = useSkinStore()
const identity = useIdentityStore()
const tournament = useTournamentStore()

const skin = computed(() => skinStore.effectiveSkin)
const module = computed(() => moduleByPath(route.path))
const identityLabel = computed(() => identity.state.nickname)
const hostLabel = computed(() => identity.nodeName)

const IDE_MENUS = ['文件', '编辑', '选择', '查看', '转到', '运行', '终端', '帮助']
const TERMINAL_MENUS = ['文件', '会话', '查看', '工具', '窗口', '帮助']
</script>

<template>
  <header class="chrome-top" :class="`chrome-top--${skin}`">
    <template v-if="skin === 'ide'">
      <div class="ide-menubar">
        <span class="ide-brand">
          <span class="ide-brand__mark">⌘</span>
          fishmatrix-api
        </span>
        <span v-for="menu in IDE_MENUS" :key="menu" class="ide-menu">{{ menu }}</span>
      </div>
      <div class="ide-commandbar">
        <div class="ide-search">
          <AppIcon name="search" :size="13" />
          <span>搜索文件、符号与命令</span>
          <kbd>Ctrl+K</kbd>
        </div>
        <div class="ide-commandbar__right">
          <span class="ide-profile">{{ identityLabel }}</span>
          <button class="chrome-icon-btn" title="设置" @click="emit('settings')">
            <AppIcon name="settings" :size="14" />
          </button>
          <button class="chrome-icon-btn" title="切换视图主题" @click="emit('skins')">
            <AppIcon name="shield" :size="14" />
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="skin === 'terminal'">
      <div class="term-titlebar">
        <span class="term-logo">Xshell 7</span>
        <span class="term-title">
          {{ hostLabel }} — {{ module.disguiseLabel }} — ssh
        </span>
        <div class="window-controls" aria-hidden="true">
          <span>—</span><span>▢</span><span>×</span>
        </div>
      </div>
      <div class="term-menubar">
        <span v-for="menu in TERMINAL_MENUS" :key="menu">{{ menu }}</span>
        <span class="term-menubar__spacer" />
        <span class="term-session">{{ identityLabel }}@{{ hostLabel }}</span>
        <button class="chrome-icon-btn" title="设置" @click="emit('settings')">
          <AppIcon name="settings" :size="14" />
        </button>
        <button class="chrome-icon-btn" title="切换视图主题" @click="emit('skins')">
          <AppIcon name="shield" :size="14" />
        </button>
      </div>
    </template>

    <template v-else-if="skin === 'grafana'">
      <div class="grafana-top">
        <span class="grafana-logo">G</span>
        <nav class="grafana-nav">
          <span class="is-active">仪表盘</span>
          <span>探索</span>
          <span>告警</span>
          <button
            type="button"
            class="grafana-nav__action"
            :class="{ 'has-invite': tournament.pendingInvitationCount > 0 }"
            title="连接：进入热力五子棋赛事大厅"
            @click="emit('tournament')"
          >
            <span class="grafana-nav__dot" :class="{ 'is-online': tournament.connected }" />
            连接
            <em v-if="tournament.pendingInvitationCount > 0">
              {{ tournament.pendingInvitationCount > 9 ? '9+' : tournament.pendingInvitationCount }}
            </em>
          </button>
          <span>管理</span>
        </nav>
        <div class="grafana-crumbs">
          <span>仪表盘</span>
          <AppIcon name="chevron" :size="12" />
          <span>FishMatrix Metrics</span>
        </div>
        <div class="chrome-top__actions">
          <span class="chrome-pill">最近 6 小时</span>
          <span class="chrome-pill chrome-pill--quiet">刷新 30s</span>
          <button class="chrome-icon-btn" title="设置" @click="emit('settings')">
            <AppIcon name="settings" :size="14" />
          </button>
          <button class="chrome-icon-btn" title="切换仪表盘" @click="emit('skins')">
            <AppIcon name="shield" :size="14" />
          </button>
          <span class="chrome-avatar">{{ identityLabel.slice(0, 1).toUpperCase() }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="skin === 'swagger'">
      <div class="swagger-top">
        <span class="swagger-brand"><span>swagger</span> UI</span>
        <div class="swagger-url">
          <span>https://devops-workspace.internal/api/v1/openapi.json</span>
          <span class="swagger-url__explore">探索</span>
        </div>
        <div class="chrome-top__actions">
          <span class="swagger-auth">Authorize</span>
          <button class="chrome-icon-btn" title="设置" @click="emit('settings')">
            <AppIcon name="settings" :size="14" />
          </button>
          <button class="chrome-icon-btn" title="切换文档主题" @click="emit('skins')">
            <AppIcon name="shield" :size="14" />
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="skin === 'jenkins'">
      <div class="jenkins-top">
        <span class="jenkins-brand">
          <span class="jenkins-brand__mark">J</span>
          Jenkins
        </span>
        <nav class="jenkins-nav">
          <span class="is-active">仪表盘</span>
          <span>构建队列</span>
          <span>流水线</span>
          <span>管理</span>
        </nav>
        <div class="jenkins-search">
          <AppIcon name="search" :size="13" />
          <span>搜索任务与构建</span>
        </div>
        <div class="chrome-top__actions">
          <span class="jenkins-build">构建队列 2</span>
          <button class="chrome-icon-btn" title="设置" @click="emit('settings')">
            <AppIcon name="settings" :size="14" />
          </button>
          <button class="chrome-icon-btn" title="切换流水线" @click="emit('skins')">
            <AppIcon name="shield" :size="14" />
          </button>
          <span class="chrome-avatar chrome-avatar--light">{{ identityLabel.slice(0, 1) }}</span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="kibana-top">
        <span class="kibana-brand">
          <AppIcon name="menu" :size="15" />
          <span class="kibana-logo">kibana</span>
        </span>
        <nav class="kibana-nav">
          <span>发现</span>
          <span>仪表盘</span>
          <span>可视化</span>
          <span>告警</span>
        </nav>
        <div class="kibana-search">
          <AppIcon name="search" :size="13" />
          <span>搜索字段或输入查询</span>
        </div>
        <div class="chrome-top__actions">
          <span class="chrome-pill">最近 15 分钟</span>
          <button class="chrome-icon-btn" title="设置" @click="emit('settings')">
            <AppIcon name="settings" :size="14" />
          </button>
          <button class="chrome-icon-btn" title="切换检索视图" @click="emit('skins')">
            <AppIcon name="shield" :size="14" />
          </button>
          <span class="chrome-avatar">{{ identityLabel.slice(0, 1).toUpperCase() }}</span>
        </div>
      </div>
    </template>
  </header>
</template>
