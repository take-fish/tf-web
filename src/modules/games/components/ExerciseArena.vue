<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type {
  ExerciseActor,
  ExerciseInput,
  ExerciseStanding,
  ExerciseState,
} from '../types'

const props = defineProps<{
  state: ExerciseState
  selfUserId: string
  interactive: boolean
  standings?: ExerciseStanding[]
}>()
const emit = defineEmits<{ input: [input: ExerciseInput] }>()

const WIDTH = 1280
const HEIGHT = 720
const PERCEPTION = 380
const INPUT_INTERVAL = 50
const MOVE_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
])

const canvas = ref<HTMLCanvasElement | null>(null)
const boss = ref(false)
const now = ref(Date.now())
const aim = ref(0)
const firing = ref(false)
const pointerInside = ref(false)
const hasFocus = ref(false)
const inputSeq = ref(0)

const keys = new Set<string>()
const rendered = new Map<string, { x: number; y: number; aim: number }>()
let raf = 0
let inputTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let lastFrameAt = 0

const selfId = computed(() => props.state.you ?? props.selfUserId)
const selfActor = computed(
  () => props.state.actors.find((actor) => actor.userId === selfId.value) ?? null,
)
const selfTeam = computed(() => selfActor.value?.team ?? null)
const spectator = computed(() => !selfActor.value)
const canControl = computed(
  () =>
    props.interactive &&
    !boss.value &&
    !props.state.finished &&
    props.state.status === 'RUNNING' &&
    Boolean(selfActor.value),
)
const remaining = computed(() =>
  Math.max(0, Math.ceil((props.state.endsAt - now.value) / 1000)),
)
const respawnSeconds = computed(() => {
  const actor = selfActor.value
  if (!actor || actor.alive || !actor.respawnAt) return 0
  return Math.max(0, Math.ceil((actor.respawnAt - now.value) / 1000))
})
const hpPercent = computed(() => Math.max(0, Math.min(100, selfActor.value?.hp ?? 0)))
const teamScores = computed(() => ({
  A: props.state.actors
    .filter((actor) => actor.team === 'A')
    .reduce((total, actor) => total + actor.score, 0),
  B: props.state.actors
    .filter((actor) => actor.team === 'B')
    .reduce((total, actor) => total + actor.score, 0),
}))
const scoreBoard = computed(() => {
  const sorted = [...props.state.actors]
    .filter((actor) => !actor.bot)
    .sort((left, right) => right.score - left.score || right.kills - left.kills)
  return sorted.slice(0, 4)
})
const standingsRows = computed<ExerciseStanding[]>(() => {
  if (props.standings?.length) return props.standings
  return [...props.state.actors]
    .filter((actor) => !actor.bot)
    .sort((left, right) => right.score - left.score || right.kills - left.kills)
    .map((actor, index) => ({
      rank: index + 1,
      userId: actor.userId,
      nickname: actor.nickname,
      team: actor.team,
      score: actor.score,
      kills: actor.kills,
      deaths: actor.deaths,
      assists: actor.assists,
      winner: actor.userId === props.state.winnerUserId,
    }))
})
const roleLabel = computed(() => {
  if (spectator.value) return '观战视角'
  if (props.state.mode === 'TRAINING') return '单人训练'
  if (props.state.mode === 'TEAM') return selfTeam.value === 'A' ? 'A 队巡检员' : 'B 队巡检员'
  return '自由对抗'
})
const modeLabel = computed(() => {
  if (props.state.mode === 'TRAINING') return 'TRAINING'
  if (props.state.mode === 'TEAM') return 'TEAM'
  return 'FFA'
})

