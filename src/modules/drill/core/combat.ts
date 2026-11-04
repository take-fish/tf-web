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
  /** 只作用于该实例的羁绊修正；与全队 Mods 相加/相乘后使用 */
  mods?: Partial<Mods>
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
  /** 连续多少帧没有移动也没有攻击：用来兜底卡位（被围死时直接开打） */
  stuckTicks: number
  revived: boolean
  /** @Retry：该实例是否已用掉装备复活 */
  retryUsed: boolean
  buffs: { atk: number; ap: number; as: number; armor: number; mr: number; until: number }[]
  role: UnitRole
  annotations: readonly AnnotationKind[]
  /** 全队修正 + 本实例羁绊修正 */
  mods: Mods
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
  role: UnitRole
  annotations: readonly AnnotationKind[]
}

export interface TraceFrame {
  t: number
  units: { uid: string; col: number; row: number; hp: number; mana: number; alive: boolean }[]
}

export interface TraceEvent {
  t: number
  kind: 'hit' | 'skill' | 'down' | 'revive' | 'surge'
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

export type UnitRole = 'melee' | 'ranged' | 'mage' | 'tank'

function roleOf(def: UnitDef): UnitRole {
  const skill = def.skill
  if (skill.form === 'sustain') return 'tank'
  if (skill.stat === 'ap') return skill.form === 'aoe' || skill.form === 'line' ? 'mage' : 'ranged'
  return 'melee'
}

const DT = 0.1
/** 单场上限 45 秒；15 / 30 秒各来一次数值膨胀，到点按人数判胜负。 */
export const MAX_TICKS = 450
export const BATTLE_SECONDS = MAX_TICKS * DT
/** 数值膨胀的时间点与幅度：攻击/法强 +30%，生命 +12%。 */
export const SURGE_TIMES: readonly number[] = [15, 30]
export const SURGE_ATK = 0.6
export const SURGE_HP = 0.2
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

/** 把“只作用于该实例”的羁绊修正合并到全队修正上。 */
export function mergeMods(base: Mods, extra?: Partial<Mods>): Mods {
  if (!extra) return base
  return {
    atk: base.atk + (extra.atk ?? 0),
    as: base.as + (extra.as ?? 0),
    ap: base.ap + (extra.ap ?? 0),
    armor: base.armor + (extra.armor ?? 0),
    mr: base.mr + (extra.mr ?? 0),
    hp: base.hp + (extra.hp ?? 0),
    onHitFlat: base.onHitFlat + (extra.onHitFlat ?? 0),
    executeBonus: base.executeBonus + (extra.executeBonus ?? 0),
    reviveRatio: Math.max(base.reviveRatio, extra.reviveRatio ?? 0),
    deathAoe: Math.max(base.deathAoe, extra.deathAoe ?? 0),
    damageMul: base.damageMul * (extra.damageMul ?? 1),
    takenMul: base.takenMul * (extra.takenMul ?? 1),
    aoeTakenMul: base.aoeTakenMul * (extra.aoeTakenMul ?? 1),
    earlyAs: base.earlyAs + (extra.earlyAs ?? 0),
    earlyAsSeconds: Math.max(base.earlyAsSeconds, extra.earlyAsSeconds ?? 0),
    earlyDamage: base.earlyDamage + (extra.earlyDamage ?? 0),
    earlyDamageSeconds: Math.max(base.earlyDamageSeconds, extra.earlyDamageSeconds ?? 0),
    lateRegen: base.lateRegen + (extra.lateRegen ?? 0),
    enemyAsDebuff: base.enemyAsDebuff + (extra.enemyAsDebuff ?? 0),
    enemyAsDebuffSeconds: Math.max(base.enemyAsDebuffSeconds, extra.enemyAsDebuffSeconds ?? 0),
    reviveOne: base.reviveOne || extra.reviveOne === true,
  }
}

function buildFighter(input: FighterInput, side: 'ally' | 'enemy', teamMods: Mods): Fighter {
  const def = UNIT_BY_ID[input.defId]
  if (!def) throw new Error(`unknown unit ${input.defId}`)
  const mods = mergeMods(teamMods, input.mods)
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
    stuckTicks: 0,
    revived: false,
    retryUsed: false,
    buffs: [],
    role: roleOf(def),
    annotations: input.annotations,
    mods,
  }
}

