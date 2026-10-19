<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import { BreakoutEngine, type BreakoutStatus } from '../lib/breakoutEngine'

const emit = defineEmits<{ finish: [score: number]; exit: [] }>()

const WIDTH = 960
const HEIGHT = 460

const canvas = ref<HTMLCanvasElement | null>(null)
const stats = reactive({
  score: 0,
  combo: 0,
  lives: 3,
  level: 1,
  status: 'ready' as BreakoutStatus,
  qps: 720,
})
const flash = ref('')
const finished = ref(false)

const engine = new BreakoutEngine(WIDTH, HEIGHT)
let context: CanvasRenderingContext2D | null = null
let frameId = 0
let lastTime = 0
let accumulator = 0
let flashTimer: ReturnType<typeof setTimeout> | undefined

const BRICK_LABELS = ['200', '201', '204', '301', '302', '304', '429', '503']
const ROW_COLORS = ['#f2495c', '#f2cc0c', '#ff8833', '#73bf69']

function syncStats() {
  stats.score = engine.score
  stats.combo = engine.combo
  stats.lives = engine.lives
  stats.level = engine.level
  stats.status = engine.status
}

function setupCanvas() {
  if (!canvas.value) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.value.width = WIDTH * dpr
  canvas.value.height = HEIGHT * dpr
  context = canvas.value.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.strokeStyle = 'rgba(159, 167, 179, 0.1)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i += 1) {
    const y = 50 + i * 90
    ctx.beginPath()
    ctx.moveTo(28, y)
    ctx.lineTo(WIDTH - 20, y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(159, 167, 179, 0.45)'
    ctx.font = '9px Consolas, monospace'
    ctx.fillText(`${3000 - i * 750}`, 4, y + 3)
  }
  ctx.strokeStyle = 'rgba(159, 167, 179, 0.08)'
  for (let i = 0; i <= 12; i += 1) {
    const x = 30 + i * ((WIDTH - 50) / 12)
    ctx.beginPath()
    ctx.moveTo(x, 50)
    ctx.lineTo(x, HEIGHT - 26)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(159, 167, 179, 0.45)'
  ctx.font = '9px Consolas, monospace'
  ctx.fillText('QPS', 4, 40)
  ctx.fillText('time', WIDTH - 46, HEIGHT - 10)
  ctx.restore()
}

function drawBackdropCurve(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 136, 51, 0.22)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let x = 30; x <= WIDTH - 20; x += 8) {
    const wave =
      280 +
      Math.sin(x / 90 + time / 1600) * 22 +
      Math.sin(x / 37 + time / 900) * 8
    const y = HEIGHT - 40 - wave
    if (x === 30) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawBricks(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.font = '9px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const brick of engine.bricks) {
    if (!brick.alive) continue
    const color = ROW_COLORS[brick.row % ROW_COLORS.length] ?? '#73bf69'
    ctx.fillStyle = `${color}22`
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 3)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fillText(BRICK_LABELS[brick.col % BRICK_LABELS.length] ?? '200', brick.x + brick.w / 2, brick.y + brick.h / 2 + 1)
  }
  ctx.restore()
}

function drawBall(ctx: CanvasRenderingContext2D) {
  const { ball } = engine
  ctx.save()
  ctx.shadowColor = 'rgba(88, 200, 255, 0.9)'
  ctx.shadowBlur = 14
  ctx.fillStyle = '#8fdcff'
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPaddle(ctx: CanvasRenderingContext2D) {
  const { paddle } = engine
  ctx.save()
  ctx.shadowColor = 'rgba(88, 200, 255, 0.55)'
  ctx.shadowBlur = 10
  ctx.fillStyle = 'rgba(88, 200, 255, 0.7)'
  ctx.beginPath()
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 4)
  ctx.fill()
  ctx.restore()
}

function drawLabel(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.fillStyle = 'rgba(159, 167, 179, 0.65)'
  ctx.font = '10px Consolas, monospace'
  ctx.fillText('peak shaver · online', 32, 26)
  ctx.fillStyle = 'rgba(115, 191, 105, 0.85)'
  ctx.beginPath()
  ctx.arc(WIDTH - 148, 22, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillText('collector active', WIDTH - 138, 26)
  ctx.restore()
}

function draw(time: number) {
  if (!context) return
  const ctx = context
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#10151c'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  drawGrid(ctx)
  drawBackdropCurve(ctx, time)
  drawBricks(ctx)
  drawPaddle(ctx)
  drawBall(ctx)
  drawLabel(ctx)

  if (engine.status === 'ready' && !finished.value) {
    ctx.fillStyle = 'rgba(216, 217, 218, 0.55)'
    ctx.font = '12px Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('按空格或点击开始削峰演练', WIDTH / 2, HEIGHT - 70)
    ctx.textAlign = 'left'
  }
}

function loop(timestamp: number) {
  frameId = requestAnimationFrame(loop)
  if (!lastTime) lastTime = timestamp
  const delta = timestamp - lastTime
  lastTime = timestamp
  stats.qps = Math.round(720 + Math.sin(timestamp / 700) * 60 + engine.score * 0.4)

  if (engine.status === 'playing') {
    accumulator += Math.min(delta, 50)
    while (accumulator >= 16.67) {
      const result = engine.step(16.67)
      accumulator -= 16.67
      syncStats()
      if (result.levelCleared) {
        flash.value = '流量已削峰 · 进入下一轮'
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => {
          flash.value = ''
        }, 1400)
      }
      if (stats.status === 'lost' && !finished.value) {
        finished.value = true
        emit('finish', engine.score)
      }
    }
  } else {
    accumulator = 0
  }

  syncStats()
  draw(timestamp)
}

