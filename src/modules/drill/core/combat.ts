import { UNIT_BY_ID } from './content'
import type { UnitDef } from './content'
import { BOARD_COLS, BOARD_ROWS, starMult } from './state'
import type { AnnotationKind } from './state'

export interface Mods {
  atk: number
  as: number
  ap: number
  armor: number
  mr: number
  hp: number
  onHitFlat: number
  executeBonus: number
  reviveRatio: number
  deathAoe: number
  damageMul: number
  takenMul: number
  aoeTakenMul: number
  earlyAs: number
  earlyAsSeconds: number
  earlyDamage: number
  earlyDamageSeconds: number
  lateRegen: number
  enemyAsDebuff: number
  enemyAsDebuffSeconds: number
  reviveOne: boolean
}

export const EMPTY_MODS: Mods = {
  atk: 0,
  as: 0,
  ap: 0,
  armor: 0,
  mr: 0,
  hp: 0,
  onHitFlat: 0,
  executeBonus: 0,
  reviveRatio: 0,
  deathAoe: 0,
  damageMul: 1,
  takenMul: 1,
  aoeTakenMul: 1,
  earlyAs: 0,
  earlyAsSeconds: 0,
  earlyDamage: 0,
  earlyDamageSeconds: 0,
  lateRegen: 0,
  enemyAsDebuff: 0,
  enemyAsDebuffSeconds: 0,
  reviveOne: false,
}

export interface FighterInput {
  uid: string
  defId: string
  star: 1 | 2 | 3
  col: number
  row: number
  annotations: readonly AnnotationKind[]
}

interface Fighter {
  uid: string
  def: UnitDef
  star: 1 | 2 | 3
  side: 'ally' | 'enemy'
  col: number
  row: number
  hp: number
  maxHp: number
  atk: number
  ap: number
  as: number
  armor: number
  mr: number
  mana: number
  alive: boolean
  attackCd: number
  revived: boolean
  buffs: { atk: number; ap: number; as: number; armor: number; mr: number; until: number }[]
}

export interface BattleOutcome {
  winner: 'ally' | 'enemy' | 'draw'
  allyAlive: number
  enemyAlive: number
  ticks: number
  /** 每秒己方总生命占比 */
  curve: number[]
  /** 回放用的快照与事件，仅调试/回放使用，不进存档 */
  trace: BattleTrace
}

export interface TraceUnit {
  uid: string
  name: string
  side: 'ally' | 'enemy'
  defId: string
  star: 1 | 2 | 3
  col: number
  row: number
  maxHp: number
}

export interface TraceFrame {
  t: number
  units: { uid: string; col: number; row: number; hp: number; alive: boolean }[]
}

export interface TraceEvent {
  t: number
  kind: 'hit' | 'skill' | 'down' | 'revive'
  uid: string
  targetId?: string
  amount?: number
  hp?: number
  text?: string
}

export interface BattleTrace {
  units: TraceUnit[]
  frames: TraceFrame[]
  events: TraceEvent[]
  duration: number
}

const DT = 0.1
const MAX_TICKS = 200
/** 战场横向扩成两侧：左半己方 0..6，右半对手 7..13。 */
export const BATTLE_COLS = BOARD_COLS * 2
const MAX_EVENTS = 1500

/** 回放录制器：模块级单例，simulateBattle 进入时挂上、退出时摘掉。 */
let recorder: ((event: TraceEvent) => void) | null = null
let attacker = ''
let clock = 0

function axial(col: number, row: number): { q: number; r: number } {
  return { q: col, r: row - (col - (col & 1)) / 2 }
}

