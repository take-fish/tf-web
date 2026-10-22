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

<style scoped>
.login-scene {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 100dvh;
  overflow: hidden auto;
  background:
    radial-gradient(ellipse at 50% -10%, rgba(30, 62, 110, 0.55), transparent 62%),
    #04070e;
  color: #e9f2ff;
  font-family:
    'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
}

.login-sky {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.login-aurora {
  position: absolute;
  width: 58vw;
  height: 58vw;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.4;
  animation: login-drift 26s ease-in-out infinite alternate;
}

.login-aurora--a {
  top: -26vw;
  left: -12vw;
  background: radial-gradient(circle, #18727a 0%, transparent 68%);
}

.login-aurora--b {
  top: 14vh;
  right: -26vw;
  background: radial-gradient(circle, #36448f 0%, transparent 66%);
  animation-delay: -9s;
  animation-duration: 32s;
}

.login-aurora--c {
  bottom: -34vw;
  left: 20vw;
  background: radial-gradient(circle, #143f54 0%, transparent 70%);
  animation-delay: -16s;
  animation-duration: 38s;
}

@keyframes login-drift {
  from {
    transform: translate3d(-2%, -1%, 0) scale(1);
  }
  to {
    transform: translate3d(4%, 3%, 0) scale(1.14);
  }
}

.login-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(120, 180, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 180, 255, 0.045) 1px, transparent 1px);
  background-size: 52px 52px;
  mask-image: radial-gradient(ellipse at 50% 42%, #000 12%, transparent 76%);
}

.login-mote {
  position: absolute;
  border-radius: 50%;
  background: #8ff5e4;
  box-shadow: 0 0 12px rgba(94, 234, 212, 0.8);
  opacity: 0;
  animation: login-mote 12s ease-in-out infinite;
}

@keyframes login-mote {
  0%,
  100% {
    opacity: 0;
    transform: translateY(10px) scale(0.7);
  }
  35%,
  65% {
    opacity: 0.7;
    transform: translateY(-18px) scale(1);
  }
}

.login-fish {
  position: absolute;
  right: -3vw;
  bottom: 5vh;
  width: min(38vw, 520px);
  opacity: 0.36;
  animation: login-float 16s ease-in-out infinite alternate;
}

@keyframes login-float {
  from {
    transform: translateY(0) rotate(-1deg);
  }
  to {
    transform: translateY(-16px) rotate(1deg);
  }
}

/* ── 品牌 ── */

.login-brand {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 28px 36px;
  color: #bfd1e8;
  letter-spacing: 0.06em;
}

.login-brand__mark {
  color: #5eead4;
  font-size: 17px;
}

.login-brand__name {
  font-size: 13px;
  font-weight: 600;
}

.login-brand em {
  color: #506685;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 10px;
  font-style: normal;
  letter-spacing: 0.18em;
}

.login-env {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid rgba(94, 234, 212, 0.28);
  border-radius: 999px;
  background: rgba(94, 234, 212, 0.07);
  color: #5eead4;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.08em;
}

.login-env i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

.login-env--test {
  border-color: rgba(255, 196, 107, 0.38);
  background: rgba(255, 196, 107, 0.09);
  color: #ffc46b;
}

/* ── 舞台 ── */

.login-stage {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 16px 24px 30px;
}

.login-card {
  position: relative;
  width: min(660px, 100%);
  overflow: hidden;
  padding: 52px 56px 42px;
  border: 1px solid rgba(148, 198, 255, 0.16);
  border-radius: 30px;
  background:
    linear-gradient(155deg, rgba(20, 36, 60, 0.78), rgba(7, 14, 26, 0.9) 62%),
    rgba(7, 14, 26, 0.86);
  box-shadow:
    0 50px 140px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(30px);
  animation: login-rise 0.6s cubic-bezier(0.22, 0.8, 0.3, 1) both;
}

@keyframes login-rise {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.login-card__glow {
  position: absolute;
  top: -80px;
  left: 50%;
  width: 420px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(94, 234, 212, 0.16), transparent 70%);
  transform: translateX(-50%);
  pointer-events: none;
}

.login-card::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: radial-gradient(rgba(180, 220, 255, 0.08) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.5), transparent 55%);
  opacity: 0.35;
  content: '';
  pointer-events: none;
}

.login-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 306px;
}

.login-panel--state {
  align-items: center;
  text-align: center;
}

.login-eyebrow {
  margin-bottom: 16px;
  color: #5eead4;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.32em;
}

