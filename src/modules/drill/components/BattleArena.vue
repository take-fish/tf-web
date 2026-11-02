<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

/**
 * 演练观察窗。
 *
 * 引擎先在瞬间算完一局并留下轨迹（帧 + 事件），这里按 0.1s 一帧把它「演」出来：
 * 透视棋盘、血条、伤害飘字、技能横幅、击杀碎裂、重击震屏。
 * 观察窗不承担伪装职责，放开做打击感。
 */

interface Floater {
  id: number
  x: number
  y: number
  text: string
  kind: 'hit' | 'down' | 'heal'
}

const drill = useDrillStore()
const ui = useDrillUiStore()

const trace = computed(() => drill.lastTrace)
const battle = computed(() => drill.lastBattle)
const frames = computed(() => trace.value?.frames ?? [])
const duration = computed(() => trace.value?.duration ?? 0)
const meta = computed(() => new Map((trace.value?.units ?? []).map((unit) => [unit.uid, unit])))

const cursor = ref(0)
const playing = ref(false)
const speed = ref(1)
const zoom = ref(1)
const floaters = ref<Floater[]>([])
const banner = ref<{ name: string; text: string } | null>(null)
const shakeActive = ref(false)
const finished = ref(false)

/** 观察窗尺寸：默认跟随视口，也可以拖右下角改，或用 小/中/大/满 预设。 */
const winW = ref(1120)
const winH = ref(700)
const sizePreset = ref<'sm' | 'md' | 'lg' | 'full'>('md')

function clampSize(width: number, height: number) {
  const maxW = window.innerWidth - 24
  const maxH = window.innerHeight - 24
  return {
    width: Math.round(Math.max(560, Math.min(width, maxW))),
    height: Math.round(Math.max(420, Math.min(height, maxH))),
  }
}

function applyPreset(preset: 'sm' | 'md' | 'lg' | 'full') {
  sizePreset.value = preset
  const vw = window.innerWidth
  const vh = window.innerHeight
  const table = {
    sm: [760, 520],
    md: [1040, 680],
    lg: [Math.min(1440, vw - 40), Math.min(900, vh - 40)],
    full: [vw - 24, vh - 24],
  } as const
  const [width, height] = table[preset]
  const size = clampSize(width, height)
  winW.value = size.width
  winH.value = size.height
}

interface ResizeState {
  x: number
  y: number
  w: number
  h: number
}

let resizing: ResizeState | null = null

function startResize(event: PointerEvent) {
  event.preventDefault()
  resizing = { x: event.clientX, y: event.clientY, w: winW.value, h: winH.value }
  sizePreset.value = 'md'
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', stopResize)
}

function onResizeMove(event: PointerEvent) {
  if (!resizing) return
  const size = clampSize(
    resizing.w + (event.clientX - resizing.x),
    resizing.h + (event.clientY - resizing.y),
  )
  winW.value = size.width
  winH.value = size.height
}

function stopResize() {
  resizing = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
}

function onWindowResize() {
  const size = clampSize(winW.value, winH.value)
  winW.value = size.width
  winH.value = size.height
}

let raf = 0
let timer = 0
let last = 0

/** jsdom 里可能没有 rAF，退化成 setTimeout。 */
function schedule(callback: (time: number) => void) {
  if (typeof window.requestAnimationFrame === 'function') {
    raf = window.requestAnimationFrame(callback)
    return
  }
  timer = window.setTimeout(() => callback(performance.now()), 16)
}

function cancel(callbackFrame: number) {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(callbackFrame)
  if (timer) window.clearTimeout(timer)
  timer = 0
}
let floaterId = 0
let bannerTimer = 0
let shakeTimer = 0

const frame = computed(
  () => frames.value[Math.min(frames.value.length - 1, Math.floor(cursor.value / 0.1))] ?? null,
)

const placed = computed(() => {
  const current = frame.value
  if (!current) return []
  return current.units.map((unit) => {
    const info = meta.value.get(unit.uid)
    return {
      uid: unit.uid,
      col: unit.col,
      row: unit.row,
      hp: unit.hp,
      alive: unit.alive,
      name: info?.name ?? unit.uid,
      side: info?.side ?? 'ally',
      maxHp: info?.maxHp ?? 1,
    }
  })
})

