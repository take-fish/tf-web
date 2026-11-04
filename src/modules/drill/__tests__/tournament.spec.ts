import { describe, expect, it } from 'vitest'

import { UNIT_BY_ID } from '../core/content'
import { createGame, dispatch } from '../core/engine'
import type { Command } from '../core/engine'
import type { GameState } from '../core/state'

function play(state: GameState, command: Command): GameState {
  return dispatch(state, command).state
}

/** 锦标赛排位赛：自动买人/上阵/开战，打满 15 轮。 */
function autoPlayTournament(seed = 1): GameState {
  let state = createGame(seed, { tournament: true })
  const picked = new Set<string>()
  let guard = 0
  while (state.phase !== 'END' && guard < 200) {
    guard += 1

    const slot = state.shop.findIndex((entry) => {
      if (entry.sold || !entry.defId) return false
      const def = UNIT_BY_ID[entry.defId]
      return def !== undefined && state.quotas >= def.cost
    })
    if (slot >= 0) state = play(state, { type: 'BUY', slot })

    const bench = state.units.find((unit) => unit.zone === 'bench')
    if (bench) {
      const used = new Set(state.units.filter((unit) => unit.zone === 'board').map((unit) => unit.slot))
      const cell = Array.from({ length: 28 }, (_, index) => index).find((index) => !used.has(index))
      if (cell !== undefined) state = play(state, { type: 'MOVE', uid: bench.uid, zone: 'board', slot: cell })
    }

    const pending = state.pendingAugment
    if (pending && pending.length > 0) state = play(state, { type: 'PICK_AUGMENT', id: pending[0] ?? '' })

    if (state.phase === 'DRAFT' && state.carousel) {
      const item = state.carousel.items.find((entry) => !picked.has(`${state.round}:${entry.id}`))
      if (item) {
        picked.add(`${state.round}:${item.id}`)
        state = play(state, { type: 'PICK_CAROUSEL', itemId: item.id })
      }
    }

    if (state.phase === 'PREP' && state.units.some((unit) => unit.zone === 'board')) {
      state = play(state, { type: 'START_BATTLE' })
    }
  }
  return state
}

describe('锦标赛排位赛（无血量 / 15 轮 / 战绩排名）', () => {
  it('开局是 15 轮、满 SLI、战绩清零', () => {
    const state = createGame(1, { tournament: true })
    expect(state.tournament).toBe(true)
    expect(state.totalRounds).toBe(15)
    expect(state.sli).toBe(100)
    expect(state.record).toEqual({ wins: 0, losses: 0, draws: 0 })
    expect(state.standings?.length).toBe(8)
    const alive = state.opponents.every((seat: { alive: boolean; sli: number }) => seat.alive && seat.sli === 100)
    expect(alive).toBe(true)
  })

  it('打满 15 轮后按战绩收口，中途不掉血也不淘汰', () => {
    const state = autoPlayTournament(1)
    expect(state.phase).toBe('END')
    expect(state.log.length).toBe(15)
    expect(state.sli).toBe(100)
    expect(state.opponents.every((seat: { alive: boolean }) => seat.alive)).toBe(true)

    const record = state.record ?? { wins: 0, losses: 0, draws: 0 }
    expect(record.wins + record.losses + record.draws).toBe(15)

    expect(state.reward).toBeTruthy()
    expect(state.reward?.items).toBeGreaterThanOrEqual(1)
    expect(state.placement).toBeGreaterThanOrEqual(1)
    expect(state.placement).toBeLessThanOrEqual(8)

    const ranked = [...(state.standings ?? [])].sort(
      (a, b) => b.wins - a.wins || a.losses - b.losses || b.draws - a.draws,
    )
    expect(ranked[0]?.wins).toBeGreaterThanOrEqual(record.wins)
  })

  it('普通对局仍是 30 轮、有血量和淘汰', () => {
    const state = createGame(1)
    expect(state.tournament).toBeUndefined()
    expect(state.totalRounds).toBe(30)
  })
})
