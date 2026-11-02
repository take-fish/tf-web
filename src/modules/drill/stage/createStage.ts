import type { DrillSnapshot, StageBridge, StageHandle, UnitNode } from '../types'

/**
 * 部署拓扑画布。
 *
 * 这里是 Canvas 2D 占位实现，接口与主方案 §7.5 的 StageBridge 完全一致；
 * M6 接入 Phaser 时只替换本文件，`DrillStage.vue` 与视图层不需要改动。
 */

const COLS = 7
const ROWS = 4
const BENCH = 9

interface Palette {
  bg: string
  panel: string
  border: string
  text: string
  dim: string
  accent: string
  ok: string
  warn: string
  err: string
  font: string
}

function readVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

function readPalette(host: HTMLElement): Palette {
  const style = getComputedStyle(host)
  return {
    bg: readVar(style, '--fm-bg', '#0f1319'),
    panel: readVar(style, '--fm-panel', '#161b22'),
    border: readVar(style, '--fm-border', '#2b333d'),
    text: readVar(style, '--fm-text', '#c9d1d9'),
    dim: readVar(style, '--fm-text-dim', '#8b949e'),
    accent: readVar(style, '--fm-accent', '#3b82f6'),
    ok: readVar(style, '--fm-ok', '#3fb950'),
    warn: readVar(style, '--fm-warn', '#d29922'),
    err: readVar(style, '--fm-err', '#f85149'),
    font: readVar(style, '--fm-font', 'system-ui, sans-serif'),
  }
}

interface Layout {
  radius: number
  cellW: number
  cellH: number
  offsetX: number
  offsetY: number
  benchY: number
  benchW: number
  width: number
  height: number
}

function computeLayout(width: number, height: number): Layout {
  const cellW = width / (COLS + 0.5)
  const cellH = height / (ROWS + 2.4)
  const radius = Math.min(cellW / Math.sqrt(3), cellH / 2) * 0.94
  return {
    radius,
    cellW: Math.sqrt(3) * radius,
    cellH: 2 * radius,
    offsetX: radius,
    offsetY: radius * 0.6,
    benchY: height - radius * 1.9,
    benchW: width / BENCH,
    width,
    height,
  }
}

function hexCenter(layout: Layout, col: number, row: number): { x: number; y: number } {
  const x = layout.offsetX + layout.cellW * col + layout.cellW * 0.5
  const y = layout.offsetY + layout.cellH * 0.75 * row + (col % 2 === 1 ? layout.cellH * 0.375 : 0)
  return { x, y }
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.beginPath()
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index - Math.PI / 6
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export function createStage(parent: HTMLElement, bridge: StageBridge): StageHandle {
  const canvas = document.createElement('canvas')
  canvas.className = 'drill-stage__canvas'
  canvas.setAttribute('aria-label', '部署拓扑网格')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  parent.appendChild(canvas)

  const context = canvas.getContext('2d')
  let palette = readPalette(parent)
  let layout = computeLayout(parent.clientWidth, parent.clientHeight)
  let hoverId: string | null = null
  let frame = 0
  let disposed = false

  function resize() {
    const width = parent.clientWidth
    const height = parent.clientHeight
    if (width === 0 || height === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layout = computeLayout(width, height)
    palette = readPalette(parent)
  }

  function drawUnit(ctx: CanvasRenderingContext2D, unit: UnitNode, center: { x: number; y: number }) {
    const width = Math.min(62, layout.cellW * 1.05)
    const height = 34
    const x = center.x - width / 2
    const y = center.y - height / 2 + 2

    ctx.fillStyle = palette.panel
    roundRect(ctx, x, y, width, height, 4)
    ctx.fill()
    ctx.strokeStyle = hoverId === unit.id ? palette.accent : palette.border
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = palette.text
    ctx.font = `11px ${palette.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(unit.name, center.x, y + 11)

    ctx.fillStyle = palette.dim
    ctx.font = `9px ${palette.font}`
    ctx.fillText(`★${unit.star}`, center.x, y + 24)

    const barWidth = width - 12
    const ratio = unit.sli / 100
    ctx.fillStyle = palette.border
    ctx.fillRect(x + 6, y + height + 3, barWidth, 2)
    ctx.fillStyle = ratio > 0.6 ? palette.ok : ratio > 0.3 ? palette.warn : palette.err
    ctx.fillRect(x + 6, y + height + 3, barWidth * ratio, 2)
  }

  function render() {
    if (disposed) return
    const ctx = context
    if (!ctx) return
    const snapshot: DrillSnapshot = bridge.getSnapshot()

    ctx.clearRect(0, 0, layout.width, layout.height)
    ctx.fillStyle = palette.bg
    ctx.fillRect(0, 0, layout.width, layout.height)

    ctx.strokeStyle = palette.border
    ctx.lineWidth = 1
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const center = hexCenter(layout, col, row)
        hexPath(ctx, center.x, center.y, layout.radius * 0.92)
        ctx.stroke()
      }
    }

    ctx.fillStyle = palette.dim
    ctx.font = `10px ${palette.font}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`待命实例池（${snapshot.benchCount}）`, layout.radius, layout.benchY - 6)

    for (let index = 0; index < BENCH; index += 1) {
      const x = index * layout.benchW + 6
      const y = layout.benchY
      ctx.strokeStyle = index < snapshot.benchCount ? palette.border : palette.border
      ctx.strokeRect(x, y, layout.benchW - 12, 34)
    }

    for (const unit of snapshot.units) {
      drawUnit(ctx, unit, hexCenter(layout, unit.col, unit.row))
    }

    if (snapshot.phase === 'BATTLE') {
      ctx.strokeStyle = palette.accent
      ctx.globalAlpha = 0.35
      ctx.strokeRect(1, 1, layout.width - 2, layout.height - 2)
      ctx.globalAlpha = 1
    }

    frame = window.requestAnimationFrame(render)
  }

  function unitAt(px: number, py: number): string | null {
    const snapshot = bridge.getSnapshot()
    for (const unit of snapshot.units) {
      const center = hexCenter(layout, unit.col, unit.row)
      if (Math.abs(px - center.x) <= 32 && Math.abs(py - center.y) <= 24) return unit.id
    }
    return null
  }

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const id = unitAt(x, y)
    if (id !== hoverId) {
      hoverId = id
      canvas.style.cursor = id ? 'pointer' : 'default'
    }
    bridge.onHover({ unitId: id, x: event.clientX, y: event.clientY })
  }

  function onPointerLeave() {
    hoverId = null
    canvas.style.cursor = 'default'
    bridge.onHover({ unitId: null, x: 0, y: 0 })
  }

  function onClick(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect()
    const id = unitAt(event.clientX - rect.left, event.clientY - rect.top)
    if (id) bridge.onUnitPointer(id)
  }

  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize())
  observer?.observe(parent)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('click', onClick)

  resize()
  frame = window.requestAnimationFrame(render)

  return {
    destroy() {
      disposed = true
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('click', onClick)
      canvas.remove()
    },
  }
}
