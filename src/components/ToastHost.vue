<script setup lang="ts">
import { dismissToast, toasts } from '@/lib/toast'

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非 https / 无权限时静默：不打断用户
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="`toast--${item.kind}`">
        <p class="toast__text">{{ item.message }}</p>
        <div class="toast__actions">
          <button v-if="item.code" class="toast__btn" title="复制错误编号" @click="copy(item.code)">复制编号</button>
          <button class="toast__btn" title="关闭" @click="dismissToast(item.id)">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 380px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #e6edf3;
  background: #21262d;
  border: 1px solid #30363d;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.toast--error {
  border-color: rgba(248, 81, 73, 0.6);
  background: #2a1c1d;
}

.toast--success {
  border-color: rgba(63, 185, 80, 0.6);
  background: #1b2a1e;
}

.toast__text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.toast__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
}

.toast__btn {
  border: 1px solid #3c3c3c;
  background: transparent;
  color: #9da7b3;
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.toast__btn:hover {
  color: #e6edf3;
  border-color: #58a6ff;
}
</style>
