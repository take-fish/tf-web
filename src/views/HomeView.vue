<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { MODULES } from '@/modules/registry'

const lastUpdated = ref(new Date())

const refresh = () => {
  lastUpdated.value = new Date()
}

const updatedLabel = computed(() =>
  lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false }),
)

const METRICS = [
  { label: '节点在线', value: '12 / 12', trend: '稳定', tone: 'ok' },
  { label: '请求速率', value: '1,284 req/s', trend: '+3.2%', tone: 'ok' },
  { label: 'P95 延迟', value: '86 ms', trend: '-4 ms', tone: 'ok' },
  { label: '错误率', value: '0.02%', trend: '正常', tone: 'ok' },
] as const

const DEPLOYS = [
  { service: 'fishmatrix-api', version: 'v0.8.4', detail: '构建成功 · 2 个实例', time: '2 分钟前', tone: 'ok' },
  { service: 'tf-web', version: 'v0.2.1', detail: '发布完成 · 镜像已同步', time: '18 分钟前', tone: 'ok' },
  { service: 'tf-chat', version: 'v0.1.4', detail: '滚动重启 · 健康检查通过', time: '1 小时前', tone: 'ok' },
  { service: 'tf-reader', version: 'v0.1.4', detail: '配置变更 · 已生效', time: '3 小时前', tone: 'idle' },
] as const

const RESOURCES = [
  { label: 'CPU', value: 34, detail: '16 cores' },
  { label: '内存', value: 61, detail: '38.2 / 64 GB' },
  { label: '磁盘', value: 48, detail: '1.9 / 4 TB' },
  { label: '网络', value: 12, detail: '126 MB/s' },
] as const

const VERSIONS: Record<string, string> = {
  overview: 'v0.1.1',
  chat: 'v0.1.4',
  reader: 'v0.1.4',
  games: 'v0.1.4',
  music: 'v0.1.4',
}

const LATENCIES: Record<string, string> = {
  overview: '12 ms',
  chat: '24 ms',
  reader: '31 ms',
  games: '18 ms',
  music: '27 ms',
}
</script>

<template>
  <div class="home">
    <header class="home-head">
      <div>
        <div class="eyebrow">FISHMATRIX / OVERVIEW</div>
        <h1>服务实例</h1>
        <p>集群 fishmatrix-prod · 5 个服务实例 · 全部健康</p>
      </div>
      <div class="home-head__actions">
        <span class="env-badge"><i class="dot dot--ok" /> 生产环境</span>
        <button class="ghost-button" @click="refresh">
          <AppIcon name="refresh" :size="14" />
          刷新
        </button>
        <span class="home-updated">更新于 {{ updatedLabel }}</span>
      </div>
    </header>

    <div class="metric-strip">
      <div v-for="metric in METRICS" :key="metric.label" class="metric-item">
        <span class="metric-item__label">{{ metric.label }}</span>
        <b>{{ metric.value }}</b>
        <em :class="`tone-${metric.tone}`">{{ metric.trend }}</em>
      </div>
    </div>

    <section class="home-section">
      <div class="section-head">
        <h2>服务实例</h2>
        <span>命名空间 fishmatrix · 采集间隔 30s</span>
      </div>
      <div class="service-grid">
        <RouterLink v-for="item in MODULES" :key="item.id" :to="item.path" class="service-card">
          <div class="service-card__head">
            <span class="service-card__icon"><AppIcon :name="item.icon" :size="18" /></span>
            <span class="status-chip status-chip--ok"><i class="dot dot--ok" /> Running</span>
          </div>
          <div class="service-card__name">
            <b>{{ item.service }}</b>
            <span>:{{ item.port }}</span>
          </div>
          <p>{{ item.description }}</p>
          <div class="service-card__meta">
            <span>{{ VERSIONS[item.id] ?? 'v0.1.0' }}</span>
            <span>{{ LATENCIES[item.id] ?? '—' }}</span>
            <span class="service-card__open">
              打开 <AppIcon name="chevron" :size="12" />
            </span>
          </div>
        </RouterLink>
      </div>
    </section>

    <div class="home-columns">
      <section class="home-section home-section--panel">
        <div class="section-head">
          <h2>最近部署</h2>
          <span>流水线事件</span>
        </div>
        <div class="deploy-list">
          <div v-for="item in DEPLOYS" :key="`${item.service}-${item.version}`" class="deploy-row">
            <span class="deploy-row__dot" :class="`tone-${item.tone}`" />
            <div class="deploy-row__body">
              <b>{{ item.service }} <em>{{ item.version }}</em></b>
              <span>{{ item.detail }}</span>
            </div>
            <time>{{ item.time }}</time>
          </div>
        </div>
      </section>

      <section class="home-section home-section--panel">
        <div class="section-head">
          <h2>资源使用</h2>
          <span>节点 dev-node-01</span>
        </div>
        <div class="resource-list">
          <div v-for="item in RESOURCES" :key="item.label" class="resource-row">
            <div class="resource-row__label">
              <span>{{ item.label }}</span>
              <b>{{ item.value }}%</b>
            </div>
            <div class="resource-bar"><i :style="{ width: `${item.value}%` }" /></div>
            <span class="resource-row__detail">{{ item.detail }}</span>
          </div>
        </div>
      </section>
    </div>

    <footer class="home-foot">
      <span>整体状态：<b class="tone-ok">所有系统运行正常</b></span>
      <span class="home-foot__spacer" />
      <span>Nacos 服务发现正常</span>
      <span>配置版本 7f3c9a2</span>
      <span>构建 #128</span>
    </footer>
  </div>
</template>