function effective(fighter: Fighter, key: 'atk' | 'ap' | 'as' | 'armor' | 'mr', elapsed: number): number {
  let value = fighter[key]
  if (key === 'as') {
    if (fighter.mods.earlyAs > 0 && elapsed <= fighter.mods.earlyAsSeconds) {
      value += fighter.mods.earlyAs
    }
    if (fighter.mods.enemyAsDebuff > 0 && elapsed <= fighter.mods.enemyAsDebuffSeconds) {
      value -= fighter.mods.enemyAsDebuff
    }
  }
  for (const buff of fighter.buffs) {
    if (buff.until < elapsed) continue
    value += buff[key]
  }
  return Math.max(0.1, value)
}

function applySurge(fighters: Fighter[]): void {
  for (const fighter of fighters) {
    if (!fighter.alive) continue
    fighter.atk *= 1 + SURGE_ATK
    fighter.ap *= 1 + SURGE_ATK
    fighter.maxHp = Math.round(fighter.maxHp * (1 + SURGE_HP))
    fighter.hp = Math.min(fighter.maxHp, fighter.hp * (1 + SURGE_HP))
  }
}

function living(fighters: Fighter[], side: 'ally' | 'enemy'): Fighter[] {
  return fighters.filter((fighter) => fighter.alive && fighter.side === side)
}

