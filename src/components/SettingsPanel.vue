<script setup lang="ts">
import { ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import type { ReaderTemplateId } from '@/stores/settings'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import { SKINS } from '@/skins/registry'

const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const identity = useIdentityStore()
const skinStore = useSkinStore()
const nickname = ref(identity.state.nickname)

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
