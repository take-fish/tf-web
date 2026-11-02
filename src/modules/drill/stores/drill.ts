import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { AUGMENT_BY_ID, TRAIT_DEFS, UNIT_BY_ID, XP_TABLE } from '../core/content'
import { createGame, dispatch } from '../core/engine'
import type { BattleTrace } from '../core/combat'
import type { Command } from '../core/engine'
import {
  activeTiers,
  benchCap,
  benchUnits,
  boardUnits,
  cellToCoord,
  populationCap,
  traitCounts,
} from '../core/state'
import type { AnnotationKind, GameState } from '../core/state'
import { formatElapsed } from '../format'
import type {
  AnnotationSlot,
  BenchUnit,
  DrillSnapshot,
  ProposalCard,
  ShopSlot,
  TraitLine,
  UnitNode,
} from '../types'

const STORAGE_KEY = 'fm.drill.state.v1'

const ANNOTATION_LABEL: Readonly<Record<AnnotationKind, string>> = {
  async: '@Async',
  retry: '@Retry',
  cache: '@Cacheable',
  tx: '@Tx',
}

const FORM_LABEL: Readonly<Record<string, string>> = {
  single: '单体',
  line: '直线',
  aoe: '范围',
  buff: '增益',
  sustain: '续航',
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GameState
      if (parsed && typeof parsed.seed === 'number' && Array.isArray(parsed.units)) {
        return parsed
      }
    }
  } catch {
    // 存档损坏就用新局
  }
  return createGame(Date.now())
}

/** 引擎状态 → 视图快照。玩法词汇在这里统一翻译成平台词汇。 */
function project(state: GameState, elapsed: number): DrillSnapshot {
  const counts = traitCounts(state)
  const tiers = activeTiers(state)

  const traits: TraitLine[] = TRAIT_DEFS.map((def) => {
    const entry = counts[def.id]
    return {
      id: def.id,
      label: def.label,
      tiers: def.tiers,
      count: entry?.count ?? 0,
      activeTier: tiers[def.id] ?? 0,
    }
  })

  const units: UnitNode[] = boardUnits(state).map((unit) => {
    const def = UNIT_BY_ID[unit.defId]
    const coord = cellToCoord(unit.slot)
    return {
      id: unit.uid,
      name: def?.name ?? unit.defId,
      cost: def?.cost ?? 1,
      star: unit.star,
      traits: (def?.traits ?? []).map(
        (trait) => TRAIT_DEFS.find((item) => item.id === trait)?.label ?? trait,
      ),
      col: coord.col,
      row: coord.row,
      sli: 100,
      power: Math.round((def?.atk ?? 50) * unit.star),
      throughput: Math.round((def?.hp ?? 600) / 10),
      skill: def ? `${def.skill.name}（${FORM_LABEL[def.skill.form] ?? '单体'}）` : '',
      annotations: unit.annotations.map((kind) => ANNOTATION_LABEL[kind]),
    }
  })

  const bench: BenchUnit[] = benchUnits(state).map((unit) => {
    const def = UNIT_BY_ID[unit.defId]
    return {
      id: unit.uid,
      name: def?.name ?? unit.defId,
      cost: def?.cost ?? 1,
      star: unit.star,
      traits: (def?.traits ?? []).map(
        (trait) => TRAIT_DEFS.find((item) => item.id === trait)?.label ?? trait,
      ),
    }
  })

  const shop: ShopSlot[] = state.shop.map((slot, index) => {
    const def = slot.defId ? UNIT_BY_ID[slot.defId] : undefined
    return {
      slot: index + 1,
      unitId: slot.defId,
      name: def?.name ?? '无可用资源',
      cost: def?.cost ?? 0,
      traits: (def?.traits ?? []).map(
        (trait) => TRAIT_DEFS.find((item) => item.id === trait)?.label ?? trait,
      ),
      locked: slot.locked,
      soldOut: slot.sold || slot.defId === null,
    }
  })

  const annotations: AnnotationSlot[] = state.annotations.map((item) => ({
    id: item.id,
    label: item.kind ? ANNOTATION_LABEL[item.kind] : '',
    combo: item.kind === 'retry',
    kind: item.kind,
  }))

  const toProposal = (id: string): ProposalCard | null => {
    const def = AUGMENT_BY_ID[id]
    if (!def) return null
    return {
      id: def.id,
      name: def.name,
      tier: def.scope,
      effect: def.effect,
      upside: def.upside,
      risk: def.risk,
    }
  }

  const proposals = (state.pendingAugment ?? [])
    .map((id) => toProposal(id))
    .filter((card): card is ProposalCard => card !== null)

  const picks = state.picks
    .map((id) => toProposal(id))
    .filter((card): card is ProposalCard => card !== null)

  return {
    seed: state.seed,
    drillName: 'cap-prod-01',
    quotas: state.quotas,
    level: state.level,
    xp: state.xp,
    xpNeed: XP_TABLE[state.level] ?? 0,
    round: Math.min(state.round, state.totalRounds),
    totalRounds: state.totalRounds,
    sli: state.sli,
    scale: boardUnits(state).length,
    elapsed,
    phase: state.phase === 'END' ? 'TERMINATED' : state.phase,
    units,
    bench,
    benchCount: bench.length,
    benchCap: benchCap(state),
    popCap: populationCap(state),
    traits,
    shop,
    annotations,
    roster: state.opponents.map((opponent) => ({
      id: opponent.id,
      label: opponent.name,
      sli: opponent.sli,
      alive: opponent.alive,
    })),
    proposals,
    picks,
    achievement: Object.values(tiers).filter((tier) => tier > 0).length,
    battle: state.lastBattle,
    history: state.log,
    over: state.phase === 'END',
  }
}

