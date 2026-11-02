/**
 * 容量编排演练 · 视图模型
 *
 * 这里的字段全部是「平台语义」：实例 / 亲和组 / 配额 / SLI / 轮次。
 * 玩法侧的 `GameSession` 尚未接入（M2–M5），本模块先用夹具驱动，
 * 接真实模拟时只替换 `useDrillStore.dispatch` 的实现，视图层不动。
 */

export type DrillPhase = 'PREP' | 'BATTLE' | 'SETTLE' | 'TERMINATED'

/** 技术方案的影响面：局部 / 模块 / 全局。对应内部品质 银 / 金 / 彩。 */
export type ProposalTier = 'local' | 'module' | 'global'

export interface UnitNode {
  id: string
  name: string
  cost: number
  star: 1 | 2 | 3
  traits: readonly string[]
  /** 部署拓扑上的格子坐标（odd-q 偏移）。 */
  col: number
  row: number
  sli: number
  power: number
  throughput: number
  skill: string
  annotations: readonly string[]
}

export interface TraitLine {
  id: string
  label: string
  tiers: readonly number[]
  count: number
}

export interface ShopSlot {
  slot: number
  unitId: string
  name: string
  cost: number
  traits: readonly string[]
  locked: boolean
  soldOut: boolean
}

export interface AnnotationSlot {
  id: string
  label: string
  combo: boolean
}

export interface RosterEntry {
  id: string
  label: string
  sli: number
  alive: boolean
}

export interface ProposalCard {
  id: string
  name: string
  tier: ProposalTier
  effect: string
  upside: string
  risk: string
}

export interface DrillSnapshot {
  drillName: string
  quotas: number
  level: number
  round: number
  totalRounds: number
  sli: number
  scale: number
  elapsed: number
  phase: DrillPhase
  units: readonly UnitNode[]
  benchCount: number
  traits: readonly TraitLine[]
  shop: readonly ShopSlot[]
  annotations: readonly AnnotationSlot[]
  roster: readonly RosterEntry[]
  proposals: readonly ProposalCard[]
  picks: readonly ProposalCard[]
  achievement: number
}

export interface StageBridge {
  getSnapshot(): DrillSnapshot
  onUnitPointer(unitId: string): void
  onHover(payload: { unitId: string | null; x: number; y: number }): void
}

export interface StageHandle {
  destroy(): void
}
