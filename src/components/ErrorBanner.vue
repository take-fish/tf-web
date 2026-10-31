<script setup lang="ts">
/** 页面内错误横幅：支持重试与复制错误编号。 */
const props = withDefaults(
  defineProps<{
    message: string
    code?: string
    retryable?: boolean
    retryLabel?: string
  }>(),
  { code: '', retryable: false, retryLabel: '重试' },
)

const emit = defineEmits<{ retry: []; close: [] }>()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code ? `${props.message}（编号 ${props.code}）` : props.message)
  } catch {
    // 忽略剪贴板不可用
  }
}
</script>

<template>
  <div v-if="message" class="banner" role="alert">
    <span class="banner__icon">!</span>
    <p class="banner__text">{{ message }}</p>
    <div class="banner__actions">
      <button class="banner__btn" title="复制错误信息" @click="copy">复制</button>
      <button v-if="retryable" class="banner__btn banner__btn--primary" @click="emit('retry')">{{ retryLabel }}</button>
      <button class="banner__btn" title="关闭" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(248, 81, 73, 0.45);
  background: rgba(248, 81, 73, 0.1);
  color: #ffb4ae;
  font-size: 12px;
}

.banner__icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(248, 81, 73, 0.85);
  color: #1b1b1b;
  font-weight: 700;
  font-size: 11px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.banner__text {
  margin: 0;
  flex: 1;
  line-height: 1.6;
  word-break: break-word;
}

.banner__actions {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}

.banner__btn {
  border: 1px solid rgba(248, 81, 73, 0.4);
  background: transparent;
  color: inherit;
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.banner__btn:hover {
  border-color: rgba(248, 81, 73, 0.8);
}

.banner__btn--primary {
  background: rgba(248, 81, 73, 0.85);
  color: #1b1b1b;
  border-color: transparent;
}
</style>
