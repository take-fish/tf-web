import { describe, expect, it } from 'vitest'

import {
  drillOpponentSubmitted,
  drillRemaining,
  drillSubmitted,
  isDrillRound,
} from '../lib/drillMatch'
import type { DrillMatchState, GameRound } from '@/types/games'

function round(
  drill: DrillMatchState | null | undefined,
  overrides: Partial<GameRound> = {},
): GameRound {
  return {
    id: 'r1',
    gameId: 'capacity-drill',
    gameNo: 1,
    status: 'RUNNING',
    blackUserId: 'u1',
    whiteUserId: 'u2',
    attackerUserId: null,
    turnUserId: null,
    winnerUserId: null,
    moveCount: 0,
    lastMoveAt: 0,
    restUntil: null,
    readyUserIds: [],
    startedAt: 0,
    endsAt: null,
    finishedAt: null,
    seq: 0,
    state: null,
    moves: [],
    drill,
    ...overrides,
  }
}

function drillState(overrides: Partial<DrillMatchState> = {}): DrillMatchState {
  return {
    seed: 12345,
    gameNo: 1,
    deadlineAt: 1_000_000,
    reportedUserIds: [],
    ...overrides,
  }
}

describe('isDrillRound', () => {
  it('仅容量编排小局且带服务端状态时成立', () => {
    expect(isDrillRound(round(drillState()))).toBe(true)
    expect(isDrillRound(round(null))).toBe(false)
    expect(isDrillRound(round(undefined))).toBe(false)
    expect(isDrillRound(round(drillState(), { gameId: 'heatmap-gomoku' }))).toBe(false)
    expect(isDrillRound(null)).toBe(false)
  })
})

describe('提交状态', () => {
  it('识别自己与对手是否已上报', () => {
    const empty = round(drillState())
    expect(drillSubmitted(empty, 'u1')).toBe(false)
    expect(drillOpponentSubmitted(empty, 'u1')).toBe(false)

    const selfOnly = round(drillState({ reportedUserIds: ['u1'] }))
    expect(drillSubmitted(selfOnly, 'u1')).toBe(true)
    expect(drillOpponentSubmitted(selfOnly, 'u1')).toBe(false)

    const both = round(drillState({ reportedUserIds: ['u1', 'u2'] }))
    expect(drillOpponentSubmitted(both, 'u1')).toBe(true)
    // 观战者没有对手，不显示「对手已提交」
    expect(drillOpponentSubmitted(both, '')).toBe(false)
  })
})

describe('drillRemaining', () => {
  it('优先使用服务端截止时间，缺失时回退 endsAt', () => {
    expect(drillRemaining(round(drillState({ deadlineAt: 30_000 })), 10_000)).toBe(20)
    expect(drillRemaining(round(drillState({ deadlineAt: 5_000 })), 10_000)).toBe(0)
    expect(
      drillRemaining(round(drillState({ deadlineAt: 0 }), { endsAt: 42_000 }), 12_000),
    ).toBe(30)
    expect(drillRemaining(round(drillState({ deadlineAt: 0 })), 12_000)).toBe(0)
    expect(drillRemaining(null, 12_000)).toBe(0)
  })
})
