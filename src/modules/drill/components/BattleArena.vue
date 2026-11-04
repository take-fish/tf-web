<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { UNIT_BY_ID } from '../core/content'
import { BATTLE_COLS } from '../core/combat'
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'
import DrillFigure from './DrillFigure.vue'

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
  kind: 'hit' | 'down' | 'heal' | 'skill'
}

interface Fx {
  id: number
  kind: 'slash' | 'beam' | 'line' | 'ring' | 'aura' | 'spark' | 'trail' | 'flash' | 'castring'
  /** 施法者定位：法师紫 / 肉盾绿 / 近战橙 / 远程青 */
  tone?: 'melee' | 'ranged' | 'mage' | 'tank'
  x: number
  y: number
  x2: number
  y2: number
}

const drill = useDrillStore()
const ui = useDrillUiStore()

const trace = computed(() => drill.preview?.trace ?? drill.lastTrace)
const battle = computed(() => drill.preview?.battle ?? drill.lastBattle)
const frames = computed(() => trace.value?.frames ?? [])
const duration = computed(() => trace.value?.duration ?? 0)
const meta = computed(() => new Map((trace.value?.units ?? []).map((unit) => [unit.uid, unit])))

const cursor = ref(0)
const playing = ref(false)
const speed = ref(1)
const zoom = ref(1)
const floaters = ref<Floater[]>([])
const banner = ref<{ name: string; text: string } | null>(null)
const finished = ref(false)

/** 动作态：谁在出击、谁在受击、谁在施法（按 uid 打标，200~600ms 自动消） */
const strikeUid = ref<string | null>(null)
const hitUid = ref<string | null>(null)
const castUid = ref<string | null>(null)
const fx = ref<Fx[]>([])
/** 近战突进方向（px），配合 CSS 变量做「走到目标身前再打」 */
const strikeVec = ref<{ uid: string; x: number; y: number } | null>(null)

const motionTimers = { strike: 0, hit: 0, cast: 0 }
let fxId = 0

function flagMotion(key: 'strike' | 'hit' | 'cast', uid: string) {
  const target = key === 'strike' ? strikeUid : key === 'hit' ? hitUid : castUid
  target.value = uid
  window.clearTimeout(motionTimers[key])
  motionTimers[key] = window.setTimeout(
    () => {
      if (target.value === uid) target.value = null
    },
    key === 'cast' ? 620 : key === 'hit' ? 220 : 200,
  )
}

function pushFx(item: Omit<Fx, 'id'>, life = 520) {
  const id = ++fxId
  fx.value = [...fx.value, { ...item, id }]
  window.setTimeout(() => {
    fx.value = fx.value.filter((entry) => entry.id !== id)
  }, life)
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

const MIN_W = 560
const MIN_H = 400

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** 浮动窗：默认居中，拖标题栏移动，拖八条边/角缩放。 */
const rect = ref<Rect>({ left: 0, top: 0, width: 1040, height: 680 })
let placedOnce = false
let dragging = false
let dragStart = { x: 0, y: 0, left: 0, top: 0 }
let resizing: { edge: Edge; x: number; y: number; base: Rect } | null = null

function clampRect(next: Rect): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.round(Math.max(MIN_W, Math.min(next.width, vw - 16)))
  const height = Math.round(Math.max(MIN_H, Math.min(next.height, vh - 16)))
  return {
    left: Math.round(Math.max(8, Math.min(next.left, vw - width - 8))),
    top: Math.round(Math.max(8, Math.min(next.top, vh - height - 8))),
    width,
    height,
  }
}

function resetWindow() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(1040, vw - 80)
  const height = Math.min(680, vh - 80)
  rect.value = clampRect({ left: (vw - width) / 2, top: (vh - height) / 2, width, height })
}

function onDragMove(event: PointerEvent) {
  if (!dragging) return
  rect.value = clampRect({
    ...rect.value,
    left: dragStart.left + (event.clientX - dragStart.x),
    top: dragStart.top + (event.clientY - dragStart.y),
  })
}

function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', stopDrag)
}

function startDrag(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (target.closest('button, input, .drill__arena-grip')) return
  event.preventDefault()
  dragging = true
  dragStart = { x: event.clientX, y: event.clientY, left: rect.value.left, top: rect.value.top }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', stopDrag)
}

