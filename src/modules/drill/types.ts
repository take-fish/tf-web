/**
 * 容量编排演练 · 视图模型
 *
 * 引擎在 `core/` 里跑纯数据，这一层只做「平台语义」的投影：
 * 实例 / 亲和组 / 配额 / SLI / 轮次，界面上不会出现玩法词汇。
 */

export type DrillPhase = 'PREP' | 'BATTLE' | 'SETTLE' | 'TERMINATED'

/** 技术方案的影响面：局部 / 模块 / 全局。对应专项品质 银 / 金 / 彩。 */
export type ProposalTier = 'local' | 'module' | 'global'

export interface UnitNode {
  id: string
  name: string
  cost: number
  star: 1 | 2 | 3
  traits: readonly string[]
  col: number
  row: number
  sli: number
  power: number
  throughput: number
  skill: string
  annotations: readonly string[]
}

export interface BenchUnit {
  id: string
  name: string
  cost: number
  star: 1 | 2 | 3
  traits: readonly string[]
}

export interface ShopSlot {
  slot: number
  unitId: string | null
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
  kind: string | null
}

export interface RosterEntry {
  id: string
  label: string
  sli: number
  alive: boolean
}

export interface TraitLine {
  id: string
  label: string
  tiers: readonly number[]
  count: number
  activeTier: number
}

export interface ProposalCard {
  id: string
  name: string
  tier: ProposalTier
  effect: string
  upside: string
  risk: string
}

export interface BattleSummary {
  round: number
  mode: 'PVE' | 'PVP'
  won: boolean
  opponent: string
  sliBefore: number
  sliAfter: number
  survivors: number
  ticks: number
  curve: readonly number[]
}

export interface DrillSnapshot {
  seed: number
  drillName: string
  quotas: number
  level: number
  xp: number
  xpNeed: number
  round: number
  totalRounds: number
  sli: number
  scale: number
  elapsed: number
  phase: DrillPhase
  units: readonly UnitNode[]
  bench: readonly BenchUnit[]
  benchCount: number
  benchCap: number
  popCap: number
  traits: readonly TraitLine[]
  shop: readonly ShopSlot[]
  annotations: readonly AnnotationSlot[]
  roster: readonly RosterEntry[]
  proposals: readonly ProposalCard[]
  picks: readonly ProposalCard[]
  achievement: number
  battle: BattleSummary | null
  history: readonly { round: number; won: boolean; mode: 'PVE' | 'PVP'; text: string }[]
  over: boolean
}

export interface StageBridge {
  getSnapshot(): DrillSnapshot
  onUnitPointer(unitId: string): void
  onHover(payload: { unitId: string | null; x: number; y: number }): void
  onDrop?(payload: { unitId: string; zone: 'board' | 'bench'; slot: number }): void
}

export interface StageHandle {
  destroy(): void
}
