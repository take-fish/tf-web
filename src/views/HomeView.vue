<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import { fetchGroups, fetchOnline } from '@/modules/chat/chatApi'
import { ChatSocketClient } from '@/modules/chat/chatSocket'
import type { ChatGroup, OnlineMember, SmokeState } from '@/modules/chat/types'
import { fetchUserStats } from '@/modules/home/homeApi'
import { MODULES } from '@/modules/registry'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const lastUpdated = ref(new Date())
const groups = ref<ChatGroup[]>([])
const restOnline = ref<OnlineMember[]>([])
const userActive = ref(0)
const smokeState = ref<SmokeState | null>(null)
const smokeError = ref('')
const loadError = ref('')
const onlineOpen = ref(false)
const smokeOpen = ref(false)
const seenInvites = ref<string[]>([])

let groupTimer: ReturnType<typeof setInterval> | undefined

const socket = new ChatSocketClient({
  onSmokeState: (state) => {
    smokeState.value = {
      count: state?.count ?? 0,
      smoking: state?.smoking ?? [],
      online: state?.online ?? [],
      invites: state?.invites ?? [],
      mySession: state?.mySession ?? null,
    }
    lastUpdated.value = new Date()
  },
  onError: (message) => {
    if (smokeOpen.value) smokeError.value = message
  },
  onAuthError: () => {
    auth.clear()
    void router.replace({ name: 'login', query: { redirect: '/' } })
  },
})

const selfUserId = computed(() => (auth.user ? `u${auth.user.id}` : ''))
const onlineMembers = computed(() =>
  smokeState.value ? smokeState.value.online : restOnline.value,
)
const sortedOnline = computed(() =>
  [...onlineMembers.value].sort((a, b) =>
    (a.nickname || a.userId).localeCompare(b.nickname || b.userId, 'zh-CN'),
  ),
)
const onlineCount = computed(() => onlineMembers.value.length)
const totalLabel = computed(() => (userActive.value > 0 ? String(userActive.value) : '—'))
const onlinePct = computed(() =>
  userActive.value > 0 ? Math.round((onlineCount.value * 100) / userActive.value) : 0,
)
const onlineHint = computed(() =>
  userActive.value > 0 ? `${onlinePct.value}% 已启用用户在线 · 点击查看` : '统计加载中 · 点击查看',
)

const clusterOnline = computed(() =>
  groups.value.reduce((sum, group) => sum + (group.onlineCount ?? 0), 0),
)
const groupSummary = computed(() =>
  groups.value.length
    ? groups.value.map((group) => `${group.name} ${group.onlineCount ?? 0} 人`).join(' · ')
    : '暂无群聊',
)

const smoking = computed(() => smokeState.value?.smoking ?? [])
const invites = computed(() => smokeState.value?.invites ?? [])
const mySession = computed(() => smokeState.value?.mySession ?? null)
const smokeCount = computed(() => smokeState.value?.count ?? smoking.value.length)
const isInitiator = computed(() => mySession.value?.initiatorUserId === selfUserId.value)
const smokingIds = computed(() => new Set(smoking.value.map((member) => member.userId)))
const pendingInviteIds = computed(
  () => new Set(mySession.value?.pendingInvites.map((invite) => invite.userId) ?? []),
)
const inviteTargets = computed(() =>
  sortedOnline.value.filter(
    (member) => member.userId !== selfUserId.value && !smokingIds.value.has(member.userId),
  ),
)
const smokeUnread = computed(
  () =>
    !smokeOpen.value &&
    invites.value.some((invite) => !seenInvites.value.includes(invite.sessionId)),
)

const METRICS_TAIL = { label: '错误率', value: '0.02%', trend: '正常' } as const

const DEPLOYS = [
  {
    service: 'fishmatrix-api',
    version: 'v0.8.4',
    detail: '构建成功 · 2 个实例',
    time: '2 分钟前',
    tone: 'ok',
  },
  {
    service: 'tf-web',
    version: 'v0.2.1',
    detail: '发布完成 · 镜像已同步',
    time: '18 分钟前',
    tone: 'ok',
  },
  {
    service: 'tf-chat',
    version: 'v0.1.4',
    detail: '滚动重启 · 健康检查通过',
    time: '1 小时前',
    tone: 'ok',
  },
  {
    service: 'tf-reader',
    version: 'v0.1.4',
    detail: '配置变更 · 已生效',
    time: '3 小时前',
    tone: 'idle',
  },
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

const updatedLabel = computed(() =>
  lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false }),
)

async function loadGroups(): Promise<void> {
  try {
    groups.value = await fetchGroups()
  } catch (error) {
    loadError.value = formatApiError(error, '集群状态加载失败')
  }
}