function onResizeMove(event: PointerEvent) {
  if (!resizing) return
  const { edge, x, y, base } = resizing
  const dx = event.clientX - x
  const dy = event.clientY - y
  let { left, top, width, height } = base

  if (edge.includes('e')) width = base.width + dx
  if (edge.includes('s')) height = base.height + dy
  if (edge.includes('w')) {
    width = base.width - dx
    left = base.left + dx
  }
  if (edge.includes('n')) {
    height = base.height - dy
    top = base.top + dy
  }

  const bounded = clampRect({ left, top, width, height })
  // 从左边/上边拖到最小尺寸时，把被吃掉的位移还回去，避免右/下边漂移
  if (edge.includes('w') && bounded.width > width) left = base.left + base.width - bounded.width
  if (edge.includes('n') && bounded.height > height) top = base.top + base.height - bounded.height
  rect.value = clampRect({ left, top, width: bounded.width, height: bounded.height })
}

function stopResize() {
  resizing = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
}

function startResize(event: PointerEvent, edge: Edge) {
  event.preventDefault()
  event.stopPropagation()
  resizing = { edge, x: event.clientX, y: event.clientY, base: { ...rect.value } }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', stopResize)
}

function onWindowResize() {
  rect.value = clampRect(rect.value)
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
      mana: unit.mana,
      alive: unit.alive,
      name: info?.name ?? unit.uid,
      side: info?.side ?? 'ally',
      maxHp: info?.maxHp ?? 1,
      star: info?.star ?? 1,
      role: info?.role ?? 'melee',
      annotations: info?.annotations ?? [],
    }
  })
})

const progress = computed(() => (duration.value === 0 ? 0 : (cursor.value / duration.value) * 100))

