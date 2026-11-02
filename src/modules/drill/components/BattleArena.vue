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

let raf = 0
let last = 0
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
  raf = window.requestAnimationFrame(loop)
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
  window.cancelAnimationFrame(raf)
  raf = window.requestAnimationFrame(loop)
}

function pause() {
  playing.value = false
  window.cancelAnimationFrame(raf)
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
    cursor.value = 0
    floaters.value = []
    finished.value = false
    play()
  },
)

onBeforeUnmount(() => {
  pause()
  window.clearTimeout(bannerTimer)
  window.clearTimeout(shakeTimer)
})
</script>

<template>
  <div v-if="ui.arenaOpen && trace" class="drill__overlay drill__overlay--arena" role="dialog" aria-modal="true" aria-label="演练观察窗">
    <div class="drill__modal drill__modal--arena">
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
        <button type="button" class="drill__ghost" @click="restart()">重播</button>
        <button type="button" class="drill__primary" @click="ui.closeArena()">收起</button>
      </footer>
    </div>
  </div>
</template>
