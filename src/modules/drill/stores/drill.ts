import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { AUGMENT_BY_ID, suggestedRow, TRAIT_DEFS, UNIT_BY_ID, XP_TABLE } from '../core/content'
import { createGame, dispatch, stageOf } from '../core/engine'
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
import type { AnnotationKind, BattleReport, GameState } from '../core/state'
import { formatElapsed } from '../format'
import { EMPTY_MODS, simulateBattle } from '../core/combat'
import { makeBotBoard } from '../core/bots'
import { useDrillNamingStore } from './naming'
import type {
  AnnotationSlot,
  BenchUnit,
  DraftCandidate,
  DrillSnapshot,
  MatchupRow,
  PartySeat,
  DrillMode,
  ProposalCard,
  ShopSlot,
  StageResult,
  TraitLine,
  UnitNode,
} from '../types'

const STORAGE_KEY = 'fm.drill.state.v1'
const MODE_KEY = 'fm.drill.mode.v1'
const PARTY_KEY = 'fm.drill.party.v1'

function loadMode(): DrillMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    return raw === 'solo' || raw === 'party' || raw === 'tournament' ? raw : null
  } catch {
    return null
  }
}

function loadParty(): PartySeat[] {
  try {
    const raw = localStorage.getItem(PARTY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PartySeat[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

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

function loadState(tournament = false): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GameState
      if (
        parsed &&
        typeof parsed.seed === 'number' &&
        Array.isArray(parsed.units) &&
        (parsed.tournament === true) === tournament
      ) {
        return parsed
      }
    }
  } catch {
    // 存档损坏就用新局
  }
  return createGame(Date.now(), { tournament })
}

/** 引擎状态 → 视图快照。玩法词汇在这里统一翻译成平台词汇。 */
interface NamingMaps {
  unit: Record<string, string>
  trait: Record<string, string>
}

function project(
  state: GameState,
  elapsed: number,
  naming: NamingMaps,
  party: readonly PartySeat[] = [],
): DrillSnapshot {
  const unitName = (defId: string, fallback: string) => naming.unit[defId] ?? fallback
  const traitLabel = (id: string, fallback: string) => naming.trait[id] ?? fallback
  const counts = traitCounts(state)
  const tiers = activeTiers(state)

  const traits: TraitLine[] = TRAIT_DEFS.map((def) => {
    const entry = counts[def.id]
    return {
      id: def.id,
      label: traitLabel(def.id, def.label),
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
      defId: unit.defId,
      name: def ? unitName(unit.defId, def.name) : unit.defId,
      cost: def?.cost ?? 1,
      star: unit.star,
      traits: (def?.traits ?? []).map(
        (trait) => traitLabel(trait, TRAIT_DEFS.find((item) => item.id === trait)?.label ?? trait),
      ),
      col: coord.col,
      row: coord.row,
      sli: 100,
      power: Math.round((def?.atk ?? 50) * unit.star),
      throughput: Math.round((def?.hp ?? 600) / 10),
      skill: def ? `${def.skill.name}（${FORM_LABEL[def.skill.form] ?? '单体'}）` : '',
      advice: def ? suggestedRow(def) : '中排',
      annotations: unit.annotations.map((kind) => ANNOTATION_LABEL[kind]),
    }
  })

  const bench: BenchUnit[] = benchUnits(state).map((unit) => {
    const def = UNIT_BY_ID[unit.defId]
    return {
      id: unit.uid,
      defId: unit.defId,
      name: def ? unitName(unit.defId, def.name) : unit.defId,
      cost: def?.cost ?? 1,
      star: unit.star,
      traits: (def?.traits ?? []).map(
        (trait) => traitLabel(trait, TRAIT_DEFS.find((item) => item.id === trait)?.label ?? trait),
      ),
      advice: def ? suggestedRow(def) : '中排',
    }
  })

  const shop: ShopSlot[] = state.shop.map((slot, index) => {
    const def = slot.defId ? UNIT_BY_ID[slot.defId] : undefined
    return {
      slot: index + 1,
      unitId: slot.defId,
      name: def ? unitName(slot.defId ?? '', def.name) : '无可用资源',
      cost: def?.cost ?? 0,
      traits: (def?.traits ?? []).map(
        (trait) => traitLabel(trait, TRAIT_DEFS.find((item) => item.id === trait)?.label ?? trait),
      ),
      locked: slot.locked,
      soldOut: slot.sold || slot.defId === null,
      advice: def ? suggestedRow(def) : '中排',
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

  const { stage, index } = stageOf(state.round)
  const stageCount = Math.ceil(state.totalRounds / 5)
  const stageResults: StageResult[] = Array.from({ length: 5 }, (_, offset) => {
    const round = (stage - 1) * 5 + offset + 1
    const entry = state.log.find((item) => item.round === round)
    return {
      round,
      label: `${stage}-${offset + 1}`,
      won: round > state.totalRounds ? null : (entry?.won ?? null),
    }
  })

  const carousel: DraftCandidate[] = (state.carousel?.items ?? []).map((item) => {
    const def = UNIT_BY_ID[item.defId]
    return {
      id: item.id,
      defId: item.defId,
      name: def ? unitName(item.defId, def.name) : item.defId,
      cost: def?.cost ?? 1,
      traits: (def?.traits ?? []).map(
        (trait) => TRAIT_DEFS.find((entry) => entry.id === trait)?.label ?? trait,
      ),
      annotation: item.annotation ? ANNOTATION_LABEL[item.annotation] : null,
      angle: item.angle,
    }
  })

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
    placement: state.placement ?? null,
    matchPoints: state.matchPoints ?? null,
    aliveSeats: 1 + state.opponents.filter((seat) => seat.alive).length,
    tournament: state.tournament === true,
    record: state.record ?? { wins: 0, losses: 0, draws: 0 },
    standings: state.standings ?? [],
    reward: state.reward ?? null,
    scale: boardUnits(state).length,
    elapsed,
    phase: state.phase === 'END' ? 'TERMINATED' : state.phase === 'DRAFT' ? 'PREP' : state.phase,
    units,
    bench,
    benchCount: bench.length,
    benchCap: benchCap(state),
    popCap: populationCap(state),
    traits,
    shop,
    annotations,
    roster: state.opponents.map((opponent, index) => {
      const member = party[index + 1]
      const invited = member && !member.isAi ? member.nickname : ''
      return {
        id: opponent.id,
        label: invited === '' ? opponent.name : invited,
        sli: opponent.sli,
        alive: opponent.alive,
      }
    }),
    proposals,
    picks,
    achievement: Object.values(tiers).filter((tier) => tier > 0).length,
    battle: state.lastBattle,
    history: state.log,
    stage,
    stageRound: index,
    stageLabel: `${stage}-${index}`,
    stageCount,
    stageResults,
    carousel,
    over: state.phase === 'END',
  }
}

export const useDrillStore = defineStore('drill', () => {
  const mode = ref<DrillMode | null>(loadMode())
  const state = ref<GameState>(loadState(mode.value === 'tournament'))
  const elapsed = ref(0)
  const error = ref<string | null>(null)
  const paused = ref(false)

  const naming = useDrillNamingStore()
  const party = ref<PartySeat[]>(loadParty())

  const snapshot = computed(() =>
    project(state.value, elapsed.value, { unit: naming.unitMap, trait: naming.traitMap }, party.value),
  )

  function persistParty() {
    try {
      if (mode.value === null) localStorage.removeItem(MODE_KEY)
      else localStorage.setItem(MODE_KEY, mode.value)
      if (party.value.length === 0) localStorage.removeItem(PARTY_KEY)
      else localStorage.setItem(PARTY_KEY, JSON.stringify(party.value))
    } catch {
      // 存不下不影响演练
    }
  }

  function resetState(tournament: boolean, seed?: number) {
    state.value = createGame(seed ?? Date.now(), { tournament })
    elapsed.value = 0
    error.value = null
    lastTrace.value = null
    paused.value = false
    preview.value = null
  }

  function startSolo() {
    mode.value = 'solo'
    party.value = []
    persistParty()
    if (state.value.tournament) resetState(false)
  }

  function startParty(seats: PartySeat[]) {
    mode.value = 'party'
    party.value = seats
    persistParty()
    if (state.value.tournament) resetState(false)
  }

  /** 锦标赛专项：无血量、15 轮、按战绩排名，机器人教练补满 8 席。 */
  function startTournament() {
    mode.value = 'tournament'
    party.value = []
    persistParty()
    resetState(true)
  }

  /**
   * 联机房间开局：按服务端 seed 重开本地引擎。
   * 返回 false 表示本地已走到别的轮次，无法追赶服务端。
   */
  function adoptRoom(seed: number, tournament: boolean, round = 1): boolean {
    const same =
      state.value.seed === seed &&
      (state.value.tournament === true) === tournament &&
      state.value.round === round
    mode.value = tournament ? 'tournament' : 'party'
    party.value = []
    persistParty()
    if (same) return true
    if (round > 1) return false
    resetState(tournament, seed)
    return true
  }

  function resetMode() {
    mode.value = null
    party.value = []
    persistParty()
  }
  const elapsedLabel = computed(() => formatElapsed(elapsed.value))
  const rerollCost = computed(() => (state.value.freeRerolls > 0 ? 0 : 2))
  const levelUpCost = 4
  const isPrep = computed(() => state.value.phase === 'PREP')
  const lastBattle = computed(() => state.value.lastBattle)
const lastTrace = ref<BattleTrace | null>(null)

/* ---------- 本轮对阵（只用当前回合的数据） ---------- */

const matchups = ref<MatchupRow[]>([])
const preview = ref<{ trace: BattleTrace | null; battle: BattleReport | null } | null>(null)
const matchTraces = new Map<string, BattleTrace>()
const matchReports = new Map<string, BattleReport>()

function rebuildMatchups() {
  const current = state.value
  const battle = current.lastBattle
  // 打完一轮后 round 会先自增：此时面板展示刚打完的那一轮，否则展示即将开演的轮次
  const round = battle !== null && battle.round === current.round - 1 ? battle.round : current.round
  const played = battle !== null && battle.round === round
  const rows: MatchupRow[] = []
  matchTraces.clear()
  matchReports.clear()

  const playerAway = played
    ? (battle?.opponent ?? makeBotBoard(current.seed, round).name)
    : makeBotBoard(current.seed, round).name

  const playerId = `${round}-player`
  if (played && battle) {
    rows.push({
      id: playerId,
      round,
      home: '我方',
      away: playerAway,
      isPlayer: true,
      played: true,
      hasTrace: lastTrace.value !== null,
      resultLabel: battle.won ? '通过' : '未通过',
      detail: `${(battle.ticks / 10).toFixed(1)}s · 剩余 ${battle.survivors}`,
      tone: battle.won ? 'ok' : 'err',
    })
    if (lastTrace.value) {
      matchTraces.set(playerId, lastTrace.value)
      matchReports.set(playerId, battle)
    }
  } else {
    rows.push({
      id: playerId,
      round,
      home: '我方',
      away: playerAway,
      isPlayer: true,
      played: false,
      hasTrace: false,
      resultLabel: '待演',
      detail: '',
      tone: 'pending',
    })
  }

  const pool = current.opponents.filter((opponent) => opponent.alive)
  let pairIndex = 0
  for (let index = 0; index + 1 < pool.length; index += 2) {
    const home = pool[index]
    const away = pool[index + 1]
    if (!home || !away) break
    const id = `${round}-ai-${pairIndex}`
    pairIndex += 1

    if (!played) {
      rows.push({
        id,
        round,
        home: home.name,
        away: away.name,
        isPlayer: false,
        played: false,
        hasTrace: false,
        resultLabel: '待演',
        detail: '',
        tone: 'pending',
      })
      continue
    }

    const homeBoard = makeBotBoard(current.seed + index * 97 + 11, round)
    const awayBoard = makeBotBoard(current.seed + index * 97 + 53, round)
    const outcome = simulateBattle(homeBoard.units, awayBoard.units, EMPTY_MODS, EMPTY_MODS)
    const homeWon = outcome.winner === 'ally'

    rows.push({
      id,
      round,
      home: home.name,
      away: away.name,
      isPlayer: false,
      played: true,
      hasTrace: true,
      resultLabel: `${homeWon ? home.name : away.name} 胜`,
      detail: `${(outcome.ticks / 10).toFixed(1)}s`,
      tone: homeWon ? 'ok' : 'err',
    })

    matchTraces.set(id, outcome.trace)
    matchReports.set(id, {
      round,
      mode: 'PVP',
      won: homeWon,
      opponent: `${home.name} vs ${away.name}`,
      sliBefore: 100,
      sliAfter: homeWon ? 100 : 70,
      survivors: homeWon ? outcome.allyAlive : outcome.enemyAlive,
      ticks: outcome.ticks,
      curve: outcome.curve,
    })
  }

  matchups.value = rows
}

function openMatchup(id: string) {
  const trace = matchTraces.get(id) ?? null
  if (!trace) return false
  preview.value = { trace, battle: matchReports.get(id) ?? null }
  return true
}

function clearPreview() {
  preview.value = null
}

watch(
  () => [state.value.round, state.value.lastBattle, state.value.opponents] as const,
  () => rebuildMatchups(),
  { immediate: true, deep: false, flush: 'sync' },
)

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
  function unequip(uid: string, index: number) {
    return run({ type: 'UNEQUIP', uid, index })
  }

  function pickAugment(id: string) {
    return run({ type: 'PICK_AUGMENT', id })
  }

  function pickCarousel(itemId: string) {
    return run({ type: 'PICK_CAROUSEL', itemId })
  }

  function startBattle() {
    return run({ type: 'START_BATTLE' })
  }

  function restart() {
    state.value = createGame(Date.now(), { tournament: mode.value === 'tournament' })
    elapsed.value = 0
    error.value = null
    lastTrace.value = null
    paused.value = false
    preview.value = null
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
    mode,
    party,
    startSolo,
    startParty,
    startTournament,
    adoptRoom,
    resetMode,
    matchups,
    preview,
    openMatchup,
    clearPreview,
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
    unequip,
    pickAugment,
    pickCarousel,
    startBattle,
    restart,
  }
})