.login-card h1 {
  margin: 0 0 16px;
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.12;
  text-shadow: 0 0 44px rgba(94, 234, 212, 0.14);
}

.login-lede {
  max-width: 440px;
  color: #8fa5c4;
  font-size: 13px;
  line-height: 1.9;
}

/* ── 两个圆 ── */

.orbits {
  display: flex;
  justify-content: center;
  gap: clamp(30px, 6vw, 62px);
  margin-top: 46px;
}

.orb {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 148px;
  height: 148px;
  padding: 0;
  border: 1px solid rgba(94, 234, 212, 0.24);
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 26%, rgba(94, 234, 212, 0.2), transparent 52%),
    radial-gradient(circle at 70% 84%, rgba(56, 106, 178, 0.24), transparent 58%),
    rgba(8, 18, 31, 0.78);
  color: #eafffb;
  cursor: pointer;
  transition:
    transform 0.4s cubic-bezier(0.22, 0.8, 0.3, 1),
    border-color 0.3s ease,
    box-shadow 0.4s ease;
  box-shadow:
    inset 0 0 34px rgba(94, 234, 212, 0.07),
    0 18px 50px rgba(0, 0, 0, 0.35);
}

.orb:hover {
  border-color: rgba(94, 234, 212, 0.6);
  transform: translateY(-7px) rotate(-1.4deg);
  box-shadow:
    inset 0 0 44px rgba(94, 234, 212, 0.12),
    0 26px 60px rgba(0, 0, 0, 0.45),
    0 0 44px rgba(94, 234, 212, 0.16);
}

.orb:focus-visible {
  outline: 2px solid #5eead4;
  outline-offset: 6px;
}

.orb__ring {
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(94, 234, 212, 0.75) 44deg,
    transparent 96deg,
    transparent 190deg,
    rgba(124, 156, 255, 0.7) 248deg,
    transparent 306deg
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.6px), #000 calc(100% - 1px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 1.6px), #000 calc(100% - 1px));
  animation: orb-spin 7s linear infinite;
}

.orb--ghost .orb__ring {
  background: conic-gradient(
    from 140deg,
    transparent 0deg,
    rgba(124, 156, 255, 0.7) 50deg,
    transparent 108deg,
    transparent 210deg,
    rgba(94, 234, 212, 0.55) 268deg,
    transparent 330deg
  );
  animation-direction: reverse;
  animation-duration: 11s;
}

@keyframes orb-spin {
  to {
    transform: rotate(360deg);
  }
}

.orb__core {
  margin-top: 2px;
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.orb small {
  margin-top: 10px;
  color: #7d93b1;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.16em;
}

.orb:hover small {
  color: #5eead4;
}

/* ── 问答表单 ── */

.field {
  display: block;
  width: 100%;
  margin-top: 34px;
}

.field__label {
  display: block;
  margin-bottom: 8px;
  color: #6f86a6;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.field input {
  width: 100%;
  padding: 12px 2px;
  border: 0;
  border-bottom: 1px solid rgba(148, 198, 255, 0.22);
  border-radius: 0;
  outline: none;
  background: transparent;
  color: #f2f8ff;
  font-size: 22px;
  letter-spacing: 0.04em;
  caret-color: #5eead4;
  transition: border-color 0.2s ease;
}

.field input::placeholder {
  color: #40536d;
  font-size: 16px;
  letter-spacing: 0.02em;
}

.field input:focus {
  border-color: rgba(94, 234, 212, 0.7);
  box-shadow: 0 14px 24px -20px rgba(94, 234, 212, 0.9);
}

.field__row {
  position: relative;
  display: block;
}

.field__row input {
  padding-right: 56px;
}

.peek {
  position: absolute;
  right: 0;
  bottom: 14px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #5f7594;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.peek:hover {
  color: #5eead4;
}

.login-hint {
  margin-top: 10px;
  color: #5f7594;
  font-size: 11px;
}

.login-error {
  min-height: 20px;
  margin-top: 10px;
  color: #ff86a6;
  font-size: 12px;
  animation: login-shake 0.4s ease;
}

@keyframes login-shake {
  10%,
  90% {
    transform: translateX(-1px);
  }
  30%,
  70% {
    transform: translateX(3px);
  }
  50% {
    transform: translateX(-3px);
  }
}

.login-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: auto;
  padding-top: 28px;
}

.link {
  padding: 0;
  border: 0;
  background: transparent;
  color: #7d93b1;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.16s ease;
}

.link:hover {
  color: #5eead4;
}

