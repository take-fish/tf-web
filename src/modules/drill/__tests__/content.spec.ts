import { describe, expect, it } from 'vitest'

import { computeMods, createGame } from '../core/engine'
import { POOL_COUNTS, SHOP_ODDS, TRAIT_DEFS, UNIT_DEFS } from '../core/content'
import type { GameState } from '../core/state'

function boardState(units: GameState['units']): GameState {
  return { ...createGame(7), units }
}

describe('内容表', () => {
  it('39 个实例，费用分布 9/9/9/6/6', () => {
    expect(UNIT_DEFS).toHaveLength(39)
    const byCost = new Map<number, number>()
    for (const def of UNIT_DEFS) byCost.set(def.cost, (byCost.get(def.cost) ?? 0) + 1)
    expect([1, 2, 3, 4, 5].map((cost) => byCost.get(cost))).toEqual([9, 9, 9, 6, 6])
    expect(new Set(UNIT_DEFS.map((def) => def.id)).size).toBe(39)
    expect(new Set(UNIT_DEFS.map((def) => def.name)).size).toBe(39)
  })

  it('每个实例至少 1 条羁绊且全部可解析', () => {
    const ids = new Set(TRAIT_DEFS.map((trait) => trait.id))
    for (const def of UNIT_DEFS) {
      expect(def.traits.length).toBeGreaterThan(0)
      for (const trait of def.traits) expect(ids.has(trait)).toBe(true)
    }
  })

  it('14 条亲和组，档位不超过成员数且从 2 起', () => {
    expect(TRAIT_DEFS).toHaveLength(14)
    for (const def of TRAIT_DEFS) {
      const members = UNIT_DEFS.filter((unit) => unit.traits.includes(def.id)).length
      expect(def.tiers.length).toBe(def.effects.length)
      expect(def.tiers[0]).toBeGreaterThanOrEqual(2)
      const ascending = def.tiers.every(
        (tier, index) => index === 0 || tier > (def.tiers[index - 1] ?? 0),
      )
      expect(ascending).toBe(true)
      for (const tier of def.tiers) expect(tier).toBeLessThanOrEqual(members)
    }
  })

  it('5 费里同一条羁绊最多出现 2 次', () => {
    const counts = new Map<string, number>()
    for (const def of UNIT_DEFS.filter((unit) => unit.cost === 5)) {
      for (const trait of def.traits) counts.set(trait, (counts.get(trait) ?? 0) + 1)
    }
    for (const [, count] of counts) expect(count).toBeLessThanOrEqual(2)
  })

  it('卡池与商店概率覆盖 1–5 费', () => {
    expect(POOL_COUNTS).toEqual({ 1: 22, 2: 18, 3: 15, 4: 12, 5: 9 })
    for (const row of Object.values(SHOP_ODDS)) {
      expect(row).toHaveLength(5)
      expect(row.reduce((sum, value) => sum + value, 0)).toBe(100)
    }
  })
})

describe('两个不吃部门的强度机制', () => {
  const base = boardState([])

  it('佳妹按已布注解数提升攻速与法强', () => {
    const empty = computeMods(boardState([]))
    const notes = computeMods(
      boardState([
        { uid: 'j', defId: 'jiamei', star: 1, zone: 'board', slot: 0, annotations: ['async', 'tx'] },
      ]),
    )
    expect(notes.as).toBeCloseTo(empty.as + 0.16, 5)
    expect(notes.ap).toBeCloseTo(empty.ap + 0.1, 5)
    expect(base.units).toHaveLength(0)
  })

  it('野露洁按已淘汰对照组数提升伤害', () => {
    const empty = computeMods(boardState([]))
    const state = boardState([
      { uid: 'y', defId: 'yelujie', star: 1, zone: 'board', slot: 0, annotations: [] },
    ])
    const wiped = computeMods({
      ...state,
      opponents: state.opponents.map((seat, index) =>
        index < 3 ? { ...seat, alive: false, eliminatedAt: 5 + index } : seat,
      ),
    })
    expect(empty.damageMul).toBe(1)
    expect(wiped.damageMul).toBeCloseTo(1.18, 5)
  })
})