/** 法系远程（射线/范围）站位输出，近战需要贴身。 */
function attackRange(fighter: Fighter): number {
  if (fighter.role === 'tank') return 1
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

/** 以“施法者 → 最近目标”为射线，命中同一方向上的前 3 个敌人（真直线，而不是最近 3 个）。 */
function lineTargets(caster: Fighter, pool: Fighter[]): Fighter[] {
  const primary = nearest(caster, pool)
  if (!primary) return []
  const origin = axial(caster.col, caster.row)
  const target = axial(primary.col, primary.row)
  const ox = Math.sqrt(3) * (origin.q + origin.r / 2)
  const oy = 1.5 * origin.r
  const tx = Math.sqrt(3) * (target.q + target.r / 2)
  const ty = 1.5 * target.r
  const dx = tx - ox
  const dy = ty - oy
  const length = Math.hypot(dx, dy)
  if (length < 0.001) return [primary]
  const ux = dx / length
  const uy = dy / length
  return pool
    .map((enemy) => {
      const point = axial(enemy.col, enemy.row)
      const ex = Math.sqrt(3) * (point.q + point.r / 2) - ox
      const ey = 1.5 * point.r - oy
      const forward = ex * ux + ey * uy
      const lateral = Math.abs(ex * uy - ey * ux)
      return { enemy, forward, lateral }
    })
    .filter((item) => item.forward > 0 && item.lateral <= 1.5)
    .sort((a, b) => a.forward - b.forward || (a.enemy === primary ? -1 : b.enemy === primary ? 1 : 0))
    .slice(0, 3)
    .map((item) => item.enemy)
}

function takeDamage(
  fighter: Fighter,
  raw: number,
  kind: 'phys' | 'magic' | 'true',
  options: { aoe?: boolean } = {},
): number {
  let amount = raw
  if (kind === 'phys') amount *= 100 / (100 + effective(fighter, 'armor', clock))
  if (kind === 'magic') amount *= 100 / (100 + effective(fighter, 'mr', clock))
  // 受伤/范围减伤属于“受击方”，不能挂在攻击方身上
  amount *= fighter.mods.takenMul
  if (options.aoe) amount *= fighter.mods.aoeTakenMul
  fighter.hp -= amount
  fighter.mana = Math.min(100, fighter.mana + Math.min(15, amount / 120))
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
    role: fighter.role,
    annotations: fighter.annotations,
  }))
  const events: TraceEvent[] = []
  const frames: TraceFrame[] = []
  recorder = (event) => {
    if (events.length < MAX_EVENTS) events.push(event)
  }
  const allyMaxHp = allies.reduce((sum, input) => {
    const def = UNIT_BY_ID[input.defId]
    if (!def) return sum
    const mods = mergeMods(allyMods, input.mods)
    return sum + def.hp * starMult(input.star, def.cost) * (1 + mods.hp)
  }, 0)

  const reviveUsed = { ally: false, enemy: false }
  let ticks = 0
  let surgeIndex = 0
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    ticks = tick + 1
    const elapsed = ticks * DT
    clock = elapsed

    // 15 / 30 秒各来一次等比例膨胀，让后期对局加速收束
    if (surgeIndex < SURGE_TIMES.length && elapsed >= (SURGE_TIMES[surgeIndex] ?? Infinity)) {
      applySurge(fighters)
      recorder?.({
        t: elapsed,
        kind: 'surge',
        uid: '',
        text: `数值膨胀 ${surgeIndex + 1} · 全员攻击/法强 +${Math.round(SURGE_ATK * 100)}%`,
      })
      surgeIndex += 1
    }
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
        let moved = false
        if (fighter.attackCd >= 1) {
          fighter.attackCd = 0
          const options = neighbors(fighter.col, fighter.row).filter(
            (cell) => !occupied.has(`${cell.col},${cell.row}`),
          )
          const forward = options
            .filter((cell) => hexDistance(cell, target) < distance)
            .sort((a, b) => hexDistance(a, target) - hexDistance(b, target))
          // 前方被占时允许横向绕行，避免贴身堵死
          const lateral = options
            .filter((cell) => hexDistance(cell, target) === distance)
            .sort((a, b) => hexDistance(a, target) - hexDistance(b, target))
          const step = forward[0] ?? lateral[0]
          if (step) {
            occupied.delete(`${fighter.col},${fighter.row}`)
            fighter.col = step.col
            fighter.row = step.row
            occupied.add(`${fighter.col},${fighter.row}`)
            moved = true
          }
        }
        if (moved) {
          fighter.stuckTicks = 0
        } else {
          fighter.stuckTicks += 1
        }
        // 兜底：被完全堵住 3 秒后直接开打，避免整场「打着打着不动了」
        if (fighter.stuckTicks < 30) continue
      } else {
        fighter.stuckTicks = 0
      }

      fighter.attackCd += effective(fighter, 'as', elapsed) * DT
      if (fighter.attackCd < 1) continue
      fighter.attackCd = 0
      attacker = fighter.uid

      const ownMods = fighter.mods
      const earlyMul = elapsed <= ownMods.earlyDamageSeconds ? 1 + ownMods.earlyDamage : 1
      const execute = target.hp / target.maxHp < 0.4 ? 1 + ownMods.executeBonus : 1
      // 护甲在 takeDamage 内统一计算，避免普攻/技能各乘一次
      const damage = effective(fighter, 'atk', elapsed) * earlyMul * execute * ownMods.damageMul
      takeDamage(target, damage, 'phys')
      fighter.mana = Math.min(100, fighter.mana + 10)

      if (ownMods.onHitFlat > 0 && target.alive) {
        takeDamage(target, ownMods.onHitFlat, 'magic')
      }

      if (fighter.mana >= 100) {
        fighter.mana = 0
        castSkill(fighter, target, fighters, ownMods, elapsed)
      }

    }

    // X7：12 秒后全队每秒回复 2.5% 最大生命
    for (const fighter of fighters) {
      if (!fighter.alive || elapsed < 12 || fighter.mods.lateRegen <= 0) continue
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + fighter.maxHp * fighter.mods.lateRegen * DT)
    }

    // 伤害来源可能是普攻 / 技能 / 死亡溅射，统一在回合末尾结算阵亡
    for (const fighter of fighters) {
      if (!fighter.alive || fighter.hp > 0) continue
      handleDeath(fighter, fighters, elapsed, fighter.mods, reviveUsed)
    }
    // 尸体不再占格子，否则存活单位会被卡住、打着打着就不动了；复活则重新占位
    for (const fighter of fighters) {
      const key = `${fighter.col},${fighter.row}`
      if (fighter.alive) occupied.add(key)
      else occupied.delete(key)
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
        mana: Math.round(fighter.mana),
        alive: fighter.alive,
      })),
    })
  }

  const allyAlive = living(fighters, 'ally').length
  const enemyAlive = living(fighters, 'enemy').length
  const timedOut = ticks >= MAX_TICKS && allyAlive > 0 && enemyAlive > 0
  if (timedOut) {
    recorder?.({
      t: ticks * DT,
      kind: 'surge',
      uid: '',
      text: `45 秒到点 · 按剩余人数判定（${allyAlive} : ${enemyAlive}）`,
    })
  }
  const winner: BattleOutcome['winner'] =
    allyAlive > 0 && enemyAlive === 0
      ? 'ally'
      : enemyAlive > 0 && allyAlive === 0
        ? 'enemy'
        : allyAlive === 0 && enemyAlive === 0
          ? 'draw'
          : allyAlive > enemyAlive
            ? 'ally'
            : enemyAlive > allyAlive
              ? 'enemy'
              : 'draw'

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

