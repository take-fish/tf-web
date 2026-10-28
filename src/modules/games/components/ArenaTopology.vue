<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type {
  GameArenaAction,
  TopologyEdge,
  TopologyNode,
  TopologyState,
} from '@/types/games'

const props = defineProps<{
  state: TopologyState
  selfUserId: string
  playerNames: Record<string, string>
  interactive: boolean
}>()

const emit = defineEmits<{ action: [action: GameArenaAction] }>()

type TopologyRole = 'ATTACK' | 'DEFEND' | 'VIEW'

const NODE_POS: Record<string, { x: number; y: number }> = {
  gateway: { x: 480, y: 56 },
  web: { x: 80, y: 230 },
  user: { x: 240, y: 230 },
  game: { x: 400, y: 230 },
  chat: { x: 560, y: 230 },
  reader: { x: 720, y: 230 },
  music: { x: 880, y: 230 },
  mysql: { x: 260, y: 398 },
  redis: { x: 480, y: 398 },
  nacos: { x: 700, y: 398 },
}

const NODE_WIDTH = 108
const NODE_HEIGHT = 54

const now = ref(Date.now())
const selected = ref('')
let clockTimer: ReturnType<typeof setInterval> | undefined

const selfId = computed(() => props.selfUserId)
const opponentId = computed(() => {
  const peer =
    props.state.attackerUserId === selfId.value
      ? props.state.defenderUserId
      : props.state.attackerUserId
  return peer ?? props.state.players.find((player) => player !== selfId.value) ?? ''
})
const role = computed<TopologyRole>(() => {
  if (props.state.attackerUserId === selfId.value) return 'ATTACK'
  if (props.state.defenderUserId === selfId.value) return 'DEFEND'
  return 'VIEW'
})
const roleLabel = computed(() => {
  if (role.value === 'ATTACK') return '故障注入方'
  if (role.value === 'DEFEND') return '稳态保障方'
  return '观战'
})
const remaining = computed(() =>
  Math.max(0, Math.ceil((props.state.endsAt - now.value) / 1000)),
)
const gateway = computed(() => props.state.nodes.find((node) => node.id === 'gateway'))
const resource = computed(() =>
  role.value === 'ATTACK'
    ? Math.floor(props.state.energy[selfId.value] ?? 0)
    : Math.floor(props.state.credits[selfId.value] ?? 0),
)
const resourceLabel = computed(() => (role.value === 'ATTACK' ? '故障能量' : '保障配额'))
const overloadSeconds = computed(() => {
  if (!props.state.overloadedSince) return 0
  return Math.max(0, (now.value - props.state.overloadedSince) / 1000)
})
const selectedNode = computed<TopologyNode | null>(() => {
  if (!selected.value.startsWith('node:')) return null
  const id = selected.value.slice(5)
  return props.state.nodes.find((node) => node.id === id) ?? null
})
const selectedEdge = computed<TopologyEdge | null>(() => {
  if (!selected.value.startsWith('edge:')) return null
  const id = selected.value.slice(5)
  return props.state.edges.find((edge) => edge.id === id) ?? null
})
const routeEdges = computed(() =>
  props.state.edges.filter((edge) => edge.kind === 'ROUTE'),
)
const nonRouteEdges = computed(() =>
  props.state.edges.filter((edge) => edge.kind === 'DEPEND'),
)
const attackerWinning = computed(
  () => gateway.value != null && gateway.value.load >= gateway.value.capacity,
)

function nameOf(userId: string | null): string {
  if (!userId) return '未分配'
  return props.playerNames[userId] ?? userId
}

function position(nodeId: string): { x: number; y: number } {
  return NODE_POS[nodeId] ?? { x: 480, y: 230 }
}

function nodeTransform(node: TopologyNode): string {
  const spot = position(node.id)
  return `translate(${spot.x}, ${spot.y})`
}

function edgeStart(edge: TopologyEdge): { x: number; y: number } {
  const point = position(edge.from)
  return { x: point.x, y: point.y + NODE_HEIGHT / 2 }
}

function edgeEnd(edge: TopologyEdge): { x: number; y: number } {
  const point = position(edge.to)
  return { x: point.x, y: point.y - NODE_HEIGHT / 2 }
}

function edgeKey(edge: TopologyEdge): string {
  return `edge:${edge.id}`
}

function routeEdgeFor(node: TopologyNode | null): TopologyEdge | null {
  if (!node) return null
  return routeEdges.value.find((edge) => edge.from === node.id) ?? null
}

