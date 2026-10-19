<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import ModuleNav from '@/components/ModuleNav.vue'
import { moduleByPath } from '@/modules/registry'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'

const route = useRoute()
const skinStore = useSkinStore()
const identity = useIdentityStore()

const skin = computed(() => skinStore.effectiveSkin)
const module = computed(() => moduleByPath(route.path))
const host = computed(() => identity.nodeName)
const breadcrumbs = computed(() => {
  const item = module.value
  if (item.id === 'overview') return ['fishmatrix-api', 'src', 'main']
  if (item.id === 'chat') return ['/opt/chat/group', 'dev-group']
  if (item.id === 'reader') return ['src/main/java', 'com/fishmatrix/reader', 'ReaderService.java']
  if (item.id === 'games') return ['Dashboards', 'FishMatrix', 'Overview']
  return ['Pipelines', 'fishmatrix-api', '#128']
})
</script>

<template>
  <div class="chrome-tabs" :class="`chrome-tabs--${skin}`">
    <template v-if="skin === 'ide'">
      <div class="ide-tabstrip">
        <ModuleNav variant="tabs" />
        <span class="ide-tabstrip__spacer" />
        <span class="ide-tabstrip__hint">Ctrl+Shift+F</span>
      </div>
      <div class="breadcrumbs">
        <template v-for="(crumb, index) in breadcrumbs" :key="`${crumb}-${index}`">
          <span>{{ crumb }}</span>
          <AppIcon v-if="index < breadcrumbs.length - 1" name="chevron" :size="11" />
        </template>
      </div>
    </template>

    <template v-else-if="skin === 'terminal'">
      <div class="terminal-tabs">
        <ModuleNav variant="tabs" />
        <button class="terminal-tab-add" title="新建终端">+</button>
        <span class="terminal-tabs__spacer" />
        <span class="terminal-connection">
          <i class="dot dot--ok" />
          {{ identity.state.nickname }}@{{ host }}
        </span>
      </div>
    </template>

    <template v-else-if="skin === 'grafana'">
      <div class="grafana-tabs">
        <div class="breadcrumbs breadcrumbs--grafana">
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb">
            <span>{{ crumb }}</span>
            <AppIcon v-if="index < breadcrumbs.length - 1" name="chevron" :size="11" />
          </template>
        </div>
        <span class="grafana-tabs__title">核心指标概览</span>
        <div class="grafana-tabs__actions">
          <span class="chrome-pill">自动刷新 30s</span>
          <AppIcon name="refresh" :size="14" />
        </div>
      </div>
    </template>

    <template v-else-if="skin === 'swagger'">
      <div class="swagger-tabs">
        <span class="swagger-method">GET</span>
        <span class="swagger-path">/api/v1/{{ module.id }}/health</span>
        <span class="swagger-tag">{{ module.disguiseLabel }}</span>
        <span class="swagger-tabs__spacer" />
        <span class="swagger-status">200 正常</span>
      </div>
    </template>

    <template v-else-if="skin === 'jenkins'">
      <div class="jenkins-tabs">
        <div class="breadcrumbs breadcrumbs--jenkins">
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb">
            <span>{{ crumb }}</span>
            <AppIcon v-if="index < breadcrumbs.length - 1" name="chevron" :size="11" />
          </template>
        </div>
        <span class="jenkins-tabs__status">
          <i class="dot dot--ok" />
          构建成功
        </span>
        <span class="jenkins-tabs__spacer" />
        <span class="jenkins-tabs__stat">JAVA 17</span>
        <span class="jenkins-tabs__stat">maven-3.9</span>
      </div>
    </template>

    <template v-else>
      <div class="kibana-tabs">
        <div class="kibana-tabs__left">
          <AppIcon name="file" :size="13" />
          <span>发现</span>
          <span class="kibana-saved">已保存搜索: FishMatrix: errors</span>
        </div>
        <span class="kibana-tabs__spacer" />
        <span class="kibana-tabs__hits">1,248 条记录</span>
      </div>
    </template>
  </div>
</template>