function handleDeath(
  fighter: Fighter,
  fighters: Fighter[],
  elapsed: number,
  mods: Mods,
  reviveUsed: { ally: boolean; enemy: boolean },
): void {
  // G4：每方每场只复活第一个阵亡单位，而不是全队
  if (mods.reviveOne && !reviveUsed[fighter.side]) {
    reviveUsed[fighter.side] = true
    fighter.revived = true
    fighter.alive = true
    fighter.hp = Math.round(fighter.maxHp * 0.4)
    fighter.mana = 0
    recorder?.({ t: clock, kind: 'revive', uid: fighter.uid, hp: fighter.hp })
    return
  }

  // 测试 2 件套只作用于测试成员（该实例的 mods 才带 reviveRatio）
  if (mods.reviveRatio > 0 && !fighter.revived) {
    fighter.revived = true
    fighter.alive = true
    fighter.hp = Math.round(fighter.maxHp * mods.reviveRatio)
    fighter.mana = 0
    recorder?.({ t: clock, kind: 'revive', uid: fighter.uid, hp: fighter.hp })
    return
  }

  // @Retry：装备复活，每件实例每场一次（25% 生命）
  if (!fighter.revived && fighter.annotations.includes('retry') && !fighter.retryUsed) {
    fighter.retryUsed = true
    fighter.revived = true
    fighter.alive = true
    fighter.hp = Math.round(fighter.maxHp * 0.25)
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
  const rawBase = skill.base * scale + skill.coef * statValue
  const earlyMul = elapsed <= mods.earlyDamageSeconds ? 1 + mods.earlyDamage : 1
  const base = rawBase * mods.damageMul
  const enemyPool = living(fighters, caster.side === 'ally' ? 'enemy' : 'ally')
  const allyPool = living(fighters, caster.side === 'ally' ? 'ally' : 'enemy')
  if (enemyPool.length === 0) return

  const hit = (target: Fighter, amount: number, aoe = false): number => {
    const execute = target.hp / target.maxHp < 0.4 ? 1 + mods.executeBonus : 1
    return takeDamage(target, amount * earlyMul * execute, 'magic', { aoe })
  }

  const form = skill.form
  if (form === 'single') {
    const target = pickTarget(skill.target, caster, enemyPool) ?? primary
    hit(target, base)
    return
  }

  if (form === 'aoe') {
    const center = pickTarget(skill.target, caster, enemyPool) ?? primary
    const radius = Math.max(1, skill.radius)
    for (const enemy of enemyPool) {
      if (hexDistance(center, enemy) > radius) continue
      // G8 是“受到 AOE 伤害降低”，由受击方在 takeDamage 中处理
      hit(enemy, base, true)
    }
    return
  }

  if (form === 'line') {
    for (const enemy of lineTargets(caster, enemyPool)) hit(enemy, base)
    return
  }

  if (form === 'buff') {
    const ratio = skill.base / 100
    const stats = skill.buffStats ?? ['atk', 'ap']
    const targets = skill.target === 'self' ? [caster] : allyPool
    for (const ally of targets) {
      const buff = {
        atk: 0,
        ap: 0,
        as: 0,
        armor: 0,
        mr: 0,
        until: elapsed + Math.max(3, skill.duration),
      }
      for (const stat of stats) {
        if (stat === 'atk') buff.atk = effective(caster, 'atk', elapsed) * ratio
        else if (stat === 'ap') buff.ap = effective(caster, 'ap', elapsed) * ratio
        else if (stat === 'as') buff.as = ratio
        // 护甲/魔抗按技能基础值给固定值，符合“地基加固/扩容”的文案
        else if (stat === 'armor') buff.armor = skill.base
        else if (stat === 'mr') buff.mr = skill.base
      }
      ally.buffs.push(buff)
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