export const useDrillStore = defineStore('drill', () => {
  const state = ref<GameState>(loadState())
  const elapsed = ref(0)
  const error = ref<string | null>(null)
  const paused = ref(false)

  const snapshot = computed(() => project(state.value, elapsed.value))
  const elapsedLabel = computed(() => formatElapsed(elapsed.value))
  const rerollCost = computed(() => (state.value.freeRerolls > 0 ? 0 : 2))
  const levelUpCost = 4
  const isPrep = computed(() => state.value.phase === 'PREP')
  const lastBattle = computed(() => state.value.lastBattle)
const lastTrace = ref<BattleTrace | null>(null)

  watch(
    state,
    (next) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // 存不下不影响本局
      }
    },
    { deep: true },
  )

  function run(command: Command): boolean {
    const result = dispatch(state.value, command)
    if (result.error) {
      error.value = result.error
      return false
    }
    if (result.trace) lastTrace.value = result.trace
    state.value = result.state
    error.value = null
    return true
  }

  function tick(seconds = 1) {
    if (paused.value || state.value.phase !== 'PREP') return
    elapsed.value += seconds
  }

  function togglePause() {
    paused.value = !paused.value
  }

  function buy(slotIndex: number) {
    return run({ type: 'BUY', slot: slotIndex })
  }

  function sell(uid: string) {
    return run({ type: 'SELL', uid })
  }

  function move(uid: string, zone: 'board' | 'bench', slot: number) {
    return run({ type: 'MOVE', uid, zone, slot })
  }

  function reroll() {
    return run({ type: 'REROLL' })
  }

  function toggleLock(slot: number) {
    return run({ type: 'TOGGLE_LOCK', slot })
  }

  function buyXp() {
    return run({ type: 'BUY_XP' })
  }

  function equip(uid: string, annotationId: string) {
    return run({ type: 'EQUIP', uid, annotationId })
  }

  function pickAugment(id: string) {
    return run({ type: 'PICK_AUGMENT', id })
  }

  function startBattle() {
    return run({ type: 'START_BATTLE' })
  }

  function restart() {
    state.value = createGame(Date.now())
    elapsed.value = 0
    error.value = null
    lastTrace.value = null
  }

  return {
    state,
    snapshot,
    elapsed,
    elapsedLabel,
    paused,
    error,
    lastBattle,
    lastTrace,
    rerollCost,
    levelUpCost,
    isPrep,
    tick,
    togglePause,
    buy,
    sell,
    move,
    reroll,
    toggleLock,
    buyXp,
    equip,
    pickAugment,
    startBattle,
    restart,
  }
})
