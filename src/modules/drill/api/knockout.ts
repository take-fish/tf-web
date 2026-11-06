import { getJson, postJson } from '@/lib/http'

/** 淘汰赛对阵视图：服务端按排位名次播种，八进四 BO3、四强/决赛 BO5。 */

export interface KnockoutPlayer {
  userId: string
  nickname: string
}

export interface KnockoutMatch {
  id: string
  round: number
  slot: number
  bestOf: number
  game: number
  seed: number
  prepEndsAt: number
  playerA: KnockoutPlayer | null
  playerB: KnockoutPlayer | null
  winsA: number
  winsB: number
  reportedA: boolean
  reportedB: boolean
  winner: string | null
  phase: 'PREP' | 'FINISHED'
}

export interface KnockoutView {
  id: string
  roomId: string
  /** 来自锦标赛房间时非空。 */
  tournamentId?: string | null
  status: 'RUNNING' | 'FINISHED'
  champion: string | null
  serverTime: number
  rounds: KnockoutMatch[][]
}

export interface KnockoutGameReport {
  game: number
  wins: number
  losses: number
  draws: number
  sli: number
  survivors: number
}

const BASE = '/api/v1/game/drill'

export function startKnockout(roomId: string): Promise<KnockoutView> {
  return postJson<KnockoutView>(`${BASE}/rooms/${encodeURIComponent(roomId)}/knockout`, {})
}

export function latestKnockout(roomId: string): Promise<KnockoutView> {
  return getJson<KnockoutView>(`${BASE}/rooms/${encodeURIComponent(roomId)}/knockout`)
}

export function fetchKnockout(bracketId: string): Promise<KnockoutView> {
  return getJson<KnockoutView>(`${BASE}/knockout/${encodeURIComponent(bracketId)}`)
}

export function reportKnockoutGame(
  bracketId: string,
  matchId: string,
  report: KnockoutGameReport,
): Promise<KnockoutView> {
  return postJson<KnockoutView>(
    `${BASE}/knockout/${encodeURIComponent(bracketId)}/matches/${encodeURIComponent(matchId)}/report`,
    report,
  )
}
