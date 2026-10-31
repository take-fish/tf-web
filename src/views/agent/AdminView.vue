<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  fetchAdminStats,
  listToolCalls,
  listToolConfigs,
  updateToolConfig,
  type AdminStats,
  type ToolCallRow,
  type ToolConfigRow,
} from '@/api/agent'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { formatApiError } from '@/lib/http'

defineOptions({ name: 'AgentAdminView' })

type Tab = 'stats' | 'calls' | 'tools'

const tab = ref<Tab>('stats')
const stats = ref<AdminStats | null>(null)
const calls = ref<ToolCallRow[]>([])
const total = ref(0)
const tools = ref<ToolConfigRow[]>([])
const filterTool = ref('')
const onlyFailed = ref(false)
const error = ref('')
const loading = ref(false)

async function loadStats() {
  try {
    stats.value = (await fetchAdminStats()).data
  } catch (err) {
    error.value = formatApiError(err, '统计加载失败')
  }
}

async function loadCalls() {
  loading.value = true
  try {
    const result = await listToolCalls({ limit: 100, tool: filterTool.value, onlyFailed: onlyFailed.value })
    calls.value = result.data.items
    total.value = result.data.total
  } catch (err) {
    error.value = formatApiError(err, '调用流水加载失败')
  } finally {
    loading.value = false
  }
}

async function loadTools() {
  try {
    tools.value = (await listToolConfigs()).data
  } catch (err) {
    error.value = formatApiError(err, '工具配置加载失败')
  }
}

async function toggleTool(tool: ToolConfigRow) {
  try {
    await updateToolConfig(tool.name, { enabled: !tool.enabled })
    tool.enabled = !tool.enabled
  } catch (err) {
    error.value = formatApiError(err, '保存失败')
  }
}

async function changeTimeout(tool: ToolConfigRow, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  try {
    await updateToolConfig(tool.name, { timeout_ms: value })
    tool.timeout_ms = value
  } catch (err) {
    error.value = formatApiError(err, '保存失败')
  }
}

async function selectTab(next: Tab) {
  tab.value = next
  error.value = ''
  if (next === 'stats') await loadStats()
  if (next === 'calls') await loadCalls()
  if (next === 'tools') await loadTools()
}

function fmtTime(value: string | null) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function loadAll() {
  error.value = ''
  if (tab.value === 'stats') await loadStats()
  else if (tab.value === 'calls') await loadCalls()
  else await loadTools()
}

onMounted(loadStats)
</script>

