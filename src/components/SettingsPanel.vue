<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { formatApiError } from '@/lib/http'
import { fetchMyStats } from '@/modules/reader/readerApi'
import type { UserStats } from '@/modules/reader/types'
import type { ReaderTemplateId } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import { SKINS } from '@/skins/registry'

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const auth = useAuthStore()
const settings = useSettingsStore()
const identity = useIdentityStore()
const skinStore = useSkinStore()
const nickname = ref(identity.state.nickname)
const loggingOut = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarBusy = ref(false)
const avatarError = ref('')
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

const accountName = computed(() => auth.user?.username ?? '')
const accountNickname = computed(() => auth.user?.nickname ?? '')
const accountRole = computed(() => (auth.isAdmin ? '管理员' : '成员'))

const stats = ref<UserStats | null>(null)
const statsError = ref('')

const levelLabel = computed(() => (stats.value ? `Lv.${stats.value.level}` : '—'))
const experienceLabel = computed(() => {
  const value = stats.value
  if (!value) return '—'
  return value.nextLevelExperience === null
    ? `${value.experience}（已满级）`
    : `${value.experience} / ${value.nextLevelExperience}`
})
const uploadLabel = computed(() => (stats.value ? String(stats.value.uploadCount) : '—'))
const readingLabel = computed(() => {
  const value = stats.value
  if (!value) return '—'
  const hours = Math.floor(value.readingMinutes / 60)
  const minutes = value.readingMinutes % 60
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`
})

onMounted(async () => {
  try {
    stats.value = await fetchMyStats()
  } catch (error) {
    // 统计拉不到不影响设置面板的其他功能
    statsError.value = formatApiError(error, '无法获取阅读等级')
  }
})

const READER_TEMPLATES: ReadonlyArray<{ id: ReaderTemplateId; label: string }> = [
  { id: 'springboot', label: 'SpringBoot 业务层' },
  { id: 'react', label: 'React 组件' },
  { id: 'python', label: 'Python 脚本' },
  { id: 'go', label: 'Go 接口' },
  { id: 'cpp', label: 'C++ 算法' },
]

function saveNickname() {
  identity.setNickname(nickname.value)
  nickname.value = identity.state.nickname
}

function onNicknameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') saveNickname()
}

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || avatarBusy.value) return
  avatarError.value = ''
  if (file.size > MAX_AVATAR_BYTES) {
    avatarError.value = '头像不能超过 2MB'
    return
  }
  avatarBusy.value = true
  try {
    await auth.uploadAvatar(file)
  } catch (error) {
    avatarError.value = formatApiError(error, '头像上传失败')
  } finally {
    avatarBusy.value = false
  }
}

async function onRemoveAvatar() {
  if (avatarBusy.value) return
  avatarError.value = ''
  avatarBusy.value = true
  try {
    await auth.removeAvatar()
  } catch (error) {
    avatarError.value = formatApiError(error, '移除头像失败')
  } finally {
    avatarBusy.value = false
  }
}

function onToggleAutoBoss(event: Event) {
  settings.update({ autoBossOnMouseLeave: (event.target as HTMLInputElement).checked })
}

function onAutoBossDelay(event: Event) {
  settings.update({ autoBossDelayMs: Number((event.target as HTMLSelectElement).value) })
}

function onReaderTemplate(event: Event) {
  settings.update({ readerTemplate: (event.target as HTMLSelectElement).value as ReaderTemplateId })
}

function onReaderFontSize(event: Event) {
  settings.update({ readerFontSize: Number((event.target as HTMLInputElement).value) })
}

function onAutoScroll(event: Event) {
  settings.update({ autoScrollSeconds: Number((event.target as HTMLSelectElement).value) })
}

function onVolume(event: Event) {
  settings.update({ volume: Number((event.target as HTMLInputElement).value) })
}

async function onLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await auth.logout()
    identity.reset()
    emit('close')
    await router.replace({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="工作台设置"
    @click.self="emit('close')"
  >
    <div class="sheet settings-sheet">
      <header class="sheet__head">
        <div>
          <h2>工作区设置</h2>
          <p>配置仅保存在当前浏览器。</p>
        </div>
        <button class="icon-button" aria-label="关闭" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </header>

      <div class="settings-body">
        <section class="settings-section">
          <h3>身份</h3>
          <div class="settings-row settings-row--avatar">
            <span>头像</span>
            <span class="settings-inline settings-avatar">
              <UserAvatar
                class="settings-avatar__preview"
                :name="accountNickname || nickname"
                :src="auth.user?.avatarUrl"
                :user-id="auth.user ? `u${auth.user.id}` : identity.state.userId"
                :size="40"
              />
              <button
                type="button"
                class="ghost-button"
                :disabled="avatarBusy || !auth.user"
                @click="avatarInput?.click()"
              >
                {{ avatarBusy ? '处理中…' : auth.user?.avatarUrl ? '更换头像' : '上传头像' }}
              </button>
              <button
                v-if="auth.user?.avatarUrl"
                type="button"
                class="ghost-button"
                :disabled="avatarBusy"
                @click="onRemoveAvatar"
              >
                移除
              </button>
              <input
                ref="avatarInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                @change="onAvatarChange"
              />
            </span>
          </div>
          <p v-if="avatarError" class="settings-avatar__error">{{ avatarError }}</p>
          <div class="settings-row">
            <span>当前账号</span>
            <code v-if="accountName">@{{ accountName }} · {{ accountRole }}</code>
            <code v-else>未登录</code>
          </div>
          <div v-if="accountNickname" class="settings-row">
            <span>账号昵称</span>
            <code>{{ accountNickname }}</code>
          </div>
          <label class="settings-row">
            <span>显示名称</span>
            <span class="settings-inline">
              <input
                v-model="nickname"
                maxlength="32"
                class="text-input"
                @blur="saveNickname"
                @keydown="onNicknameKeydown"
              />
            </span>
          </label>
          <div class="settings-row">
            <span>节点标识</span>
            <code>{{ identity.nodeName }} · {{ identity.state.userId.slice(0, 8) }}</code>
          </div>
          <div class="settings-row">
            <span>会话</span>
            <button class="ghost-button" :disabled="loggingOut" @click="onLogout">
              <AppIcon name="power" :size="13" />
              {{ loggingOut ? '退出中…' : '退出登录' }}
            </button>
          </div>
        </section>

        <section class="settings-section">
          <h3>阅读等级</h3>
          <div class="settings-row">
            <span>当前等级</span>
            <code>{{ levelLabel }}</code>
          </div>
          <div class="settings-row">
            <span>经验值</span>
            <code>{{ experienceLabel }}</code>
          </div>
          <div class="settings-row">
            <span>上传本数</span>
            <code>{{ uploadLabel }}</code>
          </div>
          <div class="settings-row">
            <span>累计阅读</span>
            <code>{{ readingLabel }}</code>
          </div>
          <p v-if="statsError" class="settings-avatar__error">{{ statsError }}</p>
        </section>

        <section class="settings-section">
          <h3>工作区伪装</h3>
          <div class="settings-row">
            <span>立即切换</span>
            <span class="settings-inline"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>F</kbd></span>
          </div>
          <label class="settings-row">
            <span>鼠标离开窗口自动切换</span>
            <span class="settings-inline">
              <input
                type="checkbox"
                :checked="settings.state.autoBossOnMouseLeave"
                @change="onToggleAutoBoss"
              />
            </span>
          </label>
          <label class="settings-row">
            <span>离开后延迟</span>
            <select
              class="select-input"
              :value="settings.state.autoBossDelayMs"
              @change="onAutoBossDelay"
            >
              <option :value="1000">1 秒</option>
              <option :value="2000">2 秒</option>
              <option :value="5000">5 秒</option>
            </select>
          </label>
          <div class="settings-row">
            <span>当前视图</span>
            <span class="settings-inline settings-inline--skins">
              <button
                v-for="skin in SKINS"
                :key="skin.id"
                class="mini-skin"
                :class="{ 'is-active': skinStore.activeSkin === skin.id }"
                @click="skinStore.selectSkin(skin.id)"
              >
                {{ skin.appName }}
              </button>
            </span>
          </div>
        </section>

        <section class="settings-section">
          <h3>代码审阅</h3>
          <label class="settings-row">
            <span>默认模板</span>
            <select
              class="select-input"
              :value="settings.state.readerTemplate"
              @change="onReaderTemplate"
            >
              <option v-for="template in READER_TEMPLATES" :key="template.id" :value="template.id">
                {{ template.label }}
              </option>
            </select>
          </label>
          <label class="settings-row">
            <span>字号 {{ settings.state.readerFontSize }}px</span>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              :value="settings.state.readerFontSize"
              @input="onReaderFontSize"
            />
          </label>
          <label class="settings-row">
            <span>自动审阅速度</span>
            <select
              class="select-input"
              :value="settings.state.autoScrollSeconds"
              @change="onAutoScroll"
            >
              <option :value="30">30 秒</option>
              <option :value="45">45 秒</option>
              <option :value="60">60 秒</option>
            </select>
          </label>
        </section>

        <section class="settings-section">
          <h3>构建控制台</h3>
          <label class="settings-row">
            <span>并发数（音量）{{ Math.round(settings.state.volume * 100) }}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="settings.state.volume"
              @input="onVolume"
            />
          </label>
        </section>
      </div>

      <footer class="sheet__foot">
        <span>FishMatrix Workspace · 设置自动保存</span>
        <button class="primary-button" @click="emit('close')">完成</button>
      </footer>
    </div>
  </div>
</template>
