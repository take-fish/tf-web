<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, appendErrorReference } from '@/lib/http'
import { fetchMeta } from '@/modules/auth/authApi'
import type { AppMeta } from '@/modules/auth/types'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore } from '@/stores/identity'

type Phase = 'ask' | 'account' | 'password' | 'pending' | 'blocked'
type Mode = 'login' | 'register'

interface Mote {
  left: string
  top: string
  delay: string
  duration: string
  size: string
}

const USERNAME_PATTERN = /^[A-Za-z0-9_一-龥-]{2,32}$/
const MAX_PASSWORD_BYTES = 72

const MOTES: Mote[] = [
  { left: '9%', top: '24%', delay: '0s', duration: '11s', size: '3px' },
  { left: '18%', top: '68%', delay: '-3s', duration: '14s', size: '2px' },
  { left: '26%', top: '42%', delay: '-7s', duration: '10s', size: '4px' },
  { left: '41%', top: '16%', delay: '-5s', duration: '13s', size: '2px' },
  { left: '63%', top: '26%', delay: '-9s', duration: '15s', size: '3px' },
  { left: '74%', top: '62%', delay: '-2s', duration: '12s', size: '2px' },
  { left: '86%', top: '34%', delay: '-6s', duration: '16s', size: '4px' },
  { left: '92%', top: '74%', delay: '-11s', duration: '12s', size: '2px' },
  { left: '55%', top: '82%', delay: '-4s', duration: '14s', size: '3px' },
  { left: '33%', top: '88%', delay: '-8s', duration: '11s', size: '2px' },
]

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const identity = useIdentityStore()

const phase = ref<Phase>('ask')
const mode = ref<Mode>('login')
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')
const errorKey = ref(0)
const pendingName = ref('')
const pendingId = ref<number | null>(null)
const blockedTitle = ref('')
const blockedMessage = ref('')
const meta = ref<AppMeta | null>(null)
const field = ref<HTMLInputElement | null>(null)

const isRegister = computed(() => mode.value === 'register')
const stepLabel = computed(() => {
  if (phase.value === 'account') return 'IDENTITY · 第 1 问 / 共 2 问'
  if (phase.value === 'password') return 'IDENTITY · 第 2 问 / 共 2 问'
  return ''
})
const question = computed(() => (phase.value === 'account' ? '你是谁？' : '你的口号是？'))
const lede = computed(() => {
  if (phase.value === 'account') {
    return isRegister.value
      ? '给自己起一个名号，中英文、数字、下划线或短横线都可以。'
      : '还记得当初登记的名号吗？慢慢想。'
  }
  return isRegister.value
    ? '第一次见，请记住这个口号；以后进门就靠它了。'
    : '只有你我知道的那句话。'
})
const actionLabel = computed(() => (isRegister.value ? '递上申请' : '认出我了'))
const adminUrl = computed(() => {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  if (port === '18088') return `${protocol}//${hostname}:18101/admin/`
  if (port === '8088' || port === '80' || port === '') return `${protocol}//${hostname}:8101/admin/`
  return ''
})
const adminLabel = computed(() => {
  if (meta.value?.environment === 'test') return '测试用户中台'
  if (meta.value?.environment === 'production') return '生产用户中台'
  return '用户中台'
})

function fail(message: string) {
  error.value = message
  errorKey.value += 1
}

function clearError() {
  error.value = ''
}

async function focusField() {
  await nextTick()
  field.value?.focus()
  if (field.value && field.value.type !== 'password') field.value.select()
}

function enterAccount(chosenMode: Mode) {
  mode.value = chosenMode
  clearError()
  phase.value = 'account'
  void focusField()
}

function submitAccount() {
  clearError()
  const value = username.value.trim()
  if (!value) {
    fail('总得有个名号吧')
    return
  }
  if (isRegister.value && !USERNAME_PATTERN.test(value)) {
    fail('名号需为 2–32 位，可用中英文、数字、下划线或短横线')
    return
  }
  username.value = value
  phase.value = 'password'
  void focusField()
}

async function submitPassword() {
  if (busy.value) return
  clearError()

  const account = username.value.trim()
  const secret = password.value
  if (!secret) {
    fail('口号还没说呢')
    void focusField()
    return
  }
  if (isRegister.value) {
    if (secret.length < 6) {
      fail('口号至少 6 位，再想一个')
      void focusField()
      return
    }
    if (secret.length > 64 || new TextEncoder().encode(secret).length > MAX_PASSWORD_BYTES) {
      fail('口号太长了，换短一点的')
      void focusField()
      return
    }
  }

  busy.value = true
  try {
    if (isRegister.value) {
      const result = await auth.register({ username: account, password: secret })
      pendingName.value = account
      pendingId.value = result.id
      password.value = ''
      phase.value = 'pending'
      return
    }

    const result = await auth.login({ username: account, password: secret })
    identity.setAccount(`u${result.user.id}`, result.user.nickname || result.user.username)
    password.value = ''
    await router.replace(afterLoginTarget())
  } catch (caught) {
    handleFailure(caught)
  } finally {
    busy.value = false
  }
}

