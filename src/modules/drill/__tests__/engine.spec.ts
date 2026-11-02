import { describe, expect, it } from 'vitest'

import { simulateBattle } from '../core/combat'
import { EMPTY_MODS } from '../core/combat'
import { UNIT_BY_ID } from '../core/content'
import { createGame, dispatch } from '../core/engine'
import type { Command } from '../core/engine'
import { activeTiers, traitCounts } from '../core/state'
import type { GameState } from '../core/state'

function apply(state: GameState, command: Command): GameState {
  return dispatch(state, command).state
}

describe('drill engine', () => {
  it('同种子生成同一份资源目录', () => {
    const a = createGame(20261102)
    const b = createGame(20261102)
    expect(a.shop).toEqual(b.shop)
    expect(a.level).toBe(3)
    expect(a.sli).toBe(100)
  })

  it('三合一：同定义三个 ★1 合成为 ★2', () => {
    let state = createGame(11)
    state = {
      ...state,
      quotas: 60,
      shop: state.shop.map((slot, index) =>
        index < 3 ? { defId: 'shunfengyao', sold: false, locked: false } : slot,
      ),
    }
    state = apply(state, { type: 'BUY', slot: 0 })
    state = apply(state, { type: 'BUY', slot: 1 })
    state = apply(state, { type: 'BUY', slot: 2 })

    const merged = state.units.filter((unit) => unit.defId === 'shunfengyao')
    expect(merged).toHaveLength(1)
    expect(merged[0]?.star).toBe(2)
  })

  it('买不起时返回错误且状态不变', () => {
    const state = { ...createGame(5), quotas: 0 }
    const result = dispatch(state, { type: 'BUY', slot: 0 })
    expect(result.error).toBeTruthy()
    expect(result.state).toBe(state)
  })

  it('亲和组按去重实例计数', () => {
    let state = createGame(3)
    state = {
      ...state,
      quotas: 100,
      shop: state.shop.map((slot, index) => ({
        defId: index % 2 === 0 ? 'shunfengyao' : 'zuoshen',
        sold: false,
        locked: false,
      })),
    }
    state = apply(state, { type: 'BUY', slot: 0 })
    state = apply(state, { type: 'BUY', slot: 1 })

    let cell = 0
    for (const unit of state.units) {
      state = apply(state, { type: 'MOVE', uid: unit.uid, zone: 'board', slot: cell })
      cell += 1
    }

    const counts = traitCounts(state)
    expect(counts.xiaoshida?.count).toBe(2)
    // 3 档才生效，2 个成员不构成档位
    expect(activeTiers(state).xiaoshida).toBeUndefined()
  })

  it('战斗在 20 秒内结束且结果确定', () => {
    const allies = [
      { uid: 'a1', defId: 'liangqiang', star: 2 as const, col: 1, row: 1, annotations: [] },
      { uid: 'a2', defId: 'zuoshen', star: 2 as const, col: 2, row: 1, annotations: [] },
    ]
    const enemies = [
      { uid: 'e1', defId: 'jingyingqi', star: 1 as const, col: 4, row: 2, annotations: [] },
    ]
    const first = simulateBattle(allies, enemies, { ...EMPTY_MODS }, { ...EMPTY_MODS })
    const second = simulateBattle(allies, enemies, { ...EMPTY_MODS }, { ...EMPTY_MODS })

    expect(first.ticks).toBeLessThanOrEqual(200)
    expect(first.ticks).toBe(second.ticks)
    expect(first.winner).toBe('ally')
    expect(first.curve.length).toBeGreaterThan(0)
  })

  it('自动打完一局：轮次推进并进入结算', () => {
    let state = createGame(99)
    let guard = 0
    while (state.phase !== 'END' && guard < 400) {
      guard += 1
      const index = state.shop.findIndex((slot) => {
        if (slot.sold || !slot.defId) return false
        const def = UNIT_BY_ID[slot.defId]
        return def !== undefined && state.quotas >= def.cost
      })
      if (index >= 0) state = apply(state, { type: 'BUY', slot: index })

      const bench = state.units.find((unit) => unit.zone === 'bench')
      if (bench) {
        const used = new Set(
          state.units.filter((unit) => unit.zone === 'board').map((unit) => unit.slot),
        )
        const cell = Array.from({ length: 28 }, (_, value) => value).find(
          (value) => !used.has(value),
        )
        if (cell !== undefined) {
          state = apply(state, { type: 'MOVE', uid: bench.uid, zone: 'board', slot: cell })
        }
      }

      const pending = state.pendingAugment
      if (pending && pending.length > 0) {
        state = apply(state, { type: 'PICK_AUGMENT', id: pending[0] ?? '' })
      }

      if (state.phase === 'PREP' && state.units.some((unit) => unit.zone === 'board')) {
        state = apply(state, { type: 'START_BATTLE' })
      }
    }

    expect(state.round).toBeGreaterThan(3)
    expect(state.log.length).toBeGreaterThan(0)
  })
})
