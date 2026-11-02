import { TRAIT_DEFS, UNIT_BY_ID } from './content'
import type { UnitDef } from './content'

const TRAIT_TABLE: Readonly<Record<string, { tiers: readonly number[] }>> = Object.fromEntries(
  TRAIT_DEFS.map((def) => [def.id, { tiers: def.tiers }]),
)

export type Phase = 'PREP' | 'BATTLE' | 'SETTLE' | 'END'
export type Zone = 'board' | 'bench'
export type AnnotationKind = 'async' | 'retry' | 'cache' | 'tx'

export const BOARD_COLS = 7
export const BOARD_ROWS = 4
export const BOARD_SIZE = BOARD_COLS * BOARD_ROWS

export interface UnitInstance {
  uid: string
  defId: string
  star: 1 | 2 | 3
  zone: Zone
  /** board: 0..27 格号；bench: 0..benchSize-1 */
  slot: number
  annotations: readonly AnnotationKind[]
}

export interface ShopSlot {
  defId: string | null
  sold: boolean
  locked: boolean
}

export interface AnnotationItem {
  id: string
  kind: AnnotationKind | null
}

export interface OpponentState {
  id: string
  name: string
  sli: number
  alive: boolean
}

export interface BattleReport {
  round: number
  mode: 'PVE' | 'PVP'
  won: boolean
  opponent: string
  sliBefore: number
  sliAfter: number
  survivors: number
  ticks: number
  /** 双方兵力曲线，供报告页画折线 */
  curve: readonly number[]
}

export interface GameState {
  seed: number
  round: number
  totalRounds: number
  phase: Phase
  quotas: number
  level: number
  xp: number
  sli: number
  streak: number
  units: readonly UnitInstance[]
  benchSize: number
  shop: readonly ShopSlot[]
  /** 本轮免费刷新剩余次数 */
  freeRerolls: number
  /** 本轮已刷新次数，用于 S1 的"第一次免费" */
  rerollsThisRound: number
  annotations: readonly AnnotationItem[]
  picks: readonly string[]
  pendingAugment: readonly string[] | null
  opponents: readonly OpponentState[]
  pool: Readonly<Record<string, number>>
  lastBattle: BattleReport | null
  log: readonly { round: number; text: string }[]
  /** 本局是否已用掉 X1 的复活 */
  usedSecondLife: boolean
  mergedCount: number
}

export const STAR_MULT: Readonly<Record<1 | 2 | 3, number>> = { 1: 1, 2: 1.8, 3: 3 }

export function starMult(star: 1 | 2 | 3, cost: number): number {
  if (star === 3 && cost === 5) return 2.2
  return STAR_MULT[star]
}

export function defOf(unit: UnitInstance): UnitDef {
  const def = UNIT_BY_ID[unit.defId]
  if (!def) throw new Error(`unknown unit ${unit.defId}`)
  return def
}

export function boardUnits(state: GameState): readonly UnitInstance[] {
  return state.units.filter((unit) => unit.zone === 'board')
}

export function benchUnits(state: GameState): readonly UnitInstance[] {
  return state.units.filter((unit) => unit.zone === 'bench')
}

/** 上场人口上限：等级 + X8，最多 10。 */
export function populationCap(state: GameState): number {
  const popBonus = state.picks.includes('X8') ? 1 : 0
  return Math.min(10, state.level + popBonus)
}

export function benchCap(state: GameState): number {
  return state.picks.includes('G7') ? 12 : 9
}

/** 亲和组计数：按去重后的实例定义统计，转职与 G1 只能补位不能破顶。 */
export function traitCounts(state: GameState): Record<string, { count: number; members: string[] }> {
  const seen = new Map<string, Set<string>>()
  const units = boardUnits(state)
  for (const unit of units) {
    const def = defOf(unit)
    for (const trait of def.traits) {
      const set = seen.get(trait) ?? new Set<string>()
      set.add(def.id)
      seen.set(trait, set)
    }
  }

  const cap = units.length
  const result: Record<string, { count: number; members: string[] }> = {}
  for (const [trait, set] of seen) {
    result[trait] = { count: Math.min(cap, set.size), members: [...set] }
  }

  // 转职（@Profile）额外 +1，不与已有同名叠加
  for (const unit of units) {
    if (!unit.annotations.includes('tx')) continue
    const def = defOf(unit)
    const candidate = def.traits.find((trait) => {
      const entry = result[trait]
      return entry !== undefined && entry.members.length > 0
    })
    if (!candidate) continue
    const entry = result[candidate]
    if (!entry) continue
    entry.count = Math.min(cap, entry.count + 1)
  }

  if (state.picks.includes('G1')) {
    let bestTrait: string | null = null
    let bestCount = -1
    for (const [trait, entry] of Object.entries(result)) {
      if (entry.count > bestCount || (entry.count === bestCount && bestTrait !== null && trait < bestTrait)) {
        bestTrait = trait
        bestCount = entry.count
      }
    }
    if (bestTrait) {
      const entry = result[bestTrait]
      if (entry) entry.count = Math.min(cap, entry.count + 1)
    }
  }

  return result
}

/** 所有已达成档位（含 X3 阈值下移）。 */
export function activeTiers(state: GameState): Record<string, number> {
  const counts = traitCounts(state)
  const shift = state.picks.includes('X3') ? 1 : 0
  const result: Record<string, number> = {}
  for (const [trait, entry] of Object.entries(counts)) {
    const def = TRAIT_TABLE[trait]
    if (!def) continue
    const tiers = def.tiers.map((tier) => Math.max(2, tier - shift))
    let level = 0
    for (const tier of tiers) {
      if (entry.count >= tier) level += 1
    }
    if (level > 0) result[trait] = level
  }
  return result
}

/** 回合 PVE 判定：前 3 轮打基准负载，之后 PVP。 */
export function isPveRound(round: number): boolean {
  return round <= 3
}

export function cellToCoord(slot: number): { col: number; row: number } {
  return { col: slot % BOARD_COLS, row: Math.floor(slot / BOARD_COLS) }
}

export function coordToCell(col: number, row: number): number {
  if (col < 0 || col >= BOARD_COLS || row < 0 || row >= BOARD_ROWS) return -1
  return row * BOARD_COLS + col
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    units: state.units.map((unit) => ({ ...unit, annotations: [...unit.annotations] })),
    shop: state.shop.map((slot) => ({ ...slot })),
    annotations: state.annotations.map((item) => ({ ...item })),
    picks: [...state.picks],
    opponents: state.opponents.map((opponent) => ({ ...opponent })),
    pool: { ...state.pool },
    log: [...state.log],
    pendingAugment: state.pendingAugment ? [...state.pendingAugment] : null,
  }
}