function selectNode(node: TopologyNode) {
  selected.value = selected.value === `node:${node.id}` ? '' : `node:${node.id}`
}

function selectEdge(edge: TopologyEdge) {
  selected.value = selected.value === edgeKey(edge) ? '' : edgeKey(edge)
}

function isSelectedNode(node: TopologyNode): boolean {
  return selected.value === `node:${node.id}`
}

function isSelectedEdge(edge: TopologyEdge): boolean {
  return selected.value === edgeKey(edge)
}

function kindLabel(kind: string): string {
  if (kind === 'CORE') return '核心'
  if (kind === 'MIDDLEWARE') return '中间件'
  return '服务'
}

function statusLabel(status: string): string {
  if (status === 'RED') return '过载'
  if (status === 'YELLOW') return '高压'
  return '正常'
}

function utilizationPercent(node: TopologyNode): number {
  return Math.round(node.utilization * 100)
}

function barWidth(node: TopologyNode): number {
  return Math.max(0, Math.min(1.2, node.utilization)) / 1.2 * 80
}

function cooldownLeft(key: string): number {
  const readyAt = props.state.cooldowns[`${selfId.value}|${key}`] ?? 0
  return Math.max(0, Math.ceil((readyAt - now.value) / 1000))
}

function attackCooldown(skill: 'traffic' | 'slow'): number {
  return cooldownLeft(`ATTACK|${skill}`)
}

function canTraffic(): boolean {
  const node = selectedNode.value
  return Boolean(
    props.interactive &&
      role.value === 'ATTACK' &&
      node &&
      node.kind !== 'MIDDLEWARE' &&
      attackCooldown('traffic') === 0 &&
      resource.value >= 15,
  )
}

function canSlow(): boolean {
  const node = selectedNode.value
  return Boolean(
    props.interactive &&
      role.value === 'ATTACK' &&
      node &&
      node.kind === 'SERVICE' &&
      attackCooldown('slow') === 0 &&
      resource.value >= 20,
  )
}

function canScale(): boolean {
  const node = selectedNode.value
  return Boolean(
    props.interactive &&
      role.value === 'DEFEND' &&
      node &&
      cooldownLeft(`SCALE|${node.id}`) === 0 &&
      resource.value >= 15,
  )
}

function canShift(): boolean {
  const edge = selectedEdge.value ?? routeEdgeFor(selectedNode.value)
  return Boolean(
    props.interactive &&
      role.value === 'DEFEND' &&
      edge &&
      edge.kind === 'ROUTE' &&
      cooldownLeft(`SHIFT|${edge.id}`) === 0 &&
      resource.value >= 12,
  )
}

function canThrottle(): boolean {
  const node = selectedNode.value
  return Boolean(
    props.interactive &&
      role.value === 'DEFEND' &&
      node &&
      node.kind !== 'MIDDLEWARE' &&
      cooldownLeft(`THROTTLE|${node.id}`) === 0 &&
      resource.value >= 25,
  )
}

function injectTraffic() {
  const node = selectedNode.value
  if (!node) return
  emit('action', { action: 'ATTACK', skill: 'traffic', target: node.id })
}

function injectSlow() {
  const node = selectedNode.value
  if (!node) return
  emit('action', { action: 'ATTACK', skill: 'slow', target: node.id })
}

function scale() {
  const node = selectedNode.value
  if (!node) return
  emit('action', { action: 'SCALE', target: node.id })
}

function shift() {
  const edge = selectedEdge.value ?? routeEdgeFor(selectedNode.value)
  if (!edge) return
  emit('action', { action: 'SHIFT', target: edge.id })
}