const progress = computed(() => (duration.value === 0 ? 0 : (cursor.value / duration.value) * 100))

function cell(col: number, row: number) {
  return {
    left: `${(col / 7) * 100}%`,
    top: `${(row / 4) * 100}%`,
    width: `${100 / 7}%`,
    height: `${100 / 4}%`,
  }
}

function hpWidth(hp: number, maxHp: number): string {
  return `${Math.max(0, Math.min(1, hp / Math.max(1, maxHp))) * 100}%`
}

function pushFloater(item: Omit<Floater, 'id'>) {
  const id = ++floaterId
  floaters.value = [...floaters.value, { ...item, id }]
  window.setTimeout(() => {
    floaters.value = floaters.value.filter((entry) => entry.id !== id)
  }, 720)
}

function flashShake() {
  shakeActive.value = true
  window.clearTimeout(shakeTimer)
  shakeTimer = window.setTimeout(() => {
    shakeActive.value = false
  }, 160)
}

function process(from: number, to: number) {
  const source = trace.value
  if (!source) return
  const current = frame.value
  for (const event of source.events) {
    if (event.t <= from || event.t > to) continue

    if (event.kind === 'hit' && event.targetId) {
      const target = current?.units.find((unit) => unit.uid === event.targetId)
      if (!target) continue
      pushFloater({
        x: ((target.col + 0.5) / 7) * 100,
        y: ((target.row + 0.5) / 4) * 100,
        text: `-${event.amount ?? 0}`,
        kind: 'hit',
      })
      if ((event.amount ?? 0) > 55) flashShake()
      continue
    }

    if (event.kind === 'skill') {
      const caster = meta.value.get(event.uid)
      banner.value = { name: caster?.name ?? '', text: event.text ?? '' }
      window.clearTimeout(bannerTimer)
      bannerTimer = window.setTimeout(() => {
        banner.value = null
      }, 950)
      continue
    }

    if (event.kind === 'down') {
      const unit = current?.units.find((entry) => entry.uid === event.uid)
      if (!unit) continue
      pushFloater({
        x: ((unit.col + 0.5) / 7) * 100,
        y: ((unit.row + 0.5) / 4) * 100,
        text: '退役',
        kind: 'down',
      })
    }
  }
}

function loop(time: number) {
  if (!playing.value) return
  const dt = last === 0 ? 0.016 : Math.min(0.05, (time - last) / 1000)
  last = time
  const from = cursor.value
  const next = Math.min(duration.value, from + dt * speed.value)
  cursor.value = next
  process(from, next)

  if (next >= duration.value) {
    playing.value = false
    finished.value = true
    last = 0
    return
  }
  schedule(loop)
}

function play() {
  if (duration.value === 0) return
  if (cursor.value >= duration.value) {
    cursor.value = 0
    floaters.value = []
    finished.value = false
  }
  playing.value = true
  last = 0
  cancel(raf)
  raf = 0
  schedule(loop)
}

function pause() {
  playing.value = false
  cancel(raf)
  raf = 0
}

function toggle() {
  if (playing.value) pause()
  else play()
}

function seek(value: number) {
  pause()
  cursor.value = value
  floaters.value = []
  finished.value = value >= duration.value
}

function restart() {
  cursor.value = 0
  floaters.value = []
  finished.value = false
  play()
}

watch(
  () => ui.arenaOpen,
  (open) => {
    pause()
    if (!open) return
    applyPreset(sizePreset.value)
    cursor.value = 0
    floaters.value = []
    finished.value = false
    play()
  },
)

window.addEventListener('resize', onWindowResize)

onBeforeUnmount(() => {
  pause()
  stopResize()
  window.removeEventListener('resize', onWindowResize)
  window.clearTimeout(bannerTimer)
  window.clearTimeout(shakeTimer)
})
</script>

