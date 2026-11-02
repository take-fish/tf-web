import { makeBotBoard, makePveBoard } from './bots'
import { EMPTY_MODS, simulateBattle } from './combat'
import type { BattleTrace, FighterInput, Mods } from './combat'
import {
  AUGMENT_DEFS,
  POOL_COUNTS,
  SHOP_ODDS,
  TRAIT_BY_ID,
  UNIT_BY_ID,
  UNIT_DEFS,
  XP_TABLE,
} from './content'
import { hashString, mulberry32, pickIndex } from './rng'
import {
  activeTiers,
  benchCap,
  boardUnits,
  cellToCoord,
  cloneState,
  coordToCell,
  populationCap,
} from './state'
import type { AnnotationKind, GameState, OpponentState, ShopSlot, UnitInstance, Zone } from './state'

export type Command =
  | { type: 'BUY'; slot: number }
  | { type: 'SELL'; uid: string }
  | { type: 'MOVE'; uid: string; zone: Zone; slot: number }
  | { type: 'REROLL' }
  | { type: 'TOGGLE_LOCK'; slot: number }
  | { type: 'BUY_XP' }
  | { type: 'EQUIP'; uid: string; annotationId: string }
  | { type: 'PICK_AUGMENT'; id: string }
  | { type: 'START_BATTLE' }
  | { type: 'RESTART' }

export interface CommandResult {
  state: GameState
  /** 给 UI 的反馈：买不起、位置满等 */
  error?: string
  /** 战斗回放数据，仅 START_BATTLE 返回 */
  trace?: BattleTrace
}

const ANNOTATION_BUDGET = 10
const AUGMENT_ROUNDS: readonly number[] = [2, 7, 12]

function makeOpponents(): OpponentState[] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `r${index + 1}`,
    name: `对照组-${String(index + 1).padStart(2, '0')}`,
    sli: 60 + Math.round(Math.random() * 40),
    alive: true,
  }))
}

function rollShop(state: GameState, free: boolean): GameState {
  const odds = SHOP_ODDS[state.level] ?? SHOP_ODDS[3] ?? [75, 25, 0, 0, 0]
  const rng = mulberry32(hashString(`${state.seed}:${state.round}:${state.rerollsThisRound}:${state.units.length}`))
  const shop: ShopSlot[] = []

  for (let index = 0; index < 5; index += 1) {
    const existing = state.shop[index]
    if (existing?.locked && existing.defId) {
      shop.push({ ...existing })
      continue
    }
    const costIndex = pickIndex(rng, [...odds])
    const cost = costIndex + 1
    const candidates = UNIT_DEFS.filter(
      (def) => def.cost === cost && (state.pool[def.id] ?? 0) > 0,
    )
    if (candidates.length === 0) {
      shop.push({ defId: null, sold: true, locked: false })
      continue
    }
    const def = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]
    shop.push({ defId: def ? def.id : null, sold: false, locked: false })
  }

  return {
    ...state,
    shop,
    rerollsThisRound: free ? state.rerollsThisRound : state.rerollsThisRound + 1,
  }
}

export function createGame(seed = Date.now()): GameState {
  const pool: Record<string, number> = {}
  for (const def of UNIT_DEFS) pool[def.id] = POOL_COUNTS[def.cost] ?? 0

  const base: GameState = {
    seed,
    round: 1,
    totalRounds: 20,
    phase: 'PREP',
    quotas: 10,
    level: 3,
    xp: 0,
    sli: 100,
    streak: 0,
    units: [],
    benchSize: 9,
    shop: [],
    freeRerolls: 0,
    rerollsThisRound: 0,
    annotations: Array.from({ length: ANNOTATION_BUDGET }, (_, index) => ({
      id: `a${index + 1}`,
      kind: null,
    })),
    picks: [],
    pendingAugment: null,
    opponents: makeOpponents(),
    pool,
    lastBattle: null,
    log: [],
    usedSecondLife: false,
    mergedCount: 0,
  }

  return rollShop(base, true)
}

function firstFreeBench(state: GameState): number {
  const used = new Set(state.units.filter((unit) => unit.zone === 'bench').map((unit) => unit.slot))
  for (let slot = 0; slot < benchCap(state); slot += 1) {
    if (!used.has(slot)) return slot
  }
  return -1
}

function nextUid(state: GameState, defId: string): string {
  return `${defId}-${state.round}-${state.units.length}-${Math.floor(Math.random() * 1000)}`
}

