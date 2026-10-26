import { describe, expect, it } from 'vitest'

import {
  canWatchMatch,
  countdown,
  findWatchableMatch,
  formatDuration,
  formatLabel,
  groupMatches,
  leagueStandings,
  matchRoundLabel,
  matchStatusLabel,
  tournamentStatusLabel,
} from '../lib/gameFormat'
import type {
  GameFormat,
  GameMatch,
  GamePlayer,
  GameTournament,
  GameStage,
  MatchStatus,
} from '../types'

function match(
  id: string,
  roundNo: number,
  stage: GameStage,
  options: Partial<GameMatch> = {},
): GameMatch {
  return {
    id,
    tournamentId: 't1',
    roundNo,
    slotNo: 1,
    stage,
    status: 'READY',
    player1UserId: 'u1',
    player1Nickname: 'Alice',
    player2UserId: 'u2',
    player2Nickname: 'Bob',
    player1Score: 0,
    player2Score: 0,
    winnerUserId: null,
    nextMatchId: null,
    createdAt: 0,
    startedAt: null,
    finishedAt: null,
    currentRound: null,
    ...options,
  }
}

function tournament(
  overrides: Partial<GameTournament> & { format?: GameFormat } = {},
): GameTournament {
  const players: GamePlayer[] = [
    { userId: 'u1', nickname: 'Alice', seed: 1, status: 'ACCEPTED' },
    { userId: 'u2', nickname: 'Bob', seed: 2, status: 'ACCEPTED' },
    { userId: 'u3', nickname: 'Carol', seed: 3, status: 'ACCEPTED' },
    { userId: 'u4', nickname: 'Dave', seed: 4, status: 'INVITED' },
  ]
  return {
    id: 't1',
    name: '测试赛事',
    gameId: 'heatmap-gomoku',
    format: 'BO3',
    bracketType: 'KNOCKOUT',
    status: 'RUNNING',
    creatorUserId: 'u1',
    creatorNickname: 'Alice',
    targetPlayers: 3,
    inviteDeadline: 0,
    currentRound: 1,
    totalRounds: 2,
    championUserId: null,
    championNickname: null,
    createdAt: 0,
    startedAt: 0,
    finishedAt: null,
    players,
    matches: [],
    ...overrides,
  }
}

describe('gameFormat 标签', () => {
  it('格式化赛制与状态', () => {
    expect(formatLabel('BO1')).toBe('BO1 · 一局定胜负')
    expect(formatLabel('BO3')).toBe('BO3 · 三局两胜')
    expect(formatLabel('BO5')).toBe('BO5 · 五局三胜')
    expect(tournamentStatusLabel('INVITING')).toBe('邀请中')
    expect(tournamentStatusLabel('FINISHED')).toBe('已结束')
    expect(matchStatusLabel('BYE')).toBe('轮空')
  })

  it('淘汰赛轮次按总轮数换算', () => {
    const t = tournament({ totalRounds: 4 })
    expect(matchRoundLabel(t, match('m1', 1, 'KNOCKOUT'))).toBe('1/8 决赛')
    expect(matchRoundLabel(t, match('m2', 2, 'KNOCKOUT'))).toBe('1/4 决赛')
    expect(matchRoundLabel(t, match('m3', 3, 'KNOCKOUT'))).toBe('半决赛')
    expect(matchRoundLabel(t, match('m4', 4, 'KNOCKOUT'))).toBe('决赛')
  })

  it('阶梯决赛区分挑战赛与巅峰战', () => {
    const t = tournament({ totalRounds: 5 })
    expect(matchRoundLabel(t, match('m1', 4, 'LADDER'))).toBe('阶梯决赛 · 挑战赛')
    expect(matchRoundLabel(t, match('m2', 5, 'LADDER'))).toBe('阶梯决赛 · 巅峰战')
  })
})

describe('groupMatches', () => {
  it('按轮次分组并排序，积分赛标注 BO1', () => {
    const t = tournament({
      bracketType: 'LEAGUE',
      totalRounds: 5,
      matches: [
        match('m3', 2, 'LEAGUE', { slotNo: 1 }),
        match('m2', 1, 'LEAGUE', { slotNo: 2 }),
        match('m1', 1, 'LEAGUE', { slotNo: 1 }),
        match('m4', 4, 'LADDER'),
      ],
    })
    const groups = groupMatches(t)
    expect(groups.map((group) => group.label)).toEqual([
      '积分赛 · 第 1 轮',
      '积分赛 · 第 2 轮',
      '阶梯决赛 · 挑战赛',
    ])
    expect(groups[0]?.matches.map((entry) => entry.id)).toEqual(['m1', 'm2'])
    expect(groups[0]?.subtitle).toBe('BO1')
  })
})

describe('观战选择', () => {
  it('优先自己的比赛，其次进行中的公开比赛', () => {
    const own = match('own', 1, 'KNOCKOUT', { status: 'READY' })
    const live = match('live', 1, 'KNOCKOUT', {
      status: 'RUNNING',
      slotNo: 2,
      player1UserId: 'u2',
      player2UserId: 'u3',
    })
    const t = tournament({ matches: [live, own] })
    expect(findWatchableMatch(t, 'u1')?.id).toBe('own')

    const other = tournament({ matches: [{ ...live, player1UserId: 'u2', player2UserId: 'u3' }] })
    expect(findWatchableMatch(other, 'u1')?.id).toBe('live')
  })

  it('轮空比赛不可观战', () => {
    expect(canWatchMatch(match('bye', 1, 'KNOCKOUT', { status: 'BYE' as MatchStatus }))).toBe(
      false,
    )
    expect(canWatchMatch(match('bye', 1, 'KNOCKOUT', { player1UserId: null }))).toBe(true)
  })
})

describe('leagueStandings', () => {
  it('每胜 +3，按积分、胜场、种子排序，忽略未结束比赛', () => {
    const t = tournament({
      bracketType: 'LEAGUE',
      matches: [
        match('m1', 1, 'LEAGUE', { status: 'FINISHED', winnerUserId: 'u2' }),
        match('m2', 1, 'LEAGUE', {
          status: 'FINISHED',
          player1UserId: 'u1',
          player2UserId: 'u3',
          winnerUserId: 'u1',
        }),
        match('m3', 2, 'LEAGUE', { status: 'RUNNING', winnerUserId: 'u3' }),
      ],
    })
    const rows = leagueStandings(t)
    expect(rows.map((row) => row.userId)).toEqual(['u1', 'u2', 'u3'])
    expect(rows[0]).toMatchObject({ userId: 'u1', points: 3, wins: 1, played: 2 })
    expect(rows[1]).toMatchObject({ userId: 'u2', points: 3, wins: 1, played: 1 })
    expect(rows[2]).toMatchObject({ userId: 'u3', points: 0, wins: 0, played: 1 })
    expect(rows.some((row) => row.userId === 'u4')).toBe(false)
  })
})

describe('时间格式', () => {
  it('倒计时与时长', () => {
    expect(countdown(61_000, 1_000)).toBe('1:00')
    expect(countdown(1_000, 5_000)).toBe('0:00')
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(75)).toBe('1:15')
  })
})
