import { describe, expect, it } from 'vitest'

import {
  TOURNAMENT_GAMES,
  defaultSeriesPool,
  defaultTournamentName,
  isTournamentPoolGame,
  toggleSeriesPool,
  tournamentGameOption,
} from '../lib/tournamentGames'

describe('赛事剧本池', () => {
  it('五个 1v1 剧本且 id 唯一，与后端 TOURNAMENT_POOL 对齐', () => {
    const ids = TOURNAMENT_GAMES.map((option) => option.id)

    expect(ids).toEqual([
      'heatmap-gomoku',
      'log-hotspot-arena',
      'topology-arena',
      'cluster-patrol-arena',
      'blind-xiangqi',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('S赛默认启用全部剧本', () => {
    expect(defaultSeriesPool()).toEqual(TOURNAMENT_GAMES.map((option) => option.id))
    expect(isTournamentPoolGame('blind-xiangqi')).toBe(true)
    expect(isTournamentPoolGame('random')).toBe(false)
    expect(isTournamentPoolGame(undefined)).toBe(false)
  })

  it('取消勾选后按目录顺序返回，且至少保留一个剧本', () => {
    const withoutBlind = toggleSeriesPool(defaultSeriesPool(), 'blind-xiangqi')
    expect(withoutBlind).toEqual([
      'heatmap-gomoku',
      'log-hotspot-arena',
      'topology-arena',
      'cluster-patrol-arena',
    ])

    const restored = toggleSeriesPool(withoutBlind, 'blind-xiangqi')
    expect(restored).toEqual(defaultSeriesPool())

    const last = toggleSeriesPool(['topology-arena'], 'topology-arena')
    expect(last).toEqual(['topology-arena'])
  })

  it('默认名称区分 S赛与锦标赛', () => {
    expect(defaultTournamentName('SERIES', 'random')).toBe('S赛演练')
    expect(defaultTournamentName('CHAMPIONSHIP', 'blind-xiangqi')).toBe('盲棋演练')
    expect(defaultTournamentName('CHAMPIONSHIP', 'topology-arena')).toBe('混沌工程演练')
    expect(tournamentGameOption('unknown').id).toBe('heatmap-gomoku')
  })
})
