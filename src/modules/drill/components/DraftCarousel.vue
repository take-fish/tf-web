<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useDrillStore } from '../stores/drill'

/**
 * 选秀轮盘。
 *
 * 8 个候选挂在圆环上缓慢旋转，主体（小小英雄位）在环内移动：
 * ← → 或点击候选改变目标角度，靠到候选身边即完成抢夺。
 * 20 秒未选则自动抢最近的一个。
 */

const drill = useDrillStore()

const items = computed(() => drill.snapshot.carousel)
const open = computed(() => items.value.length > 0)

const RADIUS = 132
const AVATAR_RADIUS = 104
const ROTATE_SPEED = 4
const WALK_SPEED = 150
const GRAB = 9

const rotation = ref(0)
const avatarAngle = ref(90)
const target = ref<number | null>(null)
const remaining = ref(20)
const pulse = ref<string | null>(null)

let raf = 0
let ticker = 0
let last = 0
let busy = false

function normalize(angle: number): number {
  return ((angle % 360) + 360) % 360
}

function diff(a: number, b: number): number {
  let value = normalize(a - b)
  if (value > 180) value -= 360
  return value
}

function screenAngle(base: number): number {
  return normalize(base + rotation.value)
}

const CENTER = 170

function unitStyle(angle: number) {
  const rad = (angle * Math.PI) / 180
  return {
    left: `${CENTER + Math.cos(rad) * RADIUS}px`,
    top: `${CENTER + Math.sin(rad) * RADIUS}px`,
  }
}

function avatarStyle() {
  const rad = (avatarAngle.value * Math.PI) / 180
  return {
    left: `${CENTER + Math.cos(rad) * AVATAR_RADIUS}px`,
    top: `${CENTER + Math.sin(rad) * AVATAR_RADIUS}px`,
  }
}

function pick(id: string) {
  if (busy) return
  busy = true
  pulse.value = id
  window.setTimeout(() => {
    drill.pickCarousel(id)
    busy = false
    pulse.value = null
  }, 180)
}

function autoPick() {
  const list = items.value
  if (list.length === 0) return
  let best = list[0]
  if (!best) return
  let bestDiff = 999
  for (const item of list) {
    const value = Math.abs(diff(avatarAngle.value, screenAngle(item.angle)))
    if (value < bestDiff) {
      bestDiff = value
      best = item
    }
  }
  pick(best.id)
}

function frame(time: number) {
  const dt = last === 0 ? 0 : Math.min(0.05, (time - last) / 1000)
  last = time
  rotation.value = normalize(rotation.value + ROTATE_SPEED * dt)

  if (target.value !== null) {
    const delta = diff(target.value, avatarAngle.value)
    const step = WALK_SPEED * dt
    if (Math.abs(delta) <= step) {
      avatarAngle.value = normalize(target.value)
      target.value = null
    } else {
      avatarAngle.value = normalize(avatarAngle.value + Math.sign(delta) * step)
    }
  }

  for (const item of items.value) {
    if (Math.abs(diff(avatarAngle.value, screenAngle(item.angle))) < GRAB) {
      pick(item.id)
      break
    }
  }

  raf = window.requestAnimationFrame(frame)
}

function start() {
  last = 0
  raf = window.requestAnimationFrame(frame)
  ticker = window.setInterval(() => {
    remaining.value -= 1
    if (remaining.value <= 0) {
      window.clearInterval(ticker)
      ticker = 0
      autoPick()
    }
  }, 1000)
}

function stop() {
  if (raf) window.cancelAnimationFrame(raf)
  if (ticker) window.clearInterval(ticker)
  raf = 0
  ticker = 0
}

function onKey(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const step = event.key === 'ArrowLeft' ? -22 : 22
  target.value = normalize((target.value ?? avatarAngle.value) + step)
}

function aim(angle: number) {
  if (busy) return
  target.value = screenAngle(angle)
}

watch(
  open,
  (value) => {
    stop()
    if (!value) return
    remaining.value = 20
    rotation.value = 0
    avatarAngle.value = 90
    target.value = null
    start()
  },
  { immediate: true },
)

window.addEventListener('keydown', onKey)

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="open" class="drill__overlay" role="dialog" aria-modal="true" aria-label="资源选型轮盘">
    <div class="drill__modal drill__modal--draft">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">CAPACITY DRAFT</span>
          <b>资源选型 · 第 {{ drill.snapshot.stageLabel }} 回合开始</b>
        </div>
        <div class="drill__draft-clock" :class="{ 'is-warn': remaining <= 5 }">
          {{ remaining }}s
        </div>
      </header>

      <div class="drill__draft-body">
        <div class="drill__draft-ring">
          <span class="drill__draft-orbit" :class="{ 'is-pulse': pulse !== null }" />
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="drill__draft-item"
            :class="{ 'is-target': pulse === item.id }"
            :style="unitStyle(screenAngle(item.angle))"
            @click="aim(item.angle)"
          >
            <b>{{ item.name }}</b>
            <em>{{ item.cost }} 费</em>
            <span v-if="item.annotation" class="drill__draft-anno">{{ item.annotation }}</span>
          </button>

          <span class="drill__draft-avatar" :style="avatarStyle()">主体</span>
        </div>

        <aside class="drill__draft-hint">
          <b>行动说明</b>
          <p>方向键 ← → 移动主体，或直接点候选让主体走过去；靠到候选身边即完成抢夺。</p>
          <p>每个候选附带 1 件注解，抢到手后自动进入待命实例池。</p>
          <p class="drill__mono">剩余 {{ remaining }}s · 超时自动就近选取</p>
        </aside>
      </div>
    </div>
  </div>
</template>