function hexDistance(a: { col: number; row: number }, b: { col: number; row: number }): number {
  const p = axial(a.col, a.row)
  const q = axial(b.col, b.row)
  const dq = p.q - q.q
  const dr = p.r - q.r
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

function neighbors(col: number, row: number): { col: number; row: number }[] {
  const deltas =
    col % 2 === 0
      ? [
          [0, -1],
          [1, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
          [-1, -1],
        ]
      : [
          [0, -1],
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
        ]
  const result: { col: number; row: number }[] = []
  for (const delta of deltas) {
    const nextCol = col + (delta[0] ?? 0)
    const nextRow = row + (delta[1] ?? 0)
    if (nextCol < 0 || nextCol >= BATTLE_COLS || nextRow < 0 || nextRow >= BOARD_ROWS) continue
    result.push({ col: nextCol, row: nextRow })
  }
  return result
}

function buildFighter(input: FighterInput, side: 'ally' | 'enemy', mods: Mods): Fighter {
  const def = UNIT_BY_ID[input.defId]
  if (!def) throw new Error(`unknown unit ${input.defId}`)
  const scale = starMult(input.star, def.cost)
  const annotationAs = input.annotations.filter((kind) => kind === 'async').length * 0.15
  const annotationArmor = input.annotations.filter((kind) => kind === 'tx').length * 10
  const manaStart = input.annotations.filter((kind) => kind === 'cache').length * 20
  const maxHp = Math.round(def.hp * scale * (1 + mods.hp))
  return {
    uid: input.uid,
    def,
    star: input.star,
    side,
    col: input.col,
    row: input.row,
    hp: maxHp,
    maxHp,
    atk: def.atk * scale * (1 + mods.atk),
    ap: def.ap * scale * (1 + mods.ap),
    as: def.as * (1 + mods.as + annotationAs),
    armor: def.armor + mods.armor + annotationArmor,
    mr: def.mr + mods.mr,
    mana: Math.min(100, manaStart),
    alive: true,
    attackCd: 0,
    revived: false,
    buffs: [],
  }
}

function effective(fighter: Fighter, key: 'atk' | 'ap' | 'as' | 'armor' | 'mr', elapsed: number): number {
  let value = fighter[key]
  for (const buff of fighter.buffs) {
    if (buff.until < elapsed) continue
    value += buff[key]
  }
  return value
}

function living(fighters: Fighter[], side: 'ally' | 'enemy'): Fighter[] {
  return fighters.filter((fighter) => fighter.alive && fighter.side === side)
}

/** 法系远程（射线/范围）站位输出，近战需要贴身。 */
function attackRange(fighter: Fighter): number {
  return fighter.def.skill.stat === 'ap' ? 3 : 1
}

function nearest(from: Fighter, pool: Fighter[]): Fighter | null {
  let best: Fighter | null = null
  let bestDistance = 99
  for (const candidate of pool) {
    const distance = hexDistance(from, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function takeDamage(fighter: Fighter, raw: number, kind: 'phys' | 'magic' | 'true', mods: Mods): number {
  let amount = raw
  if (kind === 'phys') amount *= 100 / (100 + fighter.armor)
  if (kind === 'magic') amount *= 100 / (100 + fighter.mr)
  amount *= mods.takenMul
  fighter.hp -= amount
  fighter.mana = Math.min(100, fighter.mana + Math.min(15, amount / 12))
  if (fighter.hp <= 0) fighter.hp = 0
  recorder?.({
    t: clock,
    kind: 'hit',
    uid: attacker,
    targetId: fighter.uid,
    amount: Math.round(amount),
    hp: Math.round(fighter.hp),
  })
  return amount
}

export function simulateBattle(
  allies: readonly FighterInput[],
  enemies: readonly FighterInput[],
  allyMods: Mods,
  enemyMods: Mods,
): BattleOutcome {
  const fighters: Fighter[] = [
    ...allies.map((input) => buildFighter(input, 'ally', allyMods)),
    // 对手镜像到右半场，避免两侧单位叠在同一格上
    ...enemies.map((input) =>
      buildFighter({ ...input, col: BATTLE_COLS - 1 - input.col }, 'enemy', enemyMods),
    ),
  ]
  const occupied = new Set<string>(fighters.map((fighter) => `${fighter.col},${fighter.row}`))
  const curve: number[] = []
  const units: TraceUnit[] = fighters.map((fighter) => ({
    uid: fighter.uid,
    name: fighter.def.name,
    side: fighter.side,
    defId: fighter.def.id,
    star: fighter.star,
    col: fighter.col,
    row: fighter.row,
    maxHp: fighter.maxHp,
  }))
  const events: TraceEvent[] = []
  const frames: TraceFrame[] = []
  recorder = (event) => {
    if (events.length < MAX_EVENTS) events.push(event)
  }
  const allyMaxHp = allies.reduce((sum, input) => {
    const def = UNIT_BY_ID[input.defId]
    return sum + (def ? def.hp * starMult(input.star, def.cost) * (1 + allyMods.hp) : 0)
  }, 0)

  let ticks = 0
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    ticks = tick + 1
    const elapsed = ticks * DT
    clock = elapsed
    const aliveAllies = living(fighters, 'ally')
    const aliveEnemies = living(fighters, 'enemy')
    if (aliveAllies.length === 0 || aliveEnemies.length === 0) break

    const order = fighters
      .filter((fighter) => fighter.alive)
      .slice()
      .sort((a, b) => (a.uid < b.uid ? -1 : 1))

    for (const fighter of order) {
      const opponentPool = living(fighters, fighter.side === 'ally' ? 'enemy' : 'ally')
      if (opponentPool.length === 0) break
      const target = nearest(fighter, opponentPool)
      if (!target) continue

      const distance = hexDistance(fighter, target)
      const reach = attackRange(fighter)
      if (distance > reach) {
        // 移动是匀速的：0.25s 一格，避免远程单位原地罚站
        fighter.attackCd += DT * 4
        if (fighter.attackCd >= 1) {
          fighter.attackCd = 0
          const options = neighbors(fighter.col, fighter.row)
            .filter((cell) => !occupied.has(`${cell.col},${cell.row}`))
            .sort((a, b) => hexDistance(a, target) - hexDistance(b, target))
          const step = options[0]
          if (step && hexDistance(step, target) < distance) {
            occupied.delete(`${fighter.col},${fighter.row}`)
            fighter.col = step.col
            fighter.row = step.row
            occupied.add(`${fighter.col},${fighter.row}`)
          }
        }
        continue
      }

      fighter.attackCd += effective(fighter, 'as', elapsed) * DT
      if (fighter.attackCd < 1) continue
      fighter.attackCd = 0
      attacker = fighter.uid

      const ownMods = fighter.side === 'ally' ? allyMods : enemyMods
      const earlyMul = elapsed <= ownMods.earlyDamageSeconds ? 1 + ownMods.earlyDamage : 1
      const execute = target.hp / target.maxHp < 0.4 ? 1 + ownMods.executeBonus : 1
      const damage = effective(fighter, 'atk', elapsed) * 100 / (100 + target.armor) * earlyMul * execute * ownMods.damageMul
      takeDamage(target, damage, 'phys', ownMods)
      fighter.mana = Math.min(100, fighter.mana + 10)

      if (ownMods.onHitFlat > 0 && target.alive) {
        takeDamage(target, ownMods.onHitFlat, 'magic', ownMods)
      }

      if (fighter.mana >= 100) {
        fighter.mana = 0
        castSkill(fighter, target, fighters, ownMods, elapsed)
      }

      if (!target.alive) {
        handleDeath(target, fighters, elapsed, ownMods)
      }
    }

    const allyHp = living(fighters, 'ally').reduce((sum, fighter) => sum + fighter.hp, 0)
    curve.push(allyMaxHp > 0 ? allyHp / allyMaxHp : 0)
    frames.push({
      t: elapsed,
      units: fighters.map((fighter) => ({
        uid: fighter.uid,
        col: fighter.col,
        row: fighter.row,
        hp: Math.round(fighter.hp),
        alive: fighter.alive,
      })),
    })
  }

  const allyAlive = living(fighters, 'ally').length
  const enemyAlive = living(fighters, 'enemy').length
  const winner: BattleOutcome['winner'] =
    allyAlive > 0 && enemyAlive === 0
      ? 'ally'
      : enemyAlive > 0 && allyAlive === 0
        ? 'enemy'
        : allyAlive === 0 && enemyAlive === 0
          ? 'draw'
          : allyAlive >= enemyAlive
            ? 'ally'
            : 'enemy'

  recorder = null
  return {
    winner,
    allyAlive,
    enemyAlive,
    ticks,
    curve,
    trace: { units, frames, events, duration: ticks * DT },
  }
}

function handleDeath(fighter: Fighter, fighters: Fighter[], elapsed: number, mods: Mods): void {
  const reviveRatio = mods.reviveOne ? 0.4 : mods.reviveRatio
  if (reviveRatio > 0 && !fighter.revived) {
    fighter.revived = true
    fighter.alive = true
    fighter.hp = Math.round(fighter.maxHp * reviveRatio)
    fighter.mana = 0
    recorder?.({ t: clock, kind: 'revive', uid: fighter.uid, hp: fighter.hp })
    return
  }

  fighter.alive = false
  recorder?.({ t: clock, kind: 'down', uid: fighter.uid })
  if (mods.deathAoe > 0) {
    const enemySide = fighter.side === 'ally' ? 'enemy' : 'ally'
    for (const enemy of fighters) {
      if (!enemy.alive || enemy.side !== enemySide) continue
      if (hexDistance(fighter, enemy) > 2) continue
      enemy.hp = Math.max(0, enemy.hp - mods.deathAoe)
      if (enemy.hp === 0) enemy.alive = false
    }
  }
  void elapsed
}

function castSkill(
  caster: Fighter,
  primary: Fighter,
  fighters: Fighter[],
  mods: Mods,
  elapsed: number,
): void {
  const skill = caster.def.skill
  attacker = caster.uid
  recorder?.({
    t: clock,
    kind: 'skill',
    uid: caster.uid,
    targetId: primary.uid,
    text: skill.name,
  })
  const scale = starMult(caster.star, caster.def.cost)
  const statValue = skill.stat === 'atk' ? effective(caster, 'atk', elapsed) : effective(caster, 'ap', elapsed)
  const base = skill.base * scale + skill.coef * statValue
  const enemyPool = living(fighters, caster.side === 'ally' ? 'enemy' : 'ally')
  const allyPool = living(fighters, caster.side === 'ally' ? 'ally' : 'enemy')
  if (enemyPool.length === 0) return

  const form = skill.form
  if (form === 'single') {
    const target = pickTarget(skill.target, caster, enemyPool) ?? primary
    takeDamage(target, base, 'magic', mods)
    if (!target.alive) target.alive = false
    return
  }

  if (form === 'aoe') {
    const center = pickTarget(skill.target, caster, enemyPool) ?? primary
    const radius = Math.max(1, skill.radius)
    for (const enemy of enemyPool) {
      if (hexDistance(center, enemy) > radius) continue
      takeDamage(enemy, base * mods.aoeTakenMul, 'magic', mods)
    }
    return
  }

  if (form === 'line') {
    const sorted = enemyPool
      .slice()
      .sort((a, b) => hexDistance(caster, a) - hexDistance(caster, b))
      .slice(0, 3)
    for (const enemy of sorted) takeDamage(enemy, base, 'magic', mods)
    return
  }

  if (form === 'buff') {
    const ratio = skill.base / 100
    const targets = skill.target === 'self' ? [caster] : allyPool
    for (const ally of targets) {
      ally.buffs.push({
        atk: caster.atk * ratio * 0.5,
        ap: caster.ap * ratio * 0.5,
        as: 0,
        armor: 0,
        mr: 0,
        until: elapsed + Math.max(3, skill.duration),
      })
    }
    return
  }

  const targets =
    skill.target === 'team' ? allyPool : [allyPool.slice().sort((a, b) => a.hp - b.hp)[0] ?? caster]
  const heal = skill.coef > 0 ? base + skill.coef * caster.maxHp : base
  for (const ally of targets) {
    ally.hp = Math.min(ally.maxHp, ally.hp + heal)
  }
}

function pickTarget(
  target: 'nearest' | 'lowest' | 'highest' | 'self' | 'team',
  caster: Fighter,
  pool: Fighter[],
): Fighter | null {
  if (pool.length === 0) return null
  if (target === 'lowest') return pool.slice().sort((a, b) => a.hp - b.hp)[0] ?? null
  if (target === 'highest') return pool.slice().sort((a, b) => b.atk - a.atk)[0] ?? null
  return nearest(caster, pool)
}