function primaryAction() {
  if (engine.status === 'ready') {
    engine.launch()
  } else if (engine.status === 'playing') {
    engine.pause()
  } else if (engine.status === 'paused') {
    engine.resume()
  } else if (engine.status === 'lost') {
    restart()
  }
  syncStats()
}

function restart() {
  engine.reset()
  finished.value = false
  lastTime = 0
  accumulator = 0
  syncStats()
}

function exitGame() {
  if (engine.score > 0 && !finished.value) {
    finished.value = true
    emit('finish', engine.score)
  }
  emit('exit')
}

function movePaddle(clientX: number) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * WIDTH
  engine.movePaddle(x)
}

function onMouseMove(event: MouseEvent) {
  movePaddle(event.clientX)
}

function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (touch) movePaddle(touch.clientX)
}

function onCanvasClick() {
  primaryAction()
}

function onKeydown(event: KeyboardEvent) {
  if (event.code === 'Space') {
    event.preventDefault()
    primaryAction()
  } else if (event.code === 'KeyP') {
    engine.togglePause()
    syncStats()
  } else if (event.code === 'Escape') {
    exitGame()
  } else if (event.code === 'ArrowLeft') {
    engine.movePaddle(engine.paddle.x + engine.paddle.w / 2 - 36)
  } else if (event.code === 'ArrowRight') {
    engine.movePaddle(engine.paddle.x + engine.paddle.w / 2 + 36)
  }
}

function primaryLabel(): string {
  if (engine.status === 'ready') return '发球'
  if (engine.status === 'playing') return '暂停'
  if (engine.status === 'paused') return '继续'
  return '重新开始'
}

onMounted(() => {
  setupCanvas()
  syncStats()
  window.addEventListener('keydown', onKeydown)
  frameId = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  window.removeEventListener('keydown', onKeydown)
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<template>
  <div class="breakout">
    <div class="breakout__hud">
      <span>P95 QPS <b>{{ stats.qps }}</b></span>
      <span>得分 <b class="breakout__accent">{{ stats.score }}</b></span>
      <span>连击 <b>{{ stats.combo }}</b></span>
      <span>生命周期 <b>{{ stats.lives }}</b></span>
      <span>轮次 <b>{{ stats.level }}</b></span>
      <span class="breakout__spacer" />
      <span class="breakout__status">{{ stats.status.toUpperCase() }}</span>
    </div>

    <canvas
      ref="canvas"
      class="breakout__canvas"
      @mousemove="onMouseMove"
      @touchmove.prevent="onTouchMove"
      @click="onCanvasClick"
    />

    <div v-if="flash" class="breakout__flash">{{ flash }}</div>
    <div v-if="stats.status === 'paused'" class="breakout__overlay">
      <span>演练暂停</span>
      <button @click="primaryAction">继续</button>
    </div>
    <div v-if="stats.status === 'lost'" class="breakout__overlay breakout__overlay--lost">
      <span>演练结束</span>
      <b>{{ stats.score }}</b>
      <button @click="restart">再次演练</button>
      <button class="breakout__ghost" @click="exitGame">关闭面板</button>
    </div>

    <div class="breakout__controls">
      <button class="breakout__primary" @click="primaryAction">{{ primaryLabel() }}</button>
      <button @click="restart">重置</button>
      <button @click="exitGame">退出演练</button>
      <span class="breakout__spacer" />
      <span>空格发球 · P 暂停 · Esc 退出</span>
    </div>
  </div>
</template>

<style scoped>
.breakout {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.breakout__hud {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 2px 4px 0;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9.5px;
}

.breakout__hud b {
  color: var(--fm-text);
  font-weight: 500;
}

.breakout__accent {
  color: var(--fm-accent) !important;
}

.breakout__spacer {
  flex: 1;
}

.breakout__status {
  color: var(--fm-ok);
  letter-spacing: 0.08em;
}

.breakout__canvas {
  display: block;
  width: 100%;
  aspect-ratio: 960 / 460;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: #10151c;
  cursor: crosshair;
}

.breakout__flash {
  position: absolute;
  top: 78px;
  left: 50%;
  padding: 5px 12px;
  border: 1px solid var(--fm-ok);
  border-radius: 3px;
  background: rgba(16, 21, 28, 0.9);
  color: var(--fm-ok);
  font-family: var(--fm-mono);
  font-size: 10px;
  transform: translateX(-50%);
}

.breakout__overlay {
  position: absolute;
  inset: 54px 10px 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 3px;
  background: rgba(16, 21, 28, 0.72);
  backdrop-filter: blur(2px);
}

.breakout__overlay span {
  color: var(--fm-text);
  font-size: 15px;
  font-weight: 600;
}

.breakout__overlay b {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 30px;
}

.breakout__overlay button {
  height: 25px;
  padding: 0 12px;
  border: 1px solid var(--fm-accent);
  border-radius: 3px;
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 10px;
  cursor: pointer;
}

.breakout__overlay .breakout__ghost {
  border-color: var(--fm-border);
  background: transparent;
  color: var(--fm-text-dim);
}

.breakout__controls {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--fm-text-muted);
  font-size: 9px;
}

.breakout__controls button {
  height: 23px;
  padding: 0 9px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  cursor: pointer;
}

.breakout__controls button:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.breakout__controls .breakout__primary {
  border-color: var(--fm-accent);
  background: var(--fm-accent-soft);
  color: var(--fm-accent);
}
</style>