function cell(col: number, row: number) {
  return {
    left: `${(col / BATTLE_COLS) * 100}%`,
    top: `${(row / 4) * 100}%`,
    width: `${100 / BATTLE_COLS}%`,
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


function at(uid: string | undefined): { x: number; y: number } | null {
  if (uid === undefined) return null
  const unit = frame.value?.units.find((entry) => entry.uid === uid)
  if (!unit) return null
  return { x: ((unit.col + 0.5) / BATTLE_COLS) * 100, y: ((unit.row + 0.5) / 4) * 100 }
}

/** 技能形态 → 观察窗里的特效：单体=光束，直线=粗光束，AOE=扩散环，增益=脚下光环，持续=回升粒子 */
/** 技能名 → 稳定的视觉签名：同一技能每次长得一样，不同技能之间能区分开 */
function skillSignature(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997
  }
  return hash
}

function skillFx(
  kind: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  tone: Fx['tone'] | undefined,
  name: string,
) {
  const seed = skillSignature(name)
  const sparks = 2 + (seed % 3)
  const layers = 1 + (seed % 2)
  if (kind === 'single') {
    pushFx({ kind: 'beam', x: from.x, y: from.y, x2: to.x, y2: to.y, tone }, 320 + (seed % 120))
    for (let index = 0; index < sparks; index += 1) {
      pushFx(
        {
          kind: 'spark',
          x: to.x + Math.sin((seed + index * 47) % 360) * 1.6,
          y: to.y + Math.cos((seed + index * 53) % 360) * 1.4,
          x2: to.x,
          y2: to.y,
          tone,
        },
        520 + index * 60,
      )
    }
  } else if (kind === 'line') {
    for (let index = 0; index < layers + 1; index += 1) {
      pushFx(
        { kind: 'line', x: from.x, y: from.y + index * 0.4, x2: to.x, y2: to.y + index * 0.4, tone },
        360 + index * 70,
      )
    }
  } else if (kind === 'aoe') {
    for (let index = 0; index < layers + 1; index += 1) {
      pushFx({ kind: 'ring', x: to.x, y: to.y, x2: to.x, y2: to.y, tone }, 480 + index * 110)
    }
  } else if (kind === 'buff') {
    pushFx({ kind: 'aura', x: from.x, y: from.y, x2: from.x, y2: from.y, tone }, 700)
    if (seed % 2 === 0) pushFx({ kind: 'ring', x: from.x, y: from.y, x2: from.x, y2: from.y, tone }, 520)
  } else {
    for (let index = 0; index < sparks + 1; index += 1) {
      const angle = (seed % 360) + index * 60
      pushFx(
        {
          kind: 'spark',
          x: to.x + Math.sin((angle * Math.PI) / 180) * 1.8,
          y: to.y + Math.cos((angle * Math.PI) / 180) * 1.5,
          x2: to.x,
          y2: to.y,
          tone,
        },
        520 + index * 70,
      )
    }
  }
}

function process(from: number, to: number) {
  const source = trace.value
  if (!source) return

  for (const event of source.events) {
    if (event.t <= from || event.t > to) continue

    if (event.kind === 'hit' && event.targetId) {
      const target = at(event.targetId)
      if (!target) continue
      const attacker = at(event.uid)
      flagMotion('strike', event.uid)
      flagMotion('hit', event.targetId)
      pushFloater({ ...target, text: `-${event.amount ?? 0}`, kind: 'hit' })
      if (!attacker) continue

      const dx = target.x - attacker.x
      const dy = target.y - attacker.y
      const gap = Math.hypot(dx, dy)
      if (gap > 8) {
        // 远程：从施法者射出一道射线，命中点再补一次闪光
        pushFx({ kind: 'beam', x: attacker.x, y: attacker.y, x2: target.x, y2: target.y }, 260)
        pushFx({ kind: 'flash', x: attacker.x, y: attacker.y, x2: attacker.x, y2: attacker.y }, 160)
      } else {
        // 近战：先突进到目标身前，再出刀
        const len = Math.hypot(dx, dy) || 1
        strikeVec.value = { uid: event.uid, x: (dx / len) * 22, y: (dy / len) * 22 }
        pushFx({ kind: 'slash', x: target.x, y: target.y, x2: target.x, y2: target.y }, 240)
        pushFx({ kind: 'flash', x: target.x, y: target.y, x2: target.x, y2: target.y }, 220)
      }
      continue
    }

    if (event.kind === 'skill') {
      const caster = meta.value.get(event.uid)
      const casterAt = at(event.uid)
      const targetAt = at(event.targetId) ?? casterAt
      const form = caster ? UNIT_BY_ID[caster.defId]?.skill.form : undefined
      if (casterAt) flagMotion('cast', event.uid)
      if (casterAt) {
        pushFx({ kind: 'castring', x: casterAt.x, y: casterAt.y, x2: casterAt.x, y2: casterAt.y }, 430)
        if (targetAt && form) skillFx(form, casterAt, targetAt, caster?.role, event.text ?? '技能')
      }

      if (casterAt) {
        pushFloater({ x: casterAt.x, y: casterAt.y - 3, text: event.text ?? '技能', kind: 'skill' })
      }
      banner.value = { name: caster?.name ?? '', text: event.text ?? '' }
      window.clearTimeout(bannerTimer)
      bannerTimer = window.setTimeout(() => {
        banner.value = null
      }, 950)
      continue
    }

    if (event.kind === 'surge') {
      const timedOut = (event.text ?? '').includes('到点')
      banner.value = { name: timedOut ? '到点判定' : '数值膨胀', text: event.text ?? '' }
      window.clearTimeout(bannerTimer)
      bannerTimer = window.setTimeout(() => {
        banner.value = null
      }, timedOut ? 1800 : 1300)
      pushFx({ kind: 'ring', x: 50, y: 50, x2: 50, y2: 50 }, 900)
      for (const unit of frame.value?.units ?? []) {
        if (!unit.alive) continue
        const pos = at(unit.uid)
        if (pos) pushFx({ kind: 'aura', x: pos.x, y: pos.y, x2: pos.x, y2: pos.y }, 760)
      }
      continue
    }

    if (event.kind === 'down') {
      const unit = at(event.uid)
      if (!unit) continue
      pushFloater({ ...unit, text: '退役', kind: 'down' })
      pushFx({ kind: 'ring', x: unit.x, y: unit.y, x2: unit.x, y2: unit.y }, 520)
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
    clearMotion()
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

function closeArena() {
  drill.clearPreview()
  ui.closeArena()
}

function clearMotion() {
  floaters.value = []
  fx.value = []
  strikeUid.value = null
  hitUid.value = null
  castUid.value = null
  strikeVec.value = null
}

function seek(value: number) {
  pause()
  cursor.value = value
  clearMotion()
  finished.value = value >= duration.value
}

function restart() {
  cursor.value = 0
  clearMotion()
  finished.value = false
  play()
}

watch(
  () => ui.arenaOpen,
  (open) => {
    pause()
    if (!open) return
    if (placedOnce) rect.value = clampRect(rect.value)
    else {
      resetWindow()
      placedOnce = true
    }
    cursor.value = 0
    clearMotion()
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
})
</script>

<template>
  <div v-if="ui.arenaOpen && trace" class="drill__overlay drill__overlay--arena" role="dialog" aria-modal="true" aria-label="演练观察窗">
    <div
      class="drill__modal drill__modal--arena"
      :style="{
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }"
    >
      <span
        v-for="edge in RESIZE_EDGES"
        :key="edge"
        class="drill__arena-grip"
        :class="`is-${edge}`"
        :title="`拖动缩放（${edge}）`"
        @pointerdown="startResize($event, edge)"
      />
      <header class="drill__arena-head" title="拖动移动窗口" @pointerdown="startDrag">
        <div class="drill__arena-title">
          <span class="drill__eyebrow">ALIGNMENT ARENA</span>
          <b>演练观察窗 · 第 {{ battle?.round ?? 0 }} 轮 · {{ battle?.opponent ?? '对照组' }}</b>
        </div>
        <div class="drill__arena-head-right">
          <span class="drill__arena-score" :class="battle?.won ? 'is-ok' : 'is-err'">
            {{ battle?.won ? '通过' : '未通过' }}
          </span>
          <span class="drill__mono drill__arena-clock">{{ cursor.toFixed(1) }}s / {{ duration.toFixed(1) }}s</span>
          <button type="button" class="drill__icon-btn" aria-label="关闭" @click="closeArena()">
            ×
          </button>
        </div>
      </header>

      <div class="drill__arena-stage">
        <div class="drill__arena-persp">
          <div class="drill__arena-floor" :style="{ transform: `rotateX(16deg) scale(${zoom})` }">
            <span class="drill__arena-zone drill__arena-zone--ally" />
            <span class="drill__arena-zone drill__arena-zone--enemy" />

            <div
              v-for="unit in placed"
              :key="unit.uid"
              class="drill__arena-unit"
              :class="[`is-${unit.side}`, `role-${unit.role}`, { 'is-down': !unit.alive }]"
              :style="cell(unit.col, unit.row)"
            >
              <span
                class="drill__arena-fig-wrap"
                :class="{
                  'is-striking': strikeUid === unit.uid,
                  'is-hit': hitUid === unit.uid,
                  'is-casting': castUid === unit.uid,
                }"
              >
                <DrillFigure :side="unit.side" :dead="!unit.alive" />
              </span>
              <span class="drill__arena-name">{{ unit.name }}</span>
              <span class="drill__arena-bars">
                <span class="drill__arena-hp">
                  <i :style="{ width: hpWidth(unit.hp, unit.maxHp) }" />
                </span>
                <span class="drill__arena-mana">
                  <i :style="{ width: hpWidth(unit.mana, 100) }" />
                </span>
              </span>
              <span class="drill__arena-tags">
                <em class="drill__arena-star">{{ '★'.repeat(unit.star) }}</em>
                <em v-for="note in unit.annotations" :key="note" class="drill__arena-note">{{ note }}</em>
              </span>
            </div>

            <svg class="drill__arena-fx" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <template v-for="item in fx" :key="item.id">
                <line
                  v-if="item.kind === 'beam' || item.kind === 'line'"
                  :key="item.id"
                  class="drill__fx-beam"
                  :class="[`is-${item.kind}`, item.tone ? `tone-${item.tone}` : '']"
                  :x1="item.x"
                  :y1="item.y"
                  :x2="item.x2"
                  :y2="item.y2"
                  :pathLength="1"
                  vector-effect="non-scaling-stroke"
                />
                <g v-else-if="item.kind === 'slash'" :key="item.id">
                  <line
                    class="drill__fx-slash"
                    :x1="item.x - 2.6"
                    :y1="item.y - 3.4"
                    :x2="item.x + 2.6"
                    :y2="item.y + 3.4"
                    vector-effect="non-scaling-stroke"
                  />
                  <line
                    class="drill__fx-slash"
                    :x1="item.x + 2.6"
                    :y1="item.y - 3.4"
                    :x2="item.x - 2.6"
                    :y2="item.y + 3.4"
                    vector-effect="non-scaling-stroke"
                  />
                </g>
                <circle
                  v-else-if="item.kind === 'ring'"
                  :key="item.id"
                :class="['drill__fx-ring', item.tone ? `tone-${item.tone}` : '']"
                  :cx="item.x"
                  :cy="item.y"
                  r="2"
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  v-else-if="item.kind === 'aura'"
                  :key="item.id"
                :class="['drill__fx-aura', item.tone ? `tone-${item.tone}` : '']"
                  :cx="item.x"
                  :cy="item.y"
                  r="2.4"
                  vector-effect="non-scaling-stroke"
                />
                <line
                  v-else-if="item.kind === 'trail'"
                  :key="item.id"
                  class="drill__fx-trail"
                  :x1="item.x"
                  :y1="item.y"
                  :x2="item.x2"
                  :y2="item.y2"
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  v-else-if="item.kind === 'flash'"
                  :key="item.id"
                  class="drill__fx-flash"
                  :cx="item.x"
                  :cy="item.y"
                  r="1.8"
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  v-else-if="item.kind === 'castring'"
                  :key="item.id"
                  class="drill__fx-castring"
                  :cx="item.x"
                  :cy="item.y"
                  r="2.6"
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  v-else
                  :key="item.id"
                :class="['drill__fx-spark', item.tone ? `tone-${item.tone}` : '']"
                  :cx="item.x"
                  :cy="item.y"
                  r="0.9"
                />
              </template>
            </svg>

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
          <span v-if="!drill.snapshot.tournament" class="drill__mono">SLI {{ battle?.sliBefore }} → {{ battle?.sliAfter }}</span>
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
        <button type="button" class="drill__primary" @click="closeArena()">收起</button>
      </footer>
    </div>
  </div>
</template>
