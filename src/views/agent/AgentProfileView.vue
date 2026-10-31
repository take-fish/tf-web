<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import AgentAvatar from '@/components/agent/AgentAvatar.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { fetchProfile, saveProfile, type AgentProfile } from '@/api/agent'
import { formatApiError } from '@/lib/http'

const router = useRouter()

/** 兜底默认值：接口还没回来时也能渲染预览（与后端 DEFAULT_PROFILE 对齐）。 */
const FALLBACK: AgentProfile = {
  name: 'FishMatrix Agent',
  tagline: '内网智能运维助手',
  avatar: { style: 'orb', primary: '#58a6ff', accent: '#a371f7', size: 96, spin: true },
  greeting: '你好，我是 FishMatrix 运维智能助手。查日志、看健康、查知识库、发布和重启都可以直接问我。',
  suggestions: ['发布流程是什么？回滚怎么做？', 'tf-game 最近半小时有报错吗？'],
  theme: '#58a6ff',
  show_status_bar: true,
}

const form = reactive<AgentProfile>(structuredClone(FALLBACK))
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')

const STYLES = [
  { id: 'orb' as const, label: '光球', desc: '核心球 + 轨道环' },
  { id: 'cube' as const, label: '立方', desc: '六面体旋转' },
  { id: 'ring' as const, label: '陀螺', desc: '三向圆环' },
]

const canSave = computed(() => form.name.trim() && form.tagline.trim() && form.greeting.trim())

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await fetchProfile()
    Object.assign(form, data)
  } catch (e) {
    error.value = formatApiError(e, '读取展示配置失败，先按默认值展示')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const payload: AgentProfile = {
      ...form,
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      greeting: form.greeting.trim(),
      suggestions: form.suggestions.map((s) => s.trim()).filter(Boolean),
    }
    const { data } = await saveProfile(payload)
    Object.assign(form, data)
    notice.value = '已保存，对话页下次进入即生效'
  } catch (e) {
    error.value = formatApiError(e, '保存失败')
  } finally {
    saving.value = false
  }
}

function addSuggestion() {
  if (form.suggestions.length >= 6) return
  form.suggestions.push('')
}

function removeSuggestion(index: number) {
  form.suggestions.splice(index, 1)
}

function resetForm() {
  void load()
  notice.value = ''
}

onMounted(load)
</script>

