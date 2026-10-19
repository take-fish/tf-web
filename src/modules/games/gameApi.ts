import { getJson, postJson } from '@/lib/http'
import type { LeaderboardEntry, LeaderboardResponse, ScoreResponse } from './types'

export async function fetchLeaderboard(
  gameId = 'qps-breakout',
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const query = new URLSearchParams({ gameId, limit: String(limit) })
  const data = await getJson<LeaderboardResponse>(`/api/v1/game/leaderboard?${query.toString()}`)
  return data.entries ?? []
}

export function submitScore(payload: {
  gameId: string
  userId: string
  nickname: string
  score: number
}): Promise<ScoreResponse> {
  return postJson<ScoreResponse>('/api/v1/game/scores', payload)
}
