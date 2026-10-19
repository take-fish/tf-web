export interface LeaderboardEntry {
  rank: number
  userId: string
  nickname: string
  score: number
}

export interface LeaderboardResponse {
  gameId: string
  entries: LeaderboardEntry[]
}

export interface ScoreResponse {
  bestScore: number
  rank: number
}