<template>
  <section class="profile">
    <header class="profile__top">
      <div class="profile__title">
        <button class="profile__back" title="返回对话" @click="router.push('/agent')">← 返回</button>
        <div>
          <h1>试衣间</h1>
          <p class="profile__hint">
            给 agent 换衣服的地方：名称、3D 形象、问候语和推荐问题。保存后所有用户进入对话页就能看到。
          </p>
        </div>
      </div>
      <div class="profile__actions">
        <button class="btn" :disabled="loading || saving" @click="resetForm">还原</button>
        <button class="btn btn--primary" :disabled="!canSave || saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </header>

    <ErrorBanner v-if="error" :message="error" retryable @retry="load" @close="error = ''" />
    <p v-if="notice" class="profile__notice">{{ notice }}</p>

    <div class="profile__body">
      <div class="profile__form">
        <label class="field">
          <span>名称</span>
          <input v-model="form.name" maxlength="40" placeholder="FishMatrix Agent" />
        </label>

        <label class="field">
          <span>一句话介绍</span>
          <input v-model="form.tagline" maxlength="60" placeholder="内网智能运维助手" />
        </label>

        <div class="field">
          <span>3D 形象</span>
          <div class="styles">
            <button
              v-for="item in STYLES"
              :key="item.id"
              class="styles__item"
              :class="{ 'is-active': form.avatar.style === item.id }"
              @click="form.avatar.style = item.id"
            >
              <AgentAvatar :style="item.id" :primary="form.avatar.primary" :accent="form.avatar.accent" :size="52" :spin="false" />
              <b>{{ item.label }}</b>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>

        <div class="field field--row">
          <label>
            <span>主色</span>
            <input v-model="form.avatar.primary" type="color" />
          </label>
          <label>
            <span>辅色</span>
            <input v-model="form.avatar.accent" type="color" />
          </label>
          <label>
            <span>主题色</span>
            <input v-model="form.theme" type="color" />
          </label>
        </div>

        <div class="field field--row">
          <label>
            <span>尺寸 {{ form.avatar.size }}px</span>
            <input v-model.number="form.avatar.size" type="range" min="48" max="160" step="4" />
          </label>
          <label class="field--check">
            <input v-model="form.avatar.spin" type="checkbox" />
            <span>旋转</span>
          </label>
          <label class="field--check">
            <input v-model="form.show_status_bar" type="checkbox" />
            <span>显示状态栏</span>
          </label>
        </div>

        <label class="field">
          <span>问候语</span>
          <textarea v-model="form.greeting" rows="3" maxlength="200" placeholder="进入对话页时展示的第一句话" />
        </label>

        <div class="field">
          <span>推荐问题（最多 6 条，点一下就能直接发）</span>
          <div v-for="(item, index) in form.suggestions" :key="index" class="suggest">
            <input v-model="form.suggestions[index]" maxlength="60" placeholder="例如：发布流程是什么？" />
            <button class="btn btn--ghost" @click="removeSuggestion(index)">删</button>
          </div>
          <button class="btn btn--ghost" :disabled="form.suggestions.length >= 6" @click="addSuggestion">+ 添加一条</button>
        </div>
      </div>

      <aside class="profile__preview">
        <p class="profile__preview-label">对话页预览</p>
        <div class="preview" :style="{ borderColor: form.theme }">
          <header class="preview__bar" :style="{ color: form.theme }">
            <span class="preview__dot" />
            <strong>{{ form.name || '未命名' }}</strong>
            <span v-if="form.show_status_bar" class="preview__sub">模型 qwen2.5 · 审计库 OK</span>
          </header>
          <div class="preview__body">
            <AgentAvatar
              :style="form.avatar.style"
              :primary="form.avatar.primary"
              :accent="form.avatar.accent"
              :size="form.avatar.size"
              :spin="form.avatar.spin"
            />
            <p class="preview__tagline">{{ form.tagline }}</p>
            <p class="preview__greeting">{{ form.greeting }}</p>
            <div class="preview__chips">
              <span v-for="(item, index) in form.suggestions.filter(Boolean)" :key="index">{{ item }}</span>
            </div>
          </div>
        </div>
        <p class="profile__preview-tip">右侧是真实组件渲染，保存前就能看到最终效果。</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.profile {
  padding: 20px 24px 40px;
  color: var(--text, #d4d4d4);
}

.profile__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.profile__title {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.profile__title h1 {
  margin: 0 0 4px;
  font-size: 18px;
}

.profile__hint {
  margin: 0;
  max-width: 640px;
  color: #9d9d9d;
  font-size: 12px;
  line-height: 1.6;
}

.profile__back {
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: inherit;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}

.profile__actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid #3c3c3c;
  background: #2d2d30;
  color: inherit;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: #0e639c;
  border-color: #1177bb;
  color: #fff;
}

.btn--ghost {
  background: transparent;
}

.profile__error,
.profile__notice {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.profile__error {
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.4);
  color: #f85149;
}

.profile__notice {
  background: rgba(63, 185, 80, 0.12);
  border: 1px solid rgba(63, 185, 80, 0.4);
  color: #3fb950;
}

.profile__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
  align-items: start;
}

.profile__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  padding: 16px;
  background: #252526;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #bdbdbd;
}

.field--row {
  flex-direction: row;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
}

.field--row label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field--check {
  flex-direction: row !important;
  align-items: center;
  gap: 6px !important;
  color: #d4d4d4;
}

.field input:not([type='color']):not([type='range']),
.field textarea {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  color: inherit;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
}

.field textarea {
  resize: vertical;
}

.field input[type='color'] {
  width: 44px;
  height: 28px;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  background: #1e1e1e;
  padding: 2px;
}

.styles {
  display: flex;
  gap: 10px;
}

.styles__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  background: #1e1e1e;
  color: inherit;
  padding: 10px 6px;
  cursor: pointer;
}

.styles__item.is-active {
  border-color: #58a6ff;
  box-shadow: 0 0 0 1px #58a6ff inset;
}

.styles__item small {
  color: #8b8b8b;
  font-size: 11px;
}

.suggest {
  display: flex;
  gap: 6px;
}

.suggest input {
  flex: 1;
}

.profile__preview {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile__preview-label,
.profile__preview-tip {
  margin: 0;
  color: #8b8b8b;
  font-size: 11px;
}

.preview {
  border: 1px solid #3c3c3c;
  border-radius: 10px;
  overflow: hidden;
  background: #1e1e1e;
}

.preview__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #333;
  font-size: 13px;
}

.preview__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3fb950;
}

.preview__sub {
  color: #8b8b8b;
  font-size: 11px;
}

.preview__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 16px 24px;
  text-align: center;
}

.preview__tagline {
  margin: 0;
  color: #8b8b8b;
  font-size: 12px;
}

.preview__greeting {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #d4d4d4;
}

.preview__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
}

.preview__chips span {
  border: 1px solid #3c3c3c;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  color: #bdbdbd;
}
</style>