async function loadDashboard(): Promise<void> {
  loadError.value = ''
  const [, onlineResult, statsResult] = await Promise.allSettled([
    loadGroups(),
    fetchOnline(),
    fetchUserStats(),
  ])
  if (onlineResult.status === 'fulfilled' && !smokeState.value) {
    restOnline.value = onlineResult.value
  }
  if (statsResult.status === 'fulfilled') {
    userActive.value = statsResult.value.active
  } else if (statsResult.status === 'rejected') {
    loadError.value = formatApiError(statsResult.reason, '用户统计加载失败')
  }
  lastUpdated.value = new Date()
}

async function refresh(): Promise<void> {
  await loadDashboard()
}

function openOnline(): void {
  onlineOpen.value = true
}

function markInvitesSeen(): void {
  const ids = invites.value.map((invite) => invite.sessionId)
  if (ids.length) {
    seenInvites.value = [...new Set([...seenInvites.value, ...ids])]
  }
}

function openSmoke(): void {
  smokeOpen.value = true
  smokeError.value = ''
  markInvitesSeen()
}

function closeSmoke(): void {
  smokeOpen.value = false
  smokeError.value = ''
}

function guardSocket(action: () => boolean, fallback: string): void {
  smokeError.value = ''
  if (!action()) smokeError.value = fallback
}

function invite(userId: string): void {
  if (pendingInviteIds.value.has(userId)) return
  guardSocket(() => socket.inviteSmoke(userId), '聊天连接尚未就绪，请稍后重试')
}

function acceptInvite(sessionId: string): void {
  guardSocket(() => socket.acceptSmoke(sessionId), '聊天连接尚未就绪，请稍后重试')
}

function declineInvite(sessionId: string): void {
  guardSocket(() => socket.declineSmoke(sessionId), '聊天连接尚未就绪，请稍后重试')
}

function endSmoke(): void {
  guardSocket(() => socket.endSmoke(), '聊天连接尚未就绪，请稍后重试')
}

function leaveSmoke(): void {
  guardSocket(() => socket.leaveSmoke(), '聊天连接尚未就绪，请稍后重试')
}

function initial(name: string, fallback: string): string {
  return (name || fallback || '?').slice(0, 1).toUpperCase()
}

onMounted(() => {
  void loadDashboard()
  void socket.connect()
  groupTimer = setInterval(() => {
    void loadGroups()
  }, 20_000)
})