.link--center {
  margin-top: 26px;
  letter-spacing: 0.04em;
}

.next {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  padding: 0 22px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(120deg, #5eead4, #7fd8ff);
  color: #042019;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow: 0 14px 34px rgba(94, 234, 212, 0.22);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.next span {
  font-size: 15px;
  transition: transform 0.18s ease;
}

.next:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 18px 40px rgba(94, 234, 212, 0.32);
}

.next:hover:not(:disabled) span {
  transform: translateX(3px);
}

.next:disabled {
  cursor: wait;
  opacity: 0.65;
  transform: none;
}

/* ── 等待 / 拒绝 ── */

.wait-orbit {
  position: relative;
  width: 128px;
  height: 128px;
  margin: 4px 0 30px;
}

.wait-orbit__ring {
  position: absolute;
  border-radius: 50%;
}

.wait-orbit__ring--a {
  inset: 0;
  border: 1px solid rgba(94, 234, 212, 0.18);
  background: conic-gradient(
    from 30deg,
    transparent 0deg,
    rgba(94, 234, 212, 0.9) 46deg,
    transparent 92deg
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.4px), #000 calc(100% - 1px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 1.4px), #000 calc(100% - 1px));
  animation: orb-spin 4.5s linear infinite;
}

.wait-orbit__ring--b {
  inset: 16px;
  border: 1px solid rgba(124, 156, 255, 0.2);
  border-top-color: rgba(124, 156, 255, 0.8);
  animation: orb-spin 8s linear infinite reverse;
}

.wait-orbit__core {
  position: absolute;
  inset: 44px;
  border-radius: 50%;
  background: radial-gradient(circle at 36% 32%, #9ffcec, #38b8a6 65%, #1d7a74);
  box-shadow:
    0 0 26px rgba(94, 234, 212, 0.55),
    0 0 70px rgba(94, 234, 212, 0.22);
  animation: wait-pulse 2.4s ease-in-out infinite;
}

@keyframes wait-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.12);
    opacity: 1;
  }
}

.blocked-mark {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  margin: 6px 0 30px;
  border: 1px solid rgba(255, 134, 166, 0.35);
  border-radius: 50%;
  background: rgba(255, 134, 166, 0.08);
  color: #ff86a6;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 36px;
  font-weight: 300;
  box-shadow: 0 0 50px rgba(255, 134, 166, 0.12);
}

/* ── 页脚 / 过渡 ── */

.login-foot {
  display: flex;
  align-items: center;
  gap: 22px;
  color: #40536d;
  font-size: 10.5px;
  letter-spacing: 0.06em;
}

.login-foot a {
  color: #5f7594;
  transition: color 0.16s ease;
}

.login-foot a:hover {
  color: #5eead4;
}

.phase-enter-active,
.phase-leave-active {
  transition:
    opacity 0.26s ease,
    transform 0.3s cubic-bezier(0.22, 0.8, 0.3, 1),
    filter 0.26s ease;
}

.phase-enter-from {
  opacity: 0;
  transform: translateY(14px);
  filter: blur(3px);
}

.phase-leave-to {
  opacity: 0;
  transform: translateY(-10px);
  filter: blur(3px);
}

/* ── 响应式 ── */

@media (max-width: 680px) {
  .login-brand {
    padding: 22px 22px;
  }

  .login-stage {
    justify-content: flex-start;
    padding: 8px 16px 26px;
  }

  .login-card {
    padding: 38px 26px 30px;
    border-radius: 24px;
  }

  .login-panel {
    min-height: 320px;
  }

  .orbits {
    gap: 26px;
    margin-top: 38px;
  }

  .orb {
    width: 124px;
    height: 124px;
  }

  .orb__core {
    font-size: 18px;
  }

  .login-fish {
    width: 62vw;
    opacity: 0.22;
  }

  .login-foot {
    flex-direction: column;
    gap: 8px;
  }
}

@media (max-width: 380px) {
  .orbits {
    gap: 16px;
  }

  .orb {
    width: 110px;
    height: 110px;
  }

  .orb small {
    letter-spacing: 0.08em;
  }

  .login-card {
    padding: 32px 20px 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-aurora,
  .login-mote,
  .login-fish,
  .orb__ring,
  .wait-orbit__ring,
  .wait-orbit__core,
  .login-card,
  .login-error {
    animation: none;
  }

  .orb,
  .next,
  .phase-enter-active,
  .phase-leave-active {
    transition: none;
  }

  .orb:hover,
  .next:hover:not(:disabled) {
    transform: none;
  }
}
</style>
