<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 显示名，用于无头像时的首字母占位。 */
    name?: string
    /** 用户中台标识，支持 u12 与 12；用于推导公开头像地址。 */
    userId?: string | number | null
    /** 明确的头像地址（自己的账号带版本号），优先级高于推导地址。 */
    src?: string | null
    /** 固定像素尺寸；不传时由外层样式控制。 */
    size?: number
  }>(),
  { name: '', userId: null, src: null, size: 0 },
)

const failed = ref(false)

const initial = computed(() =>
  (props.name || String(props.userId ?? '')).trim().slice(0, 1).toUpperCase(),
)

const url = computed(() => {
  if (props.src) return props.src
  const raw = String(props.userId ?? '').replace(/^u/i, '')
  return /^\d{1,18}$/.test(raw) ? `/api/v1/user/avatars/${raw}` : ''
})

const boxStyle = computed(() =>
  props.size > 0 ? { width: `${props.size}px`, height: `${props.size}px` } : undefined,
)

watch(url, () => {
  failed.value = false
})
</script>

<template>
  <span class="user-avatar" :style="boxStyle">
    <img
      v-if="url && !failed"
      class="user-avatar__img"
      :src="url"
      alt=""
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <template v-else>{{ initial }}</template>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  border-radius: 50%;
  line-height: 1;
}

.user-avatar__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