onUnmounted(() => {
  socket.close()
  if (groupTimer) clearInterval(groupTimer)
})
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

    <p v-if="loadError" class="home-error">{{ loadError }}</p>

    <div class="metric-strip">
      <button type="button" class="metric-item metric-item--action" @click="openOnline">
        <span class="metric-item__label">节点在线</span>
        <b>{{ onlineCount }} / {{ totalLabel }}</b>
        <em class="tone-ok">{{ onlineHint }}</em>
      </button>

      <div class="metric-item">
        <span class="metric-item__label">集群状态</span>
        <b>{{ groups.length }} 个群聊 · {{ clusterOnline }} 人在线</b>
        <em class="metric-item__detail" :title="groupSummary">{{ groupSummary }}</em>
      </div>

      <button type="button" class="metric-item metric-item--action" @click="openSmoke">
        <span v-if="smokeUnread" class="metric-item__dot" aria-label="有新的冒烟测试邀请" />
        <span class="metric-item__label">冒烟测试</span>
        <b>冒烟测试数：{{ smokeCount }}</b>
        <em class="tone-ok"> {{ smoking.length }} 人正在冒烟 · 点击查看 </em>
      </button>

      <div class="metric-item">
        <span class="metric-item__label">{{ METRICS_TAIL.label }}</span>
        <b>{{ METRICS_TAIL.value }}</b>
        <em class="tone-ok">{{ METRICS_TAIL.trend }}</em>
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
            <span class="service-card__open"> 打开 <AppIcon name="chevron" :size="12" /> </span>
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
              <b
                >{{ item.service }} <em>{{ item.version }}</em></b
              >
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

    <div v-if="onlineOpen" class="overlay" @click.self="onlineOpen = false">
      <div class="sheet home-sheet">
        <header class="sheet__head">
          <div>
            <h2>在线用户</h2>
            <p>当前 {{ onlineCount }} 人在线 · 总人数取已启用用户</p>
          </div>
          <button type="button" class="icon-button" @click="onlineOpen = false">×</button>
        </header>
        <div class="home-sheet__body">
          <p v-if="onlineMembers.length === 0" class="home-empty">当前没有在线用户</p>
          <ul v-else class="home-user-list">
            <li v-for="member in sortedOnline" :key="member.userId" class="home-user">
              <span class="home-user__avatar">{{ initial(member.nickname, member.userId) }}</span>
              <span class="home-user__body">
                <b>{{ member.nickname || member.userId }}</b>
                <span>ID {{ member.userId }} · {{ member.node }}</span>
              </span>
              <span class="status-chip status-chip--ok"><i class="dot dot--ok" /> 在线</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="smokeOpen" class="overlay" @click.self="closeSmoke">
      <div class="sheet home-sheet home-sheet--smoke">
        <header class="sheet__head">
          <div>
            <h2>冒烟测试</h2>
            <p>冒烟测试数：{{ smokeCount }} · 邀请在线用户，对方接受后开始，可随时手动结束</p>
          </div>
          <button type="button" class="icon-button" @click="closeSmoke">×</button>
        </header>
        <div class="home-sheet__body">
          <p v-if="smokeError" class="home-error">{{ smokeError }}</p>

          <section v-if="mySession" class="home-block">
            <div class="home-block__head">
              <h3>我的冒烟测试</h3>
              <span
                class="status-chip"
                :class="mySession.status === 'ACTIVE' ? 'status-chip--ok' : 'status-chip--idle'"
              >
                {{ mySession.status === 'ACTIVE' ? '进行中' : '等待对方接受' }}
              </span>
            </div>
            <div class="home-chips">
              <span
                v-for="participant in mySession.participants"
                :key="participant.userId"
                class="home-chip"
              >
                {{ participant.nickname || participant.userId }}
                <i>ID {{ participant.userId }}</i>
              </span>
            </div>
            <p v-if="mySession.pendingInvites.length" class="home-note">
              已邀请：{{ mySession.pendingInvites.map((invite) => invite.nickname).join('、') }}
            </p>
            <button
              type="button"
              class="ghost-button"
              @click="isInitiator ? endSmoke() : leaveSmoke()"
            >
              {{ isInitiator ? '结束冒烟测试' : '退出冒烟测试' }}
            </button>
          </section>

          <section v-if="invites.length" class="home-block home-block--invite">
            <div class="home-block__head">
              <h3>收到的邀请</h3>
              <span>{{ invites.length }} 条</span>
            </div>
            <div v-for="invite in invites" :key="invite.sessionId" class="home-invite-row">
              <span class="home-invite-row__body">
                <b>{{ invite.fromNickname }}</b>
                <span>邀请你一起冒烟测试</span>
              </span>
              <span class="home-invite-row__actions">
                <button
                  type="button"
                  class="primary-button"
                  @click="acceptInvite(invite.sessionId)"
                >
                  接受
                </button>
                <button type="button" class="ghost-button" @click="declineInvite(invite.sessionId)">
                  拒绝
                </button>
              </span>
            </div>
          </section>

          <section class="home-block">
            <div class="home-block__head">
              <h3>正在冒烟测试</h3>
              <span>{{ smoking.length }} 人</span>
            </div>
            <p v-if="smoking.length === 0" class="home-empty">还没有人开始冒烟测试</p>
            <ul v-else class="home-user-list">
              <li
                v-for="member in smoking"
                :key="`${member.sessionId}-${member.userId}`"
                class="home-user"
              >
                <span class="home-user__avatar">{{ initial(member.nickname, member.userId) }}</span>
                <span class="home-user__body">
                  <b>{{ member.nickname || member.userId }}</b>
                  <span>ID {{ member.userId }}</span>
                </span>
                <span v-if="member.initiator" class="home-tag">发起人</span>
                <span v-if="member.userId === selfUserId" class="home-tag home-tag--self">我</span>
              </li>
            </ul>
          </section>

          <section class="home-block">
            <div class="home-block__head">
              <h3>在线可邀请</h3>
              <span>{{ inviteTargets.length }} 人 · 点击邀请</span>
            </div>
            <p v-if="inviteTargets.length === 0" class="home-empty">暂无其他在线用户</p>
            <ul v-else class="home-user-list">
              <li v-for="member in inviteTargets" :key="member.userId">
                <button
                  type="button"
                  class="home-user home-user--action"
                  :disabled="pendingInviteIds.has(member.userId)"
                  @click="invite(member.userId)"
                >
                  <span class="home-user__avatar">{{
                    initial(member.nickname, member.userId)
                  }}</span>
                  <span class="home-user__body">
                    <b>{{ member.nickname || member.userId }}</b>
                    <span>ID {{ member.userId }} · {{ member.node }}</span>
                  </span>
                  <span class="home-user__cta">
                    {{ pendingInviteIds.has(member.userId) ? '已邀请' : '邀请冒烟' }}
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