/** 三合一，级联；X6 每次合并返还 1 个注解（每局上限 6）。 */
function mergeAll(state: GameState): GameState {
  let current = state
  let merged = true

  while (merged) {
    merged = false
    const groups = new Map<string, UnitInstance[]>()
    for (const unit of current.units) {
      const key = `${unit.defId}:${unit.star}`
      const list = groups.get(key) ?? []
      list.push(unit)
      groups.set(key, list)
    }

    for (const [, list] of groups) {
      if (list.length < 3) continue
      const first = list[0]
      if (!first || first.star >= 3) continue
      const consumed = list.slice(0, 3).map((unit) => unit.uid)
      const survivor = list[3]
      const targetStar = (first.star + 1) as 1 | 2 | 3
      const annotations = list.slice(0, 3).flatMap((unit) => unit.annotations).slice(0, 2)

      const units = current.units.filter((unit) => !consumed.includes(unit.uid))
      const anchor = survivor ?? { zone: first.zone, slot: first.slot }
      units.push({
        uid: nextUid(current, first.defId),
        defId: first.defId,
        star: targetStar,
        zone: anchor.zone,
        slot: anchor.slot,
        annotations,
      })

      const annotationsPool = current.annotations.map((item) => ({ ...item }))
      const empty = annotationsPool.find((item) => item.kind === null)
      if (
        current.picks.includes('X6') &&
        current.mergedCount < 6 &&
        empty &&
        annotations.length < 2
      ) {
        empty.kind = 'async'
      }

      current = cloneState({
        ...current,
        units,
        annotations: annotationsPool,
        mergedCount: current.mergedCount + 1,
      })
      merged = true
      break
    }
  }

  return current
}

function rerollCost(state: GameState): number {
  if (state.freeRerolls > 0) return 0
  if (state.picks.includes('S1') && state.rerollsThisRound === 0) return 0
  return 2
}

function buy(state: GameState, slotIndex: number): CommandResult {
  const slot = state.shop[slotIndex]
  if (!slot || slot.sold || !slot.defId) return { state, error: '该资源已下架' }
  const def = UNIT_BY_ID[slot.defId]
  if (!def) return { state, error: '资源不存在' }
  if (state.quotas < def.cost) return { state, error: '配额不足' }

  const next = cloneState(state)
  const benchSlot = firstFreeBench(next)
  if (benchSlot < 0) return { state, error: '待命席已满' }

  next.quotas -= def.cost
  next.pool = { ...next.pool, [def.id]: Math.max(0, (next.pool[def.id] ?? 0) - 1) }
  next.shop = next.shop.map((item, index) => (index === slotIndex ? { ...item, sold: true } : item))
  next.units = [
    ...next.units,
    {
      uid: nextUid(next, def.id),
      defId: def.id,
      star: 1,
      zone: 'bench',
      slot: benchSlot,
      annotations: [],
    },
  ]

  return { state: mergeAll(next) }
}

function sell(state: GameState, uid: string): CommandResult {
  const unit = state.units.find((item) => item.uid === uid)
  if (!unit) return { state, error: '实例不存在' }
  const def = UNIT_BY_ID[unit.defId]
  if (!def) return { state, error: '实例不存在' }

  const refund = def.cost * (unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9)
  const next = cloneState(state)
  next.quotas += refund
  next.units = next.units.filter((item) => item.uid !== uid)
  next.pool = { ...next.pool, [def.id]: (next.pool[def.id] ?? 0) + 1 }
  next.annotations = next.annotations.map((item, index) =>
    index < unit.annotations.length && item.kind === null
      ? { ...item, kind: unit.annotations[index] ?? 'async' }
      : item,
  )
  return { state: next }
}

function move(state: GameState, uid: string, zone: Zone, slot: number): CommandResult {
  const unit = state.units.find((item) => item.uid === uid)
  if (!unit) return { state, error: '实例不存在' }

  if (zone === 'board') {
    if (coordToCell(cellToCoord(slot).col, cellToCoord(slot).row) < 0) {
      return { state, error: '非法格位' }
    }
    const onBoard = boardUnits(state).filter((item) => item.uid !== uid)
    const target = state.units.find(
      (item) => item.uid !== uid && item.zone === 'board' && item.slot === slot,
    )
    // 拖到已被占用的格位是「替换」，上场人数不变，不额外占人口
    if (unit.zone !== 'board' && !target && onBoard.length >= populationCap(state)) {
      return { state, error: `上场已达上限 ${populationCap(state)}` }
    }
  }

  const occupant = state.units.find(
    (item) => item.uid !== uid && item.zone === zone && item.slot === slot,
  )

  const next = cloneState(state)
  next.units = next.units.map((item) => {
    if (item.uid === uid) return { ...item, zone, slot }
    if (occupant && item.uid === occupant.uid) {
      return { ...item, zone: unit.zone, slot: unit.slot }
    }
    return item
  })
  return { state: next }
}

function levelUpIfReady(state: GameState): GameState {
  let next = state
  while (next.level < 9) {
    const need = XP_TABLE[next.level] ?? 999
    if (next.xp < need) break
    next = { ...next, xp: next.xp - need, level: next.level + 1 }
  }
  return next
}