function handleFailure(caught: unknown) {
  if (!(caught instanceof ApiError)) {
    fail(caught instanceof TypeError ? '暂时连不上用户服务，稍后再试' : '出了点小状况，稍后再试')
    return
  }

  switch (caught.code) {
    case 'PENDING_APPROVAL':
      pendingName.value = username.value.trim()
      pendingId.value = null
      password.value = ''
      phase.value = 'pending'
      break
    case 'REJECTED':
      blockedTitle.value = '这次没能通过审批'
      blockedMessage.value = '管理员已经看过你的申请。可以联系管理员重新审批，或稍后再试。'
      phase.value = 'blocked'
      break
    case 'DISABLED':
      blockedTitle.value = '账号已停用'
      blockedMessage.value = '这个名号暂时被收起来了。如需恢复，请联系管理员。'
      phase.value = 'blocked'
      break
    case 'INVALID_CREDENTIALS':
      password.value = ''
      fail(appendErrorReference('名号或口号不对，再想想？', caught))
      void focusField()
      break
    case 'USERNAME_TAKEN':
      phase.value = 'account'
      fail(appendErrorReference('这个名号已经有人用了，换一个？', caught))
      void focusField()
      break
    default:
      fail(appendErrorReference(caught.message, caught))
  }
}

function backToAsk() {
  clearError()
  phase.value = 'ask'
}

function backToAccount() {
  clearError()
  password.value = ''
  phase.value = 'account'
  void focusField()
}

function resetToAsk() {
  clearError()
  password.value = ''
  pendingName.value = ''
  pendingId.value = null
  blockedTitle.value = ''
  blockedMessage.value = ''
  phase.value = 'ask'
}

async function loadMeta() {
  try {
    meta.value = await fetchMeta()
  } catch {
    // 环境标识只用于提示，失败不阻塞登录/注册
  }
}

function afterLoginTarget(): string {
  const redirect = route.query.redirect
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.startsWith('/login')
  ) {
    return redirect
  }
  return '/'
}

onMounted(() => {
  document.title = '认识一下 · FishMatrix'
  void loadMeta()
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  void focusField()
})

onBeforeUnmount(() => {
  clearError()
})
</script>

