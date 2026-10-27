import type {
  BlindPieceColor,
  BlindPieceType,
  BlindPieceView,
} from '../types'

export const BLIND_WIDTH = 9
export const BLIND_HEIGHT = 10

export interface BlindCell {
  x: number
  y: number
}

/** 前端仅用于选棋与落点提示；服务端仍是唯一裁判。 */
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BLIND_WIDTH && y >= 0 && y < BLIND_HEIGHT
}

export function pieceAt(
  pieces: readonly BlindPieceView[],
  x: number,
  y: number,
): BlindPieceView | undefined {
  return pieces.find((piece) => piece.x === x && piece.y === y)
}

export function canMove(
  pieces: readonly BlindPieceView[],
  color: BlindPieceColor,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (!inBounds(fromX, fromY) || !inBounds(toX, toY)) return false
  if (fromX === toX && fromY === toY) return false

  const from = pieceAt(pieces, fromX, fromY)
  if (!from || !from.revealed || from.color !== color || !from.pieceType) return false

  const target = pieceAt(pieces, toX, toY)
  if (target?.revealed && target.color === color) return false

  const dx = toX - fromX
  const dy = toY - fromY
  switch (from.pieceType) {
    case 'GENERAL':
      return Math.abs(dx) + Math.abs(dy) === 1
    case 'ADVISOR':
      return Math.abs(dx) === 1 && Math.abs(dy) === 1
    case 'ELEPHANT':
      return (
        Math.abs(dx) === 2 &&
        Math.abs(dy) === 2 &&
        !pieceAt(pieces, fromX + dx / 2, fromY + dy / 2)
      )
    case 'HORSE':
      return horseCanMove(pieces, fromX, fromY, dx, dy)
    case 'CHARIOT':
      return (dx === 0 || dy === 0) && piecesBetween(pieces, fromX, fromY, toX, toY) === 0
    case 'CANNON': {
      if (dx !== 0 && dy !== 0) return false
      const screens = piecesBetween(pieces, fromX, fromY, toX, toY)
      return target ? screens === 1 : screens === 0
    }
    case 'SOLDIER':
      return soldierCanMove(color, fromX, fromY, dx, dy)
    default:
      return false
  }
}

export function legalTargets(
  pieces: readonly BlindPieceView[],
  color: BlindPieceColor,
  fromX: number,
  fromY: number,
): BlindCell[] {
  const targets: BlindCell[] = []
  for (let y = 0; y < BLIND_HEIGHT; y += 1) {
    for (let x = 0; x < BLIND_WIDTH; x += 1) {
      if (canMove(pieces, color, fromX, fromY, x, y)) targets.push({ x, y })
    }
  }
  return targets
}

export function pieceGlyph(color: BlindPieceColor, type: BlindPieceType): string {
  return GLYPHS[color][type]
}

export function pieceLabel(color: BlindPieceColor, type: BlindPieceType): string {
  return `${color === 'RED' ? '红' : '黑'}${pieceGlyph(color, type)}`
}

export function colorOfPlayer(
  userId: string,
  firstUserId: string | undefined,
  secondUserId: string | undefined,
): BlindPieceColor | null {
  if (!userId) return null
  if (userId === firstUserId) return 'RED'
  if (userId === secondUserId) return 'BLACK'
  return null
}

const GLYPHS: Record<BlindPieceColor, Record<BlindPieceType, string>> = {
  RED: {
    GENERAL: '帅',
    ADVISOR: '仕',
    ELEPHANT: '相',
    HORSE: '马',
    CHARIOT: '车',
    CANNON: '炮',
    SOLDIER: '兵',
  },
  BLACK: {
    GENERAL: '将',
    ADVISOR: '士',
    ELEPHANT: '象',
    HORSE: '马',
    CHARIOT: '车',
    CANNON: '炮',
    SOLDIER: '卒',
  },
}

function horseCanMove(
  pieces: readonly BlindPieceView[],
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  if (Math.abs(dx) === 2 && Math.abs(dy) === 1) {
    return !pieceAt(pieces, x + dx / 2, y)
  }
  if (Math.abs(dx) === 1 && Math.abs(dy) === 2) {
    return !pieceAt(pieces, x, y + dy / 2)
  }
  return false
}

function piecesBetween(
  pieces: readonly BlindPieceView[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const stepX = Math.sign(toX - fromX)
  const stepY = Math.sign(toY - fromY)
  let x = fromX + stepX
  let y = fromY + stepY
  let count = 0
  while (x !== toX || y !== toY) {
    if (pieceAt(pieces, x, y)) count += 1
    x += stepX
    y += stepY
  }
  return count
}

function soldierCanMove(
  color: BlindPieceColor,
  fromX: number,
  fromY: number,
  dx: number,
  dy: number,
): boolean {
  const forward = color === 'RED' ? -1 : 1
  if (dx === 0 && dy === forward) return true
  return crossedRiver(color, fromY) && Math.abs(dx) === 1 && dy === 0
}

function crossedRiver(color: BlindPieceColor, y: number): boolean {
  return color === 'RED' ? y <= 4 : y >= 5
}