<template>
  <div v-if="ui.arenaOpen && trace" class="drill__overlay drill__overlay--arena" role="dialog" aria-modal="true" aria-label="演练观察窗">
    <div
      class="drill__modal drill__modal--arena"
      :style="{ width: `${winW}px`, height: `${winH}px` }"
    >
      <span class="drill__arena-resize" title="拖动调整窗口大小" @pointerdown="startResize" />
      <header class="drill__arena-head">
        <div class="drill__arena-title">
          <span class="drill__eyebrow">ALIGNMENT ARENA</span>
          <b>演练观察窗 · 第 {{ battle?.round ?? 0 }} 轮 · {{ battle?.opponent ?? '对照组' }}</b>
        </div>
        <div class="drill__arena-head-right">
          <span class="drill__arena-score" :class="battle?.won ? 'is-ok' : 'is-err'">
            {{ battle?.won ? '通过' : '未通过' }}
          </span>
          <span class="drill__mono drill__arena-clock">{{ cursor.toFixed(1) }}s / {{ duration.toFixed(1) }}s</span>
          <button type="button" class="drill__icon-btn" aria-label="关闭" @click="ui.closeArena()">
            ×
          </button>
        </div>
      </header>

      <div class="drill__arena-stage">
        <div class="drill__arena-persp" :class="{ 'is-shaking': shakeActive }">
          <div class="drill__arena-floor" :style="{ transform: `rotateX(16deg) scale(${zoom})` }">
            <span class="drill__arena-zone drill__arena-zone--ally" />
            <span class="drill__arena-zone drill__arena-zone--enemy" />

            <div
              v-for="unit in placed"
              :key="unit.uid"
              class="drill__arena-unit"
              :class="[`is-${unit.side}`, { 'is-dead': !unit.alive }]"
              :style="cell(unit.col, unit.row)"
            >
              <b>{{ unit.name }}</b>
              <span class="drill__arena-hp">
                <i :style="{ width: hpWidth(unit.hp, unit.maxHp) }" />
              </span>
            </div>

            <span
              v-for="floater in floaters"
              :key="floater.id"
              class="drill__arena-float"
              :class="`is-${floater.kind}`"
              :style="{ left: `${floater.x}%`, top: `${floater.y}%` }"
            >
              {{ floater.text }}
            </span>
          </div>
        </div>

        <div v-if="banner" class="drill__arena-banner">
          <span>{{ banner.name }}</span>
          <b>{{ banner.text }}</b>
        </div>

        <div v-if="finished" class="drill__arena-result">
          <span class="drill__mono">SLI {{ battle?.sliBefore }} → {{ battle?.sliAfter }}</span>
          <b>对齐完成</b>
          <span>剩余实例 {{ battle?.survivors ?? 0 }}</span>
        </div>
      </div>

      <footer class="drill__arena-controls">
        <button type="button" class="drill__primary" @click="toggle()">
          {{ playing ? '暂停' : finished ? '重播' : '播放' }}
        </button>
        <div class="drill__arena-speeds">
          <button
            v-for="value in [1, 2, 4]"
            :key="value"
            type="button"
            class="drill__ghost"
            :class="{ 'is-on': speed === value }"
            @click="speed = value"
          >
            {{ value }}×
          </button>
        </div>
        <label class="drill__arena-zoom">
          缩放
          <input v-model.number="zoom" type="range" min="0.8" max="1.8" step="0.05" />
          <span class="drill__mono">{{ zoom.toFixed(2) }}×</span>
        </label>
        <input
          class="drill__arena-scrub"
          type="range"
          min="0"
          :max="duration"
          step="0.05"
          :value="cursor"
          aria-label="进度"
          @input="seek(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="drill__arena-pct drill__mono">{{ Math.round(progress) }}%</span>
        <div class="drill__arena-sizes">
          <button
            v-for="preset in (['sm', 'md', 'lg', 'full'] as const)"
            :key="preset"
            type="button"
            class="drill__ghost"
            :class="{ 'is-on': sizePreset === preset }"
            @click="applyPreset(preset)"
          >
            {{ { sm: '小', md: '中', lg: '大', full: '满' }[preset] }}
          </button>
        </div>
        <button type="button" class="drill__ghost" @click="restart()">重播</button>
        <button type="button" class="drill__primary" @click="ui.closeArena()">收起</button>
      </footer>
    </div>
  </div>
</template>