function cooldownLeft(key: string): number {
  const actor = selfActor.value
  if (!actor) return 0
  const readyAt = actor.cooldowns[key] ?? 0
  return Math.max(0, Math.ceil((readyAt - now.value) / 1000))
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

function moveVector(): { x: number; y: number } {
  let x = 0
  let y = 0
  if (keys.has('a') || keys.has('arrowleft')) x -= 1
  if (keys.has('d') || keys.has('arrowright')) x += 1
  if (keys.has('w') || keys.has('arrowup')) y -= 1
  if (keys.has('s') || keys.has('arrowdown')) y += 1
  if (x !== 0 && y !== 0) {
    x *= Math.SQRT1_2
    y *= Math.SQRT1_2
  }
  return { x, y }
}

function sendInput(overrides: Partial<ExerciseInput> = {}) {
  if (!canControl.value) return
  const move = moveVector()
  emit('input', {
    inputSeq: (inputSeq.value += 1),
    moveX: move.x,
    moveY: move.y,
    aim: aim.value,
    fire: firing.value,
    ...overrides,
  })
}

function castSkill(skill: 'scan' | 'shield' | 'barrier' | 'patrol') {
  const actor = selfActor.value
  if (!canControl.value || !actor || !actor.alive) return
  if (cooldownLeft(skill) > 0) return
  if (actor.speedUntil > now.value && skill === 'patrol') return
  emit('input', {
    inputSeq: (inputSeq.value += 1),
    moveX: 0,
    moveY: 0,
    aim: aim.value,
    fire: false,
    skill,
    skillX: skill === 'barrier' ? actor.x + Math.cos(aim.value) * 90 : null,
    skillY: skill === 'barrier' ? actor.y + Math.sin(aim.value) * 90 : null,
  })
}

function clearInputs() {
  keys.clear()
  firing.value = false
}

function toggleBoss() {
  boss.value = !boss.value
  clearInputs()
  if (boss.value) hasFocus.value = false
}

function onKeyDown(event: KeyboardEvent) {
  if (isTypingTarget(event.target)) return
  const key = event.key.toLowerCase()
  if (key === 'escape') {
    if (!props.interactive || !selfActor.value) return
    event.preventDefault()
    toggleBoss()
    return
  }
  if (!canControl.value) return
  if (MOVE_KEYS.has(key)) {
    event.preventDefault()
    keys.add(key)
  }
  if (event.repeat) return
  if (key === 'q') castSkill('scan')
  else if (key === 'e') castSkill('shield')
  else if (key === ' ') {
    event.preventDefault()
    castSkill('barrier')
  } else if (key === 'r') castSkill('patrol')
}

function onKeyUp(event: KeyboardEvent) {
  keys.delete(event.key.toLowerCase())
}

function onBlur() {
  clearInputs()
  hasFocus.value = false
}

function focusCanvas() {
  canvas.value?.focus()
  hasFocus.value = true
}

function toLogical(event: PointerEvent): { x: number; y: number } | null {
  const element = canvas.value
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
  if (scale <= 0) return null
  const offsetX = (rect.width - WIDTH * scale) / 2
  const offsetY = (rect.height - HEIGHT * scale) / 2
  return {
    x: (event.clientX - rect.left - offsetX) / scale,
    y: (event.clientY - rect.top - offsetY) / scale,
  }
}

function onPointerMove(event: PointerEvent) {
  pointerInside.value = true
  const actor = selfActor.value
  const point = toLogical(event)
  if (!canControl.value || !actor || !point) return
  aim.value = Math.atan2(point.y - actor.y, point.x - actor.x)
}

function onPointerDown(event: PointerEvent) {
  focusCanvas()
  if (event.button !== 0 || !canControl.value) return
  const actor = selfActor.value
  const point = toLogical(event)
  if (actor && point) {
    aim.value = Math.atan2(point.y - actor.y, point.x - actor.x)
  }
  firing.value = true
  sendInput()
}

function onPointerUp() {
  firing.value = false
}

function onPointerLeave() {
  pointerInside.value = false
}

/* ---------------- Canvas 渲染 ---------------- */

function actorColor(actor: ExerciseActor): string {
  if (actor.userId === selfId.value) return '#48bfae'
  if (actor.bot) return '#8f7a5a'
  if (props.state.mode === 'TEAM' && selfTeam.value) {
    return actor.team === selfTeam.value ? '#48bfae' : '#d9635f'
  }
  const palette = ['#6f9fec', '#d9a441', '#c77ddb', '#5fbf7f']
  const index = props.state.actors.findIndex((entry) => entry.userId === actor.userId)
  return palette[Math.max(0, index) % palette.length] ?? '#6f9fec'
}

function smoothActors() {
  const seen = new Set<string>()
  for (const actor of props.state.actors) {
    seen.add(actor.userId)
    const cached = rendered.get(actor.userId)
    if (!cached) {
      rendered.set(actor.userId, { x: actor.x, y: actor.y, aim: actor.aim })
      continue
    }
    const distance = Math.hypot(actor.x - cached.x, actor.y - cached.y)
    if (distance > 240) {
      cached.x = actor.x
      cached.y = actor.y
    } else {
      cached.x += (actor.x - cached.x) * 0.42
      cached.y += (actor.y - cached.y) * 0.42
    }
    cached.aim = actor.aim
  }
  for (const key of rendered.keys()) {
    if (!seen.has(key)) rendered.delete(key)
  }
}

function drawMap(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#07111a'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.strokeStyle = 'rgba(72, 191, 174, 0.08)'
  ctx.lineWidth = 1
  for (let x = 0; x <= WIDTH; x += 80) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y <= HEIGHT; y += 80) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(WIDTH, y)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(72, 191, 174, 0.32)'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16)

  for (const obstacle of props.state.obstacles) {
    if (obstacle.expiresAt && obstacle.expiresAt <= now.value) continue
    if (obstacle.hard) {
      ctx.fillStyle = obstacle.expiresAt
        ? 'rgba(217, 99, 95, 0.32)'
        : 'rgba(29, 45, 58, 0.95)'
      ctx.strokeStyle = obstacle.expiresAt
        ? 'rgba(217, 99, 95, 0.85)'
        : 'rgba(96, 126, 143, 0.7)'
      ctx.lineWidth = 2
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
    } else {
      ctx.fillStyle = 'rgba(72, 191, 174, 0.08)'
      ctx.strokeStyle = 'rgba(72, 191, 174, 0.35)'
      ctx.setLineDash([6, 6])
      ctx.lineWidth = 1.5
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
      ctx.setLineDash([])
    }
  }

  for (const point of props.state.points) {
    const owned = Boolean(point.ownerUserId)
    ctx.beginPath()
    ctx.arc(point.x, point.y, 66, 0, Math.PI * 2)
    ctx.fillStyle = owned ? 'rgba(72, 191, 174, 0.06)' : 'rgba(111, 159, 236, 0.06)'
    ctx.fill()
    ctx.strokeStyle = owned ? 'rgba(72, 191, 174, 0.55)' : 'rgba(111, 159, 236, 0.35)'
    ctx.lineWidth = 2
    ctx.stroke()

    if (point.holderUserId) {
      const pulse = 0.5 + Math.sin(now.value / 220) * 0.25
      ctx.beginPath()
      ctx.arc(point.x, point.y, 20, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(217, 164, 65, ${pulse.toFixed(2)})`
      ctx.lineWidth = 3
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2)
    ctx.fillStyle = owned ? '#48bfae' : '#6f9fec'
    ctx.fill()
    ctx.fillStyle = 'rgba(226, 238, 244, 0.72)'
    ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(point.id.toUpperCase(), point.x, point.y - 78)
  }

  const viewer = selfActor.value
  for (const tracer of props.state.tracers) {
    if (now.value - tracer.at > 800) continue
    if (viewer && tracer.userId !== viewer.userId) {
      const distance = Math.hypot(tracer.x1 - viewer.x, tracer.y1 - viewer.y)
      const visible = props.state.actors.some((actor) => actor.userId === tracer.userId)
      if (!visible && distance > PERCEPTION) continue
    }
    const alpha = Math.max(0, 1 - (now.value - tracer.at) / 800)
    ctx.beginPath()
    ctx.moveTo(tracer.x1, tracer.y1)
    ctx.lineTo(tracer.x2, tracer.y2)
    ctx.strokeStyle = tracer.hit
      ? `rgba(217, 164, 65, ${(alpha * 0.9).toFixed(2)})`
      : `rgba(150, 206, 255, ${(alpha * 0.5).toFixed(2)})`
    ctx.lineWidth = tracer.hit ? 2.4 : 1.4
    ctx.stroke()
  }

  for (const actor of props.state.actors) {
    const spot = rendered.get(actor.userId)
    const x = spot?.x ?? actor.x
    const y = spot?.y ?? actor.y
    const angle = spot?.aim ?? actor.aim
    const color = actorColor(actor)
    const isSelf = actor.userId === selfId.value

    if (!actor.alive) {
      ctx.strokeStyle = 'rgba(217, 99, 95, 0.5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 7, y - 7)
      ctx.lineTo(x + 7, y + 7)
      ctx.moveTo(x + 7, y - 7)
      ctx.lineTo(x - 7, y + 7)
      ctx.stroke()
      continue
    }

    if (isSelf) {
      ctx.beginPath()
      ctx.arc(x, y, 26, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(72, 191, 174, 0.35)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * 26, y + Math.sin(angle) * 26)
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(6, 14, 20, 0.85)'
    ctx.lineWidth = 2
    ctx.stroke()

    if (actor.shieldUntil > now.value) {
      ctx.beginPath()
      ctx.arc(x, y, 22, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(111, 159, 236, 0.85)'
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
    if (actor.scanUntil > now.value && isSelf) {
      ctx.beginPath()
      ctx.arc(x, y, PERCEPTION, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(217, 164, 65, 0.22)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(6, 14, 20, 0.8)'
    ctx.fillRect(x - 18, y - 30, 36, 5)
    ctx.fillStyle = actor.hp > 55 ? '#48bfae' : actor.hp > 25 ? '#d9a441' : '#d9635f'
    ctx.fillRect(x - 18, y - 30, 36 * Math.max(0, actor.hp) / 100, 5)

    ctx.fillStyle = isSelf ? '#c8f2ea' : 'rgba(201, 216, 226, 0.82)'
    ctx.font = `${isSelf ? '600' : '500'} 12px ui-monospace, SFMono-Regular, monospace`
    ctx.textAlign = 'center'
    ctx.fillText(
      `${actor.nickname}${actor.bot ? ' · 靶' : ''}`,
      x,
      y - 36,
    )
    if (isSelf) {
      ctx.fillStyle = 'rgba(72, 191, 174, 0.9)'
      ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace'
      ctx.fillText('YOU', x, y + 30)
    }
  }

  if (viewer && viewer.alive && !(viewer.scanUntil > now.value)) {
    const gradient = ctx.createRadialGradient(
      viewer.x,
      viewer.y,
      PERCEPTION * 0.55,
      viewer.x,
      viewer.y,
      PERCEPTION * 1.25,
    )
    gradient.addColorStop(0, 'rgba(4, 9, 13, 0)')
    gradient.addColorStop(1, 'rgba(4, 9, 13, 0.6)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
}

function draw() {
  const element = canvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.floor(rect.width))
  const height = Math.max(1, Math.floor(rect.height))
  if (element.width !== Math.floor(width * dpr) || element.height !== Math.floor(height * dpr)) {
    element.width = Math.floor(width * dpr)
    element.height = Math.floor(height * dpr)
  }
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#07111a'
  ctx.fillRect(0, 0, width, height)

  const scale = Math.min(width / WIDTH, height / HEIGHT)
  const offsetX = (width - WIDTH * scale) / 2
  const offsetY = (height - HEIGHT * scale) / 2
  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
  drawMap(ctx)
  ctx.restore()
}

function frame(timestamp: number) {
  const delta = timestamp - lastFrameAt
  if (delta >= 16) {
    lastFrameAt = timestamp
    smoothActors()
    draw()
  }
  raf = window.requestAnimationFrame(frame)
}

function tickInput() {
  if (!canControl.value) return
  sendInput()
}

onMounted(() => {
  raf = window.requestAnimationFrame(frame)
  inputTimer = setInterval(tickInput, INPUT_INTERVAL)
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 250)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('pointerup', onPointerUp)
  const initial = selfActor.value
  if (initial) aim.value = initial.aim
})

onBeforeUnmount(() => {
  if (raf) window.cancelAnimationFrame(raf)
  if (inputTimer) clearInterval(inputTimer)
  if (clockTimer) clearInterval(clockTimer)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('pointerup', onPointerUp)
  rendered.clear()
})

watch(
  () => props.interactive,
  (interactive) => {
    if (!interactive) clearInputs()
  },
)

watch(
  () => props.state.finished,
  (finished) => {
    if (finished) clearInputs()
  },
)

watch(
  () => selfActor.value?.alive,
  (alive) => {
    if (alive === false) firing.value = false
  },
)
</script>

<template>
  <section class="patrol" aria-label="集群巡检对抗演练">
    <header class="patrol__hud">
      <div class="patrol__role">
        <span>{{ modeLabel }} · {{ roleLabel }}</span>
        <b>{{ selfActor?.nickname ?? '只读观战' }}</b>
      </div>

      <div class="patrol__vitals">
        <div class="patrol__hp">
          <span class="patrol__hp-bar">
            <i :style="{ width: `${hpPercent}%` }" />
          </span>
          <em>HP {{ Math.max(0, selfActor?.hp ?? 0) }}</em>
        </div>
        <div class="patrol__stats">
          <span><b>{{ selfActor?.score ?? 0 }}</b>积分</span>
          <span><b>{{ selfActor?.kills ?? 0 }}</b>击杀</span>
          <span><b>{{ selfActor?.assists ?? 0 }}</b>助攻</span>
          <span><b>{{ selfActor?.deaths ?? 0 }}</b>阵亡</span>
        </div>
      </div>

      <div class="patrol__clock" :class="{ 'is-danger': remaining <= 30 }">
        <span>剩余时间</span>
        <b>{{ formatClock(remaining) }}</b>
      </div>

      <div v-if="state.mode === 'TEAM'" class="patrol__teams">
        <span :class="{ 'is-self': selfTeam === 'A' }">A 队 <b>{{ teamScores.A }}</b></span>
        <span :class="{ 'is-self': selfTeam === 'B' }">B 队 <b>{{ teamScores.B }}</b></span>
      </div>
      <div v-else class="patrol__rank">
        <span v-for="actor in scoreBoard.slice(0, 3)" :key="actor.userId">
          <em :class="{ 'is-self': actor.userId === selfId }">{{ actor.nickname }}</em>
          <b>{{ actor.score }}</b>
        </span>
      </div>
    </header>

    <div class="patrol__stage">
      <canvas
        ref="canvas"
        class="patrol__canvas"
        tabindex="0"
        @pointermove="onPointerMove"
        @pointerdown="onPointerDown"
        @pointerleave="onPointerLeave"
        @contextmenu.prevent
      />

      <div v-if="selfActor && !selfActor.alive" class="patrol__respawn">
        <b>巡检节点已离线</b>
        <span>{{ respawnSeconds }}s 后重新接入</span>
      </div>

      <div v-else-if="spectator" class="patrol__spectator">
        观战视角 · 可查看全图，但不能执行操作
      </div>

      <div v-else-if="!hasFocus && !boss" class="patrol__focus" @click="focusCanvas">
        点击画面开始操作 · WASD 移动 · 鼠标瞄准 · 左键开火
      </div>

      <div v-if="boss" class="patrol__boss" @click="toggleBoss">
        <span class="patrol__boss-mark">F</span>
        <b>FishMatrix 工作台</b>
        <em>巡检演练已暂停 · 点击或按 Esc 返回</em>
      </div>

      <div v-if="state.finished" class="patrol__result">
        <div class="patrol__result-head">
          <b>
            {{
              state.mode === 'TEAM'
                ? `${{ A: 'A 队', B: 'B 队' }[state.winnerTeam ?? 'A'] ?? '团队'}胜出`
                : `${state.actors.find((actor) => actor.userId === state.winnerUserId)?.nickname ?? '无人'} 胜出`
            }}
          </b>
          <span>{{ state.finishReason || '巡检结束' }}</span>
        </div>
        <ol class="patrol__standings">
          <li v-for="row in standingsRows" :key="row.userId" :class="{ 'is-winner': row.winner }">
            <span class="patrol__standing-rank">{{ row.rank }}</span>
            <span class="patrol__standing-name">
              {{ row.nickname }}
              <em v-if="row.team">{{ row.team === 'A' ? 'A 队' : 'B 队' }}</em>
            </span>
            <span class="patrol__standing-score">{{ row.score }} 分</span>
            <span class="patrol__standing-meta">
              {{ row.kills }} 击杀 · {{ row.assists }} 助攻 · {{ row.deaths }} 阵亡
            </span>
          </li>
          <li v-if="standingsRows.length === 0" class="is-empty">本局没有可结算的成员</li>
        </ol>
      </div>
    </div>

    <footer class="patrol__foot">
      <div class="patrol__skills">
        <button
          type="button"
          :class="{ 'is-ready': cooldownLeft('scan') === 0 && canControl }"
          :disabled="!canControl || cooldownLeft('scan') > 0"
          @click="castSkill('scan')"
        >
          <b>脉冲扫描</b>
          <span>Q · {{ cooldownLeft('scan') > 0 ? `冷却 ${cooldownLeft('scan')}s` : '全图感知 2s' }}</span>
        </button>
        <button
          type="button"
          :class="{ 'is-ready': cooldownLeft('shield') === 0 && canControl }"
          :disabled="!canControl || cooldownLeft('shield') > 0"
          @click="castSkill('shield')"
        >
          <b>隔离护盾</b>
          <span>E · {{ cooldownLeft('shield') > 0 ? `冷却 ${cooldownLeft('shield')}s` : '免疫 3s' }}</span>
        </button>
        <button
          type="button"
          :class="{ 'is-ready': cooldownLeft('barrier') === 0 && canControl }"
          :disabled="!canControl || cooldownLeft('barrier') > 0"
          @click="castSkill('barrier')"
        >
          <b>链路屏障</b>
          <span>空格 · {{ cooldownLeft('barrier') > 0 ? `冷却 ${cooldownLeft('barrier')}s` : '部署 6s' }}</span>
        </button>
        <button
          type="button"
          :class="{ 'is-ready': cooldownLeft('patrol') === 0 && canControl }"
          :disabled="!canControl || cooldownLeft('patrol') > 0"
          @click="castSkill('patrol')"
        >
          <b>快速巡检</b>
          <span>R · {{ cooldownLeft('patrol') > 0 ? `冷却 ${cooldownLeft('patrol')}s` : '加速 3s' }}</span>
        </button>
      </div>

      <div class="patrol__feed">
        <span v-for="(event, index) in state.events.slice(-3).reverse()" :key="`${event.at}-${index}`">
          {{ event.text }}
        </span>
        <span v-if="state.events.length === 0" class="is-empty">等待巡检动作</span>
      </div>

      <div class="patrol__hint">
        <span>WASD 移动 · 鼠标瞄准 · 左键开火</span>
        <span>Q 扫描 / E 护盾 / 空格屏障 / R 加速</span>
        <button type="button" class="patrol__boss-key" @click="toggleBoss">
          ESC 老板键
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.patrol {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
}

.patrol__hud {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 10px;
  overflow-x: auto;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 42%, transparent);
}

.patrol__role {
  display: flex;
  flex-direction: column;
  min-width: 96px;
  padding-right: 12px;
  border-right: 1px solid var(--fm-border);
}

.patrol__role span {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  letter-spacing: 0.06em;
}

.patrol__role b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patrol__vitals {
  display: flex;
  align-items: center;
  gap: 12px;
}

.patrol__hp {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 112px;
}

.patrol__hp-bar {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-text-muted) 22%, transparent);
}

.patrol__hp-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #d9635f 0%, #d9a441 45%, #48bfae 100%);
  transition: width 0.2s linear;
}

.patrol__hp em {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  font-style: normal;
}

.patrol__stats {
  display: flex;
  gap: 10px;
}

.patrol__stats span {
  display: flex;
  flex-direction: column;
  color: var(--fm-text-muted);
  font-size: 7px;
}

.patrol__stats b {
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.1;
}

.patrol__clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-left: auto;
}

.patrol__clock span {
  color: var(--fm-text-muted);
  font-size: 7px;
}

.patrol__clock b {
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 17px;
  font-weight: 600;
}

.patrol__clock.is-danger b {
  color: var(--fm-err);
}

.patrol__teams,
.patrol__rank {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 92px;
}

.patrol__teams span,
.patrol__rank span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--fm-text-muted);
  font-size: 8px;
}

.patrol__teams b,
.patrol__rank b {
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 10px;
}

.patrol__rank em {
  overflow: hidden;
  max-width: 64px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patrol__teams span.is-self,
.patrol__rank em.is-self {
  color: #48bfae;
}

.patrol__stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: #07111a;
}

.patrol__canvas {
  display: block;
  width: 100%;
  height: clamp(300px, 52vh, 560px);
  outline: none;
  cursor: crosshair;
  touch-action: none;
}

.patrol__respawn,
.patrol__spectator,
.patrol__focus {
  position: absolute;
  left: 50%;
  padding: 7px 12px;
  border: 1px solid color-mix(in srgb, var(--fm-text-muted) 40%, transparent);
  border-radius: 3px;
  background: rgba(4, 10, 15, 0.82);
  color: var(--fm-text-dim);
  font-size: 9px;
  text-align: center;
  transform: translateX(-50%);
}

.patrol__respawn {
  top: 42%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-color: color-mix(in srgb, var(--fm-err) 52%, transparent);
}

.patrol__respawn b {
  color: var(--fm-err);
  font-size: 11px;
}

.patrol__respawn span {
  font-family: var(--fm-mono);
}

.patrol__spectator {
  top: 8px;
}

.patrol__focus {
  top: 50%;
  cursor: pointer;
  transform: translate(-50%, -50%);
}

.patrol__boss {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(6, 12, 18, 0.97);
  cursor: pointer;
}

.patrol__boss-mark {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-bottom: 4px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  border-radius: 3px;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 14px;
}

.patrol__boss b {
  color: var(--fm-text);
  font-size: 13px;
  font-weight: 600;
}

.patrol__boss em {
  color: var(--fm-text-muted);
  font-size: 9px;
  font-style: normal;
}

.patrol__result {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  overflow-y: auto;
  background: rgba(5, 11, 16, 0.92);
  backdrop-filter: blur(3px);
}

.patrol__result-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.patrol__result-head b {
  color: var(--fm-ok);
  font-size: 15px;
  font-weight: 600;
}

.patrol__result-head span {
  color: var(--fm-text-muted);
  font-size: 10px;
}

.patrol__standings {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.patrol__standings li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 70px minmax(120px, auto);
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-panel) 85%, transparent);
  color: var(--fm-text-dim);
  font-size: 9px;
}

.patrol__standings li.is-winner {
  border-color: color-mix(in srgb, var(--fm-ok) 52%, transparent);
  background: color-mix(in srgb, var(--fm-ok) 8%, transparent);
}

.patrol__standings li.is-empty {
  display: block;
  color: var(--fm-text-muted);
  text-align: center;
}

.patrol__standing-rank {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 11px;
}

.patrol__standing-name {
  overflow: hidden;
  color: var(--fm-text);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patrol__standing-name em {
  margin-left: 5px;
  color: var(--fm-text-muted);
  font-size: 8px;
  font-style: normal;
}

.patrol__standing-score {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
}

.patrol__standing-meta {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.patrol__foot {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.patrol__skills {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  flex: none;
}

.patrol__skills button {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 96px;
  padding: 4px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-dim);
  text-align: left;
  cursor: pointer;
}

.patrol__skills button.is-ready {
  border-color: color-mix(in srgb, var(--fm-accent) 42%, var(--fm-border));
  color: var(--fm-text);
}

.patrol__skills button:disabled {
  opacity: 0.42;
  cursor: default;
}

.patrol__skills b {
  font-size: 8.5px;
  font-weight: 500;
}

.patrol__skills span {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 6.8px;
}

.patrol__feed {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  padding: 4px 8px;
  overflow: hidden;
  border: 1px dashed var(--fm-border);
  border-radius: 3px;
  color: var(--fm-text-muted);
  font-size: 7.5px;
}

.patrol__feed span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patrol__feed span.is-empty {
  text-align: center;
}

.patrol__hint {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 1px;
  justify-content: center;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 6.8px;
  text-align: right;
}

.patrol__boss-key {
  align-self: flex-end;
  margin-top: 3px;
  padding: 2px 6px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 6.8px;
  cursor: pointer;
}

.patrol__boss-key:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

@media (max-width: 980px) {
  .patrol__foot {
    flex-direction: column;
  }

  .patrol__hint {
    align-items: center;
    text-align: center;
  }

  .patrol__boss-key {
    align-self: center;
  }
}
</style>
