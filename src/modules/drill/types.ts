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
  /** 归属实例定义（用于技能详述等静态信息） */
  defId?: string
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
  /** 建议站位：前排 / 中排 / 后排 */
  advice: string
  annotations: readonly string[]
}

export interface BenchUnit {
  id: string
  name: string
  cost: number
  star: 1 | 2 | 3
  traits: readonly string[]
  advice: string
}

export interface ShopSlot {
  slot: number
  unitId: string | null
  name: string
  cost: number
  traits: readonly string[]
  locked: boolean
  soldOut: boolean
  advice: string
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

/** 选秀轮盘上的候选：实例 + 附带注解。 */
export interface DraftCandidate {
  id: string
  defId: string
  name: string
  cost: number
  traits: readonly string[]
  annotation: string | null
  angle: number
}

/** 阶段内某一回合的战果，won 为 null 表示还没打。 */
export type DrillMode = 'solo' | 'party'

/** 组队席位：席位 0 固定是自己，其余可由在线用户占据或被 AI 补齐 */
export interface PartySeat {
  seat: number
  userId: string
  nickname: string
  isAi: boolean
}

/** 本轮对阵行：只描述当前回合，回合切走即重建 */
export interface MatchupRow {
  id: string
  round: number
  home: string
  away: string
  isPlayer: boolean
  played: boolean
  hasTrace: boolean
  resultLabel: string
  detail: string
  tone: 'ok' | 'err' | 'pending'
}

export interface StageResult {
  round: number
  label: string
  won: boolean | null
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
  /** 终局名次，未结束时为 null */
  placement: number | null
  /** 终局积分，未结束时为 null */
  matchPoints: number | null
  /** 仍在场的席位数（含自己） */
  aliveSeats: number
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
  stage: number
  stageRound: number
  stageLabel: string
  stageCount: number
  stageResults: readonly StageResult[]
  carousel: readonly DraftCandidate[]
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