/** 战斗与专项共用的团队修正。 */
export function computeMods(state: GameState): Mods {
  const mods: Mods = { ...EMPTY_MODS }
  const tiers = activeTiers(state)
  for (const [trait, level] of Object.entries(tiers)) {
    const def = TRAIT_BY_ID[trait]
    const effect = def?.effects[level - 1]
    if (!effect) continue
    mods.atk += effect.atk ?? 0
    mods.as += effect.as ?? 0
    mods.ap += effect.ap ?? 0
    mods.armor += effect.armor ?? 0
    mods.mr += effect.mr ?? 0
    mods.hp += effect.hp ?? 0
    mods.onHitFlat += effect.onHitFlat ?? 0
    mods.executeBonus += effect.executeBonus ?? 0
    mods.reviveRatio = Math.max(mods.reviveRatio, effect.reviveRatio ?? 0)
    mods.deathAoe = Math.max(mods.deathAoe, effect.deathAoe ?? 0)
  }

  const picks = state.picks
  if (picks.includes('S5')) {
    mods.earlyAs = 0.08
    mods.earlyAsSeconds = 8
  }
  if (picks.includes('G6')) {
    mods.earlyDamage = 0.1
    mods.earlyDamageSeconds = 10
  }
  if (picks.includes('G2')) {
    mods.enemyAsDebuff = 0.12
    mods.enemyAsDebuffSeconds = 6
  }
  if (picks.includes('X5')) {
    mods.damageMul *= 1.15
    mods.takenMul *= 1.1
  }
  if (picks.includes('G8')) mods.aoeTakenMul *= 0.88
  if (picks.includes('X7')) mods.lateRegen = 0.025
  if (picks.includes('G4')) mods.reviveOne = true

  return mods
}

function income(state: GameState): number {
  let base = 5
  const caps = 5 + (state.picks.includes('S2') ? 1 : 0) - (state.picks.includes('G3') ? 2 : 0)
  const interestCap = state.picks.includes('X2') ? Infinity : Math.max(0, caps)
  const interest = Math.min(Math.floor(state.quotas / 10), interestCap)
  const streak = Math.abs(state.streak)
  const streakGold = streak >= 5 ? 3 : streak >= 3 ? 2 : streak >= 2 ? 1 : 0
  for (const [trait] of Object.entries(activeTiers(state))) {
    const def = TRAIT_BY_ID[trait]
    if (!def) continue
    const level = activeTiers(state)[trait] ?? 0
    const effect = def.effects[level - 1]
    base += effect?.goldPerRound ?? 0
  }
  if (state.picks.includes('G3')) base += 3
  if (state.picks.includes('S6') && [3, 6, 9, 12, 15, 18].includes(state.round)) base += 2
  return base + interest + streakGold
}

function settle(state: GameState): GameState {
  let next: GameState = {
    ...state,
    quotas: state.quotas + income(state),
    xp: state.xp + 4,
    freeRerolls: state.picks.includes('X4') ? 2 : 0,
    rerollsThisRound: 0,
    round: state.round + 1,
    phase: 'PREP',
  }
  next = levelUpIfReady(next)
  next = rollShop(next, true)

  if (next.round > next.totalRounds) {
    return { ...next, phase: 'END' }
  }

  if (AUGMENT_ROUNDS.includes(next.round)) {
    next = { ...next, pendingAugment: offerAugments(next) }
  }

  return next
}

function offerAugments(state: GameState): readonly string[] {
  const rng = mulberry32(hashString(`augment:${state.seed}:${state.round}`))
  const owned = new Set(state.picks)
  const tierRoll = rng()
  const tier = tierRoll < 0.6 ? 'silver' : tierRoll < 0.9 ? 'gold' : 'prismatic'
  const pool = AUGMENT_DEFS.filter((def) => def.tier === tier && !owned.has(def.id))
  const picked: string[] = []
  const candidates = [...pool]
  while (picked.length < 3 && candidates.length > 0) {
    const index = pickIndex(rng, candidates.map(() => 1))
    const def = candidates[index]
    if (!def) break
    picked.push(def.id)
    candidates.splice(index, 1)
  }
  return picked
}

function battleDamage(state: GameState, survivors: number, won: boolean): number {
  const base = 4 + Math.floor(state.round / 4) + survivors * 2
  if (won) return 0
  if (state.picks.includes('S8') && state.round <= 3) return 0
  return state.round <= 3 ? Math.ceil(base / 2) : base
}