function throttle() {
  const node = selectedNode.value
  if (!node) return
  emit('action', { action: 'THROTTLE', target: node.id })
}

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 500)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <section class="topo" aria-label="混沌工程攻防演练">
    <header class="topo__hud">
      <div class="topo__role" :class="`is-${role.toLowerCase()}`">
        <span>{{ roleLabel }}</span>
        <b>{{ role === 'ATTACK' ? nameOf(state.attackerUserId) : role === 'DEFEND' ? nameOf(state.defenderUserId) : '只读' }}</b>
      </div>
      <div class="topo__hud-metric">
        <span class="topo__hud-label">{{ resourceLabel }}</span>
        <b>{{ resource }}</b>
      </div>
      <div class="topo__hud-metric" :class="{ 'is-danger': attackerWinning }">
        <span class="topo__hud-label">核心网关负载</span>
        <b>{{ gateway ? utilizationPercent(gateway) : 0 }}%</b>
      </div>
      <div class="topo__hud-metric" :class="{ 'is-danger': remaining <= 15 }">
        <span class="topo__hud-label">剩余时间</span>
        <b>{{ Math.floor(remaining / 60) }}:{{ String(remaining % 60).padStart(2, '0') }}</b>
      </div>
      <div class="topo__hud-opponent">
        <span>对手</span>
        <b>{{ nameOf(opponentId) }}</b>
      </div>
    </header>

    <div v-if="overloadSeconds > 0" class="topo__alarm">
      <span class="topo__alarm-dot" />
      核心网关过载 {{ overloadSeconds.toFixed(1) }}s / 3s，持续超载即判防守失败
    </div>

    <div class="topo__body">
      <div class="topo__map">
        <svg viewBox="0 0 960 452" role="img" aria-label="服务拓扑图">
          <g class="topo__links">
            <line
              v-for="edge in nonRouteEdges"
              :key="edge.id"
              :x1="edgeStart(edge).x"
              :y1="edgeStart(edge).y"
              :x2="edgeEnd(edge).x"
              :y2="edgeEnd(edge).y"
              class="topo__link is-depend"
            />
            <line
              v-for="edge in routeEdges"
              :key="edge.id"
              :x1="edgeStart(edge).x"
              :y1="edgeStart(edge).y"
              :x2="edgeEnd(edge).x"
              :y2="edgeEnd(edge).y"
              class="topo__link is-route"
              :class="{ 'is-shifted': edge.shifted, 'is-selected': isSelectedEdge(edge) }"
            />
          </g>
          <g class="topo__hit">
            <line
              v-for="edge in state.edges"
              :key="`hit-${edge.id}`"
              :x1="edgeStart(edge).x"
              :y1="edgeStart(edge).y"
              :x2="edgeEnd(edge).x"
              :y2="edgeEnd(edge).y"
              class="topo__link-hit"
              @click="selectEdge(edge)"
            />
          </g>
          <g
            v-for="node in state.nodes"
            :key="node.id"
            class="topo__node"
            :class="[`is-${node.status.toLowerCase()}`, { 'is-selected': isSelectedNode(node) }]"
            :transform="nodeTransform(node)"
            @click="selectNode(node)"
          >
            <rect
              class="topo__node-box"
              :x="-NODE_WIDTH / 2"
              :y="-NODE_HEIGHT / 2"
              :width="NODE_WIDTH"
              :height="NODE_HEIGHT"
              rx="3"
            />
            <text class="topo__node-label" y="-9">{{ node.label }}</text>
            <text class="topo__node-meta" y="5">
              {{ kindLabel(node.kind) }} · {{ statusLabel(node.status) }}
            </text>
            <rect class="topo__node-bar-bg" x="-40" y="14" width="80" height="3" rx="1.5" />
            <rect
              class="topo__node-bar"
              x="-40"
              y="14"
              :width="barWidth(node)"
              height="3"
              rx="1.5"
            />
            <text class="topo__node-util" y="26">{{ utilizationPercent(node) }}%</text>
          </g>
        </svg>
        <div class="topo__legend">
          <span><i class="is-green" />正常</span>
          <span><i class="is-yellow" />高压</span>
          <span><i class="is-red" />过载</span>
          <span><i class="is-route" />服务路由</span>
          <span><i class="is-depend" />依赖调用</span>
          <span>点击节点或连线选择目标</span>
        </div>
      </div>

      <aside class="topo__panel">
        <div class="topo__panel-head">
          <span>攻防操作</span>
          <em>{{ roleLabel }}</em>
        </div>

        <div class="topo__target">
          <template v-if="selectedNode">
            <b>{{ selectedNode.label }}</b>
            <span>
              {{ kindLabel(selectedNode.kind) }} · 负载 {{ selectedNode.load.toFixed(0) }} /
              {{ selectedNode.capacity.toFixed(0) }} · {{ statusLabel(selectedNode.status) }}
            </span>
            <span v-if="(state.injected[selectedNode.id] ?? 0) > 1" class="topo__target-inject">
              注入压力 {{ Math.round(state.injected[selectedNode.id] ?? 0) }}
            </span>
          </template>
          <template v-else-if="selectedEdge">
            <b>{{ selectedEdge.from }} → {{ selectedEdge.to }}</b>
            <span>
              {{ selectedEdge.kind === 'ROUTE' ? '服务路由' : '依赖调用' }}
              <template v-if="selectedEdge.shifted"> · 已切换</template>
            </span>
          </template>
          <span v-else class="topo__target-hint">
            在左侧拓扑中选择节点或连线，再执行动作
          </span>
        </div>

        <template v-if="role === 'ATTACK'">
          <div class="topo__actions">
            <button type="button" :disabled="!canTraffic()" @click="injectTraffic">
              <b>流量注入</b>
              <span>15 能量 · 4s 冷却</span>
              <em v-if="attackCooldown('traffic') > 0">冷却 {{ attackCooldown('traffic') }}s</em>
              <em v-else>网关或服务节点 +35</em>
            </button>
            <button type="button" :disabled="!canSlow()" @click="injectSlow">
              <b>慢调用注入</b>
              <span>20 能量 · 6s 冷却</span>
              <em v-if="attackCooldown('slow') > 0">冷却 {{ attackCooldown('slow') }}s</em>
              <em v-else>服务节点 +20，依赖 +15</em>
            </button>
          </div>
          <p class="topo__note">
            目标：让核心网关负载 ≥ 100% 并持续 3 秒。背景流量在 30s / 60s 自动抬升，注意选择瓶颈节点。
          </p>
        </template>

        <template v-else-if="role === 'DEFEND'">
          <div class="topo__actions topo__actions--defend">
            <button type="button" :disabled="!canScale()" @click="scale">
              <b>弹性扩容</b>
              <span>15 配额 · 10s 冷却</span>
              <em v-if="selectedNode && cooldownLeft(`SCALE|${selectedNode.id}`) > 0">
                冷却 {{ cooldownLeft(`SCALE|${selectedNode.id}`) }}s
              </em>
              <em v-else>容量 +40%，持续 15s</em>
            </button>
            <button type="button" :disabled="!canThrottle()" @click="throttle">
              <b>限流保护</b>
              <span>25 配额 · 15s 冷却</span>
              <em v-if="selectedNode && cooldownLeft(`THROTTLE|${selectedNode.id}`) > 0">
                冷却 {{ cooldownLeft(`THROTTLE|${selectedNode.id}`) }}s
              </em>
              <em v-else>负载减半，持续 4s</em>
            </button>
            <button type="button" :disabled="!canShift()" @click="shift">
              <b>流量切换</b>
              <span>12 配额 · 8s 冷却</span>
              <em v-if="selectedEdge || selectedNode">路由权重 -35%，持续 8s</em>
              <em v-else>选择服务或路由连线</em>
            </button>
          </div>
          <div class="topo__routes">
            <span>可切换路由</span>
            <button
              v-for="edge in routeEdges"
              :key="edge.id"
              type="button"
              class="topo__route"
              :class="{ 'is-active': selectedEdge?.id === edge.id }"
              @click="selectEdge(edge)"
            >
              {{ edge.from }}
              <em v-if="edge.shifted">已切换</em>
            </button>
          </div>
          <p class="topo__note">
            目标：守住核心网关直到 90 秒结束。优先扩容持续高压的服务，出现红色节点时用限流争取恢复时间。
          </p>
        </template>

        <template v-else>
          <p class="topo__note">观战视角：可查看双方动作与节点压力，但不能执行攻防操作。</p>
        </template>

        <div class="topo__feed">
          <div class="topo__feed-head">
            <span>实时事件</span>
            <em>{{ state.seq }} 帧</em>
          </div>
          <ul>
            <li v-for="(event, index) in state.events.slice(-6).reverse()" :key="`${event.at}-${index}`">
              <b>{{ clock(event.at) }}</b>
              <span>{{ event.text }}</span>
            </li>
            <li v-if="state.events.length === 0" class="is-empty">等待攻防动作</li>
          </ul>
        </div>
      </aside>
    </div>

    <footer v-if="state.finished" class="topo__result">
      <b>{{ state.winnerUserId ? nameOf(state.winnerUserId) : '未分胜负' }}</b>
      <span>{{ state.finishReason || '演练结束' }}</span>
      <em>网关 {{ gateway ? utilizationPercent(gateway) : 0 }}%</em>
    </footer>
  </section>
</template>

<style scoped src="./arena-topology.css"></style>
