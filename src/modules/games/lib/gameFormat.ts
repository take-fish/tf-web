import type {
  GameFormat,
  GameMatch,
  GameTournament,
  MatchStatus,
  TournamentStatus,
} from '../types'

export function formatLabel(format: GameFormat): string {
  if (format === 'BO5') return 'BO5 · 五轮三胜'
  if (format === 'BO3') return 'BO3 · 三轮两胜'
  return 'BO1 · 单次执行'
}

export function tournamentStatusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'INVITING':
      return '邀请中'
    case 'RUNNING':
      return '执行中'
    case 'FINISHED':
      return '已结束'
    case 'CANCELLED':
      return '已取消'
    default:
      return status
  }
}

export function matchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'PENDING':
      return '待定'
    case 'READY':
      return '待开始'
    case 'RUNNING':
      return '进行中'
    case 'FINISHED':
      return '已结束'
    case 'BYE':
      return '轮空'
    default:
      return status
  }
}

export function playerName(userId: string | null, nickname: string | null): string {
  return nickname || userId || '待定'
}

export function isParticipant(match: GameMatch | null, userId: string): boolean {
  return Boolean(
    match &&
      userId &&
      (match.player1UserId === userId || match.player2UserId === userId),
  )
}

export function otherPlayerId(match: GameMatch, userId: string): string | null {
  if (match.player1UserId === userId) return match.player2UserId
  if (match.player2UserId === userId) return match.player1UserId
  return null
}

export function playerNickname(match: GameMatch, userId: string | null): string {
  if (!userId) return '待定'
  if (match.player1UserId === userId) return match.player1Nickname || userId
  if (match.player2UserId === userId) return match.player2Nickname || userId
  return userId
}

export interface MatchGroup {
  key: string
  label: string
  subtitle: string
  stage: GameMatch['stage']
  roundNo: number
  matches: GameMatch[]
}

function knockoutRoundLabel(tournament: GameTournament, roundNo: number): string {
  const remaining = tournament.totalRounds - roundNo
  if (remaining <= 0) return '最终轮'
  return `第 ${roundNo} 轮`
}

export function matchRoundLabel(tournament: GameTournament, match: GameMatch): string {
  if (match.stage === 'LEAGUE') return `循环计分 · 第 ${match.roundNo} 轮`
  if (match.stage === 'LADDER') {
    // 旧版阶梯决赛固定两场：三号挑战二号，胜者再挑战一号。
    const remaining = tournament.totalRounds - match.roundNo
    if (remaining <= 0) return '收尾轮 · 决赛'
    if (remaining === 1) return '收尾轮 · 半决赛'
    return `收尾轮 · 第 ${match.roundNo} 轮`
  }
  if (match.stage === 'PAGE_PLAYOFF') {
    // 前四页面淘汰：三打四、胜者打二、决赛打一；三号/二号/一号分别拥有首局选图权。
    const remaining = tournament.totalRounds - match.roundNo
    const qualifierCount = Math.min(
      4,
      tournament.players.filter((player) => player.status === 'ACCEPTED').length,
    )
    if (remaining <= 0) return '页面淘汰 · 决赛（一号选图）'
    if (remaining === 1) {
      return qualifierCount < 4
        ? '页面淘汰 · 三打二（三号选图）'
        : '页面淘汰 · 胜者打二（二号选图）'
    }
    return '页面淘汰 · 三打四（三号选图）'
  }
  return knockoutRoundLabel(tournament, match.roundNo)
}

export function groupMatches(tournament: GameTournament): MatchGroup[] {
  const groups = new Map<string, MatchGroup>()
  const sorted = [...tournament.matches].sort(
    (left, right) => left.roundNo - right.roundNo || left.slotNo - right.slotNo,
  )
  for (const match of sorted) {
    const key = `${match.stage}:${match.roundNo}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: matchRoundLabel(tournament, match),
        subtitle:
          match.stage === 'LEAGUE'
            ? 'BO1'
            : formatLabel(tournament.format).split(' · ')[0] ?? tournament.format,
        stage: match.stage,
        roundNo: match.roundNo,
        matches: [],
      }
      groups.set(key, group)
    }
    group.matches.push(match)
  }
  return [...groups.values()]
}

/** 选择该赛事中当前最适合进入的比赛：优先自己的比赛，再找进行中/待开始。 */
export function findWatchableMatch(
  tournament: GameTournament,
  userId: string,
): GameMatch | undefined {
  const own = tournament.matches.find(
    (match) =>
      isParticipant(match, userId) &&
      (match.status === 'RUNNING' || match.status === 'READY'),
  )
  if (own) return own
  return tournament.matches.find(
    (match) =>
      (match.status === 'RUNNING' || match.status === 'READY') &&
      Boolean(match.player1UserId || match.player2UserId),
  )
}

export function canWatchMatch(match: GameMatch): boolean {
  if (match.status === 'BYE') return false
  return Boolean(match.player1UserId || match.player2UserId)
}

export interface StandingRow {
  userId: string
  nickname: string
  seed: number
  points: number
  wins: number
  played: number
}

/** 与后端一致：积分赛只认胜场；同胜场按种子顺位排序。 */
export function leagueStandings(tournament: GameTournament): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  for (const player of tournament.players) {
    if (player.status !== 'ACCEPTED') continue
    rows.set(player.userId, {
      userId: player.userId,
      nickname: player.nickname,
      seed: player.seed,
      points: 0,
      wins: 0,
      played: 0,
    })
  }
  for (const match of tournament.matches) {
    if (match.stage !== 'LEAGUE') continue
    if (match.status !== 'FINISHED' && match.status !== 'BYE') continue
    if (!match.winnerUserId) continue
    const winner = rows.get(match.winnerUserId)
    if (winner) {
      winner.points += 3
      winner.wins += 1
    }
    if (match.status === 'FINISHED') {
      if (match.player1UserId) {
        const row = rows.get(match.player1UserId)
        if (row) row.played += 1
      }
      if (match.player2UserId) {
        const row = rows.get(match.player2UserId)
        if (row) row.played += 1
      }
    }
  }
  return [...rows.values()].sort(
    (left, right) => right.wins - left.wins || left.seed - right.seed,
  )
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function countdown(deadline: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