<template>
  <div class="login-scene">
    <div class="login-sky" aria-hidden="true">
      <span class="login-aurora login-aurora--a" />
      <span class="login-aurora login-aurora--b" />
      <span class="login-aurora login-aurora--c" />
      <span class="login-grid" />
      <span
        v-for="(mote, index) in MOTES"
        :key="index"
        class="login-mote"
        :style="{
          left: mote.left,
          top: mote.top,
          animationDelay: mote.delay,
          animationDuration: mote.duration,
          width: mote.size,
          height: mote.size,
        }"
      />
      <svg class="login-fish" viewBox="0 0 240 120" fill="none">
        <defs>
          <linearGradient id="fish-line" x1="20" y1="40" x2="220" y2="80">
            <stop stop-color="#5eead4" stop-opacity="0" />
            <stop offset="0.45" stop-color="#5eead4" stop-opacity="0.75" />
            <stop offset="1" stop-color="#7c9cff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M28 62c26-30 78-36 114-15 12 7 22 17 29 28-9 3-17 8-24 15-39 34-92 22-118-11-3-4-5-9-6-12 2-2 3-3 5-5Z"
          stroke="url(#fish-line)"
          stroke-width="1.2"
        />
        <path
          d="M170 75c12 0 22 6 32 16-12 2-22-1-29-8"
          stroke="url(#fish-line)"
          stroke-width="1.2"
        />
        <circle cx="127" cy="55" r="2.6" fill="#5eead4" fill-opacity="0.85" />
      </svg>
    </div>

    <header class="login-brand">
      <span class="login-brand__mark">◈</span>
      <span class="login-brand__name">FishMatrix</span>
      <em>workspace</em>
      <span
        v-if="meta"
        class="login-env"
        :class="meta.environment === 'test' ? 'login-env--test' : 'login-env--production'"
        :title="[meta.database, meta.namespace, meta.version].filter(Boolean).join(' · ')"
      >
        <i aria-hidden="true" />
        {{ meta.environmentLabel }}
      </span>
    </header>

    <main class="login-stage">
      <section class="login-card" :class="{ 'login-card--state': phase === 'pending' || phase === 'blocked' }">
        <span class="login-card__glow" aria-hidden="true" />

        <Transition name="phase" mode="out-in">
          <div v-if="phase === 'ask'" key="ask" class="login-panel login-panel--ask">
            <p class="login-eyebrow">IDENTITY CHECK</p>
            <h1>你认识我吗？</h1>
            <p class="login-lede">
              这扇门只留给说过暗号的人。<br />
              如果我们是第一次见，也可以现在认识。
            </p>

            <div class="orbits">
              <button type="button" class="orb" @click="enterAccount('login')">
                <span class="orb__ring" aria-hidden="true" />
                <span class="orb__core">认识</span>
                <small>我有暗号</small>
              </button>
              <button type="button" class="orb orb--ghost" @click="enterAccount('register')">
                <span class="orb__ring" aria-hidden="true" />
                <span class="orb__core">不认识</span>
                <small>第一次来</small>
              </button>
            </div>
          </div>

          <form
            v-else-if="phase === 'account'"
            key="account"
            class="login-panel login-panel--form"
            @submit.prevent="submitAccount"
          >
            <p class="login-eyebrow">{{ stepLabel }}</p>
            <h1>{{ question }}</h1>
            <p class="login-lede">{{ lede }}</p>

            <label class="field">
              <span class="field__label">名号</span>
              <input
                ref="field"
                v-model="username"
                type="text"
                maxlength="32"
                autocomplete="username"
                spellcheck="false"
                placeholder="例：摸鱼小明"
              />
            </label>

            <p v-if="error" :key="errorKey" class="login-error" role="alert">{{ error }}</p>
            <p v-else class="login-error" aria-hidden="true" />

            <div class="login-actions">
              <button type="button" class="link" @click="backToAsk">← 换个答案</button>
              <button type="submit" class="next">下一步 <span>→</span></button>
            </div>
          </form>

          <form
            v-else-if="phase === 'password'"
            key="password"
            class="login-panel login-panel--form"
            @submit.prevent="submitPassword"
          >
            <p class="login-eyebrow">{{ stepLabel }}</p>
            <h1>{{ question }}</h1>
            <p class="login-lede">{{ lede }}</p>

            <label class="field">
              <span class="field__label">口号</span>
              <span class="field__row">
                <input
                  ref="field"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  maxlength="64"
                  :autocomplete="isRegister ? 'new-password' : 'current-password'"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  class="peek"
                  :aria-label="showPassword ? '隐藏口号' : '显示口号'"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? '隐藏' : '显示' }}
                </button>
              </span>
            </label>

            <p class="login-hint">
              {{ isRegister ? '至少 6 位，别用太好猜的。' : '暗号只会在你我的记忆里。' }}
            </p>

            <p v-if="error" :key="errorKey" class="login-error" role="alert">{{ error }}</p>
            <p v-else class="login-error" aria-hidden="true" />

            <div class="login-actions">
              <button type="button" class="link" @click="backToAccount">← 换个名号</button>
              <button type="submit" class="next" :disabled="busy">
                {{ busy ? '辨认中…' : actionLabel }} <span>→</span>
              </button>
            </div>
          </form>

          <div v-else-if="phase === 'pending'" key="pending" class="login-panel login-panel--state">
            <div class="wait-orbit" aria-hidden="true">
              <span class="wait-orbit__ring wait-orbit__ring--a" />
              <span class="wait-orbit__ring wait-orbit__ring--b" />
              <span class="wait-orbit__core" />
            </div>
            <p class="login-eyebrow">PENDING APPROVAL</p>
            <h1>等待通过中</h1>
            <p class="login-lede">
              “{{ pendingName }}”的申请已经递到{{ adminLabel
              }}<template v-if="pendingId">，编号 #{{ pendingId }}</template>。<br />
              <template v-if="meta">当前是{{ meta.environmentLabel }}，请让该环境的管理员审批。<br /></template>
              管理员通过后，你就能进门了。
            </p>
            <button type="button" class="link link--center" @click="resetToAsk">回到开始</button>
          </div>

          <div v-else key="blocked" class="login-panel login-panel--state">
            <div class="blocked-mark" aria-hidden="true">×</div>
            <p class="login-eyebrow">NOT THIS TIME</p>
            <h1>{{ blockedTitle }}</h1>
            <p class="login-lede">{{ blockedMessage }}</p>
            <button type="button" class="link link--center" @click="resetToAsk">回到开始</button>
          </div>
        </Transition>
      </section>

      <footer class="login-foot">
        <span>FishMatrix · 暗号只属于你</span>
        <a v-if="adminUrl" :href="adminUrl" target="_blank" rel="noopener">{{ adminLabel }} ↗</a>
      </footer>
    </main>
  </div>
</template>

<style scoped src="./login-view.css"></style>