function fight(state: GameState): CommandResult {
  const next = cloneState(state)
  const allyInputs: FighterInput[] = boardUnits(next).map((unit) => {
    const coord = cellToCoord(unit.slot)
    return {
      uid: unit.uid,
      defId: unit.defId,
      star: unit.star,
      col: coord.col,
      row: coord.row,
      annotations: unit.annotations,
    }
  })

  if (allyInputs.length === 0) {
    return { state: { ...next, phase: 'PREP' } }
  }

  const pve = next.round <= 3
  const enemy = pve ? makePveBoard(next.seed, next.round) : makeBotBoard(next.seed, next.round)
  const allyMods = computeMods(next)
  const enemyMods: Mods = { ...EMPTY_MODS }
  if (allyMods.enemyAsDebuff > 0) {
    enemyMods.as -= allyMods.enemyAsDebuff
  }

  const outcome = simulateBattle(allyInputs, enemy.units, allyMods, enemyMods)

  const sliBefore = next.sli
  const won = outcome.winner === 'ally'
  const damage = battleDamage(next, outcome.enemyAlive, won)
  let sli = Math.max(0, next.sli - damage)

  if (sli === 0 && !next.usedSecondLife && next.picks.includes('X1')) {
    sli = 20
    next.usedSecondLife = true
  }

  const report = {
    round: next.round,
    mode: (pve ? 'PVE' : 'PVP') as 'PVE' | 'PVP',
    won,
    opponent: enemy.name,
    sliBefore,
    sliAfter: sli,
    survivors: outcome.allyAlive,
    ticks: outcome.ticks,
    curve: outcome.curve,
  }

  const settled: GameState = {
    ...next,
    sli,
    streak: won ? Math.max(1, next.streak + 1) : Math.min(-1, next.streak - 1),
    lastBattle: report,
    log: [
      ...next.log,
      {
        round: next.round,
        won,
        mode: (pve ? 'PVE' : 'PVP') as 'PVE' | 'PVP',
        text: `${enemy.name} · ${won ? '通过' : '未通过'} · SLI ${sliBefore} → ${sli}`,
      },
    ],
  }

  const trace = outcome.trace

  if (sli === 0) {
    return { state: { ...settled, phase: 'END' }, trace }
  }

  return { state: settle(settled), trace }
}

export function dispatch(state: GameState, command: Command): CommandResult {
  switch (command.type) {
    case 'BUY':
      return buy(state, command.slot)

    case 'SELL':
      return sell(state, command.uid)

    case 'MOVE':
      return move(state, command.uid, command.zone, command.slot)

    case 'REROLL': {
      const cost = rerollCost(state)
      if (state.quotas < cost) return { state, error: '配额不足' }
      const next = cloneState(state)
      next.quotas -= cost
      if (next.freeRerolls > 0) next.freeRerolls -= 1
      return { state: rollShop(next, false) }
    }

    case 'TOGGLE_LOCK': {
      const slot = state.shop[command.slot]
      if (!slot) return { state, error: '格位不存在' }
      const next = cloneState(state)
      next.shop = next.shop.map((item, index) =>
        index === command.slot ? { ...item, locked: !item.locked } : item,
      )
      return { state: next }
    }

    case 'BUY_XP': {
      if (state.quotas < 4) return { state, error: '配额不足' }
      const next = levelUpIfReady({ ...cloneState(state), quotas: state.quotas - 4, xp: state.xp + 4 })
      return { state: next }
    }

    case 'EQUIP': {
      const item = state.annotations.find((annotation) => annotation.id === command.annotationId)
      if (!item || item.kind === null) return { state, error: '注解不可用' }
      const unit = state.units.find((candidate) => candidate.uid === command.uid)
      if (!unit) return { state, error: '实例不存在' }
      if (unit.annotations.length >= 2) return { state, error: '每个实例最多 2 个注解' }
      const next = cloneState(state)
      next.units = next.units.map((candidate) =>
        candidate.uid === command.uid
          ? { ...candidate, annotations: [...candidate.annotations, item.kind as AnnotationKind] }
          : candidate,
      )
      next.annotations = next.annotations.map((annotation) =>
        annotation.id === command.annotationId ? { ...annotation, kind: null } : annotation,
      )
      return { state: next }
    }

    case 'PICK_AUGMENT': {
      if (!state.pendingAugment?.includes(command.id)) return { state, error: '该方案不可选' }
      return { state: { ...cloneState(state), picks: [...state.picks, command.id], pendingAugment: null } }
    }

    case 'START_BATTLE': {
      if (state.pendingAugment) return { state, error: '请先完成技术方案评审' }
      if (state.phase !== 'PREP') return { state, error: '当前阶段不可发起' }
      if (boardUnits(state).length === 0) return { state, error: '请先部署至少 1 个实例' }
      return fight(state)
    }

    case 'RESTART':
      return { state: createGame(Date.now()) }

    default:
      return { state }
  }
}

export function restartWithSeed(seed: number): GameState {
  return createGame(seed)
}
