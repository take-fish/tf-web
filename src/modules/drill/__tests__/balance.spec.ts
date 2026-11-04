import { describe, expect, it } from 'vitest'

import { EMPTY_MODS, simulateBattle } from '../core/combat'
import { dispatch, computeUnitMods, createGame } from '../core/engine'
import { LINEUP_DEFS } from '../core/lineups'
import type { AnnotationKind, GameState, UnitInstance } from '../core/state'

function boardState(units: readonly UnitInstance[], picks: readonly string[] = []): GameState {
  return { ...createGame(7), units, picks, quotas: 10 }
}

function unit(
  uid: string,
  defId: string,
  slot: number,
  annotations: readonly AnnotationKind[] = [],
): UnitInstance {
  return { uid, defId, star: 1, zone: 'board', slot, annotations }
}

describe('平衡修正', () => {
  it('战斗羁绊只作用于该羁绊成员', () => {
    const state = boardState([
      unit('a', 'shunfengyao', 0),
      unit('b', 'hemadeng', 1),
      unit('c', 'dashixiong', 2),
      unit('d', 'kang', 3),
    ])
    const member = computeUnitMods(state, state.units[0]!)
    const outsider = computeUnitMods(state, state.units[3]!)
    expect(member.atk ?? 0).toBeCloseTo(0.15, 5)
    expect(outsider.atk ?? 0).toBe(0)
  })

  it('测试复活只作用于测试成员', () => {
    const state = boardState([unit('a', 'weijin', 0), unit('b', 'weidengnan', 1), unit('c', 'kang', 2)])
    expect(computeUnitMods(state, state.units[0]!).reviveRatio).toBeCloseTo(0.35, 5)
    expect(computeUnitMods(state, state.units[2]!).reviveRatio).toBe(0)
  })

  it('G4 每场只复活第一个阵亡单位', () => {
    const outcome = simulateBattle(
      [
        { uid: 'a', defId: 'shunfengyao', star: 1, col: 0, row: 2, annotations: [] },
        { uid: 'b', defId: 'shunfengyao', star: 1, col: 1, row: 2, annotations: [] },
      ],
      [{ uid: 'e', defId: 'yelujie', star: 3, col: 0, row: 2, annotations: [] }],
      { ...EMPTY_MODS, reviveOne: true },
      { ...EMPTY_MODS },
    )
    const revives = outcome.trace.events.filter((event) => event.kind === 'revive')
    expect(revives.length).toBe(1)
  })

  it('三星五费强于三星四费', () => {
    const outcome = simulateBattle(
      [{ uid: 'a', defId: 'yelujie', star: 3, col: 0, row: 2, annotations: [] }],
      [{ uid: 'e', defId: 'xuejie', star: 3, col: 0, row: 2, annotations: [] }],
      { ...EMPTY_MODS },
      { ...EMPTY_MODS },
    )
    expect(outcome.winner).toBe('ally')
  })

  it('推荐阵容为 10 套且每套装备合法', () => {
    expect(LINEUP_DEFS).toHaveLength(10)
    for (const lineup of LINEUP_DEFS) {
      const ids = new Set(lineup.units.map((entry) => entry.defId))
      expect(ids.size).toBe(lineup.units.length)
      for (const equip of lineup.equip) expect(ids.has(equip.defId)).toBe(true)
    }
  })

  it('S7 第一次拆卸免费，第二次扣 2 配额', () => {
    const state = boardState([unit('a', 'xuejie', 0, ['async', 'cache'])], ['S7'])
    const first = dispatch(state, { type: 'UNEQUIP', uid: 'a', index: 0 })
    expect(first.state.quotas).toBe(10)
    const second = dispatch(first.state, { type: 'UNEQUIP', uid: 'a', index: 0 })
    expect(second.state.quotas).toBe(8)
  })

  it('S3 在 PVE 轮结束后补 1 个元注解', () => {
    const state = { ...boardState([unit('a', 'shunfengyao', 0)], ['S3']), round: 2 }
    const before = state.annotations.filter((item) => item.kind !== null).length
    const result = dispatch(state, { type: 'START_BATTLE' })
    const after = result.state.annotations.filter((item) => item.kind !== null).length
    expect(after).toBe(before + 1)
  })
})