<template>
  <section class="admin">
    <header class="admin__head">
      <h2>Agent 管理台</h2>
      <nav class="admin__tabs">
        <button :class="{ 'is-active': tab === 'stats' }" @click="selectTab('stats')">概览</button>
        <button :class="{ 'is-active': tab === 'calls' }" @click="selectTab('calls')">工具调用流水</button>
        <button :class="{ 'is-active': tab === 'tools' }" @click="selectTab('tools')">工具配置</button>
      </nav>
    </header>

    <ErrorBanner v-if="error" :message="error" retryable @retry="loadAll" @close="error = ''" />

    <div v-if="tab === 'stats'" class="admin__stats">
      <div class="stat">
        <span class="stat__label">工具调用总数</span>
        <strong>{{ stats?.total_calls ?? '-' }}</strong>
      </div>
      <div class="stat">
        <span class="stat__label">失败次数</span>
        <strong class="stat__warn">{{ stats?.failed_calls ?? '-' }}</strong>
      </div>
      <div class="stat">
        <span class="stat__label">会话数</span>
        <strong>{{ stats?.sessions ?? '-' }}</strong>
      </div>
      <div class="stat stat--wide">
        <span class="stat__label">按工具分布</span>
        <ul class="stat__list">
          <li v-for="(count, name) in stats?.by_tool ?? {}" :key="name">
            <code>{{ name }}</code><span>{{ count }}</span>
          </li>
          <li v-if="!stats?.by_tool || Object.keys(stats.by_tool).length === 0" class="stat__empty">暂无数据</li>
        </ul>
      </div>
    </div>

    <div v-if="tab === 'calls'" class="admin__calls">
      <div class="admin__filters">
        <input v-model="filterTool" placeholder="按工具名过滤，例如 search_logs" @keydown.enter="loadCalls" />
        <label class="checkbox"><input v-model="onlyFailed" type="checkbox" @change="loadCalls" /> 只看失败</label>
        <button class="btn" :disabled="loading" @click="loadCalls">刷新</button>
        <span class="admin__total">共 {{ total }} 条</span>
      </div>
      <table class="admin__table">
        <thead>
          <tr>
            <th>时间</th>
            <th>工具</th>
            <th>环境</th>
            <th>用户</th>
            <th>参数摘要</th>
            <th>行数</th>
            <th>耗时</th>
            <th>结果</th>
            <th>trace</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in calls" :key="row.id">
            <td>{{ fmtTime(row.created_at) }}</td>
            <td><code>{{ row.tool }}</code></td>
            <td>{{ row.env }}</td>
            <td>{{ row.user_id }}</td>
            <td class="admin__digest" :title="row.args_digest">{{ row.args_digest }}</td>
            <td>{{ row.rows_affected ?? '-' }}</td>
            <td>{{ row.ms }}ms</td>
            <td>
              <span :class="row.ok ? 'ok' : 'fail'">{{ row.ok ? '成功' : '失败' }}</span>
              <span v-if="row.need_confirm" class="admin__confirm">需确认</span>
            </td>
            <td><code class="admin__trace">{{ row.trace_id }}</code></td>
          </tr>
          <tr v-if="!calls.length">
            <td colspan="9" class="admin__empty">暂无记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tab === 'tools'" class="admin__tools">
      <table class="admin__table">
        <thead>
          <tr>
            <th>工具</th>
            <th>类型</th>
            <th>启用</th>
            <th>超时（ms）</th>
            <th>允许角色</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tool in tools" :key="tool.name">
            <td><code>{{ tool.name }}</code></td>
            <td>{{ tool.read_only ? '只读' : '写操作' }}</td>
            <td>
              <input type="checkbox" :checked="tool.enabled" @change="toggleTool(tool)" />
            </td>
            <td>
              <input
                class="admin__num"
                type="number"
                :value="tool.timeout_ms"
                min="1000"
                max="120000"
                step="1000"
                @change="changeTimeout(tool, $event)"
              />
            </td>
            <td>{{ tool.roles.join(', ') }}</td>
            <td class="admin__desc">{{ tool.description }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.admin {
  padding: 18px 22px;
  height: 100%;
  overflow-y: auto;
  background: var(--fm-bg, #1e1e1e);
  color: var(--fm-fg, #d4d4d4);
}

.admin__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.admin__head h2 {
  margin: 0;
  font-size: 16px;
}

.admin__tabs {
  display: flex;
  gap: 4px;
}

.admin__tabs button {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #8b949e;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.admin__tabs button.is-active {
  color: #fff;
  background: #0e639c;
  border-color: #1177bb;
}

.admin__error {
  color: #f85149;
  font-size: 12px;
}

.admin__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat {
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  padding: 14px 16px;
  background: #252526;
}

.stat--wide {
  grid-column: 1 / -1;
}

.stat__label {
  display: block;
  font-size: 12px;
  color: #8b949e;
  margin-bottom: 8px;
}

.stat strong {
  font-size: 24px;
  font-weight: 600;
}

.stat__warn {
  color: #d29922;
}

.stat__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  font-size: 12px;
}

.stat__list li {
  display: flex;
  gap: 6px;
  align-items: center;
}

.stat__empty {
  color: #8b949e;
}

.admin__filters {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.admin__filters input[type='text'],
.admin__filters > input {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 6px 10px;
  font-size: 12px;
  min-width: 240px;
}

.checkbox {
  font-size: 12px;
  color: #8b949e;
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn {
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: inherit;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.admin__total {
  margin-left: auto;
  color: #8b949e;
  font-size: 12px;
}

.admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.admin__table th,
.admin__table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #2d2d30;
  vertical-align: top;
}

.admin__table th {
  color: #8b949e;
  font-weight: 500;
}

.admin__digest {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #9cdcfe;
}

.admin__trace {
  color: #6e7681;
}

.admin__confirm {
  margin-left: 6px;
  color: #d29922;
  font-size: 11px;
}

.ok {
  color: #3fb950;
}

.fail {
  color: #f85149;
}

.admin__empty {
  text-align: center;
  color: #8b949e;
  padding: 20px 0;
}

.admin__num {
  width: 90px;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: inherit;
  padding: 3px 6px;
  font-size: 12px;
}

.admin__desc {
  color: #8b949e;
  max-width: 360px;
}
</style>
