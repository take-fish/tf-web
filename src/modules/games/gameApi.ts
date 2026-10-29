import { deleteJson, getJson, postJson, request } from '@/lib/http'
import type {
  BlindLayout,
  ExerciseMode,
  ExerciseResult,
  ExerciseRoom,
  GameChatChannel,
  GameChatMessage,
  GameFormat,
  GameMatch,
  GameNotification,
  GameOnlineUser,
  GameTournament,
  GameWsTicket,
  LeaderboardEntry,
  MatchRecordPreview,
  LeaderboardResponse,
  ScoreResponse,
  SelectableGameId,
} from '@/types/games'

export async function fetchLeaderboard(
  gameId = 'qps-breakout',
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const query = new URLSearchParams({ gameId, limit: String(limit) })
  const data = await getJson<LeaderboardResponse>(`/api/v1/game/leaderboard?${query.toString()}`)
  return data.entries ?? []
}

/** 综合榜：后端对所有 gameId 返回同一张综合积分榜。 */
export function fetchOverallLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  return fetchLeaderboard('overall', limit)
}

export function submitScore(payload: {
  gameId: string
  userId: string
  nickname: string
  score: number
}): Promise<ScoreResponse> {
  return postJson<ScoreResponse>('/api/v1/game/scores', payload)
}

/**
 * 管理台排行榜：包含被下架的行，带展示权重与操作审计；普通玩家只能看公开榜。
 */
export async function fetchAdminLeaderboard(
  gameId = '',
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (gameId) query.set('gameId', gameId)
  const data = await getJson<LeaderboardResponse>(
    `/api/v1/game/admin/leaderboards?${query.toString()}`,
  )
  return data.entries ?? []
}

/** 管理员改排行榜数值 / 可见性 / 展示顺序；未提交的字段保持不变。 */
export function updateLeaderboardEntry(
  userId: string,
  patch: {
    matches?: number
    wins?: number
    losses?: number
    points?: number
    championships?: number
    runnerUps?: number
    bestScore?: number
    visible?: boolean
    displayOrder?: number
  },
  gameId = '',
): Promise<LeaderboardEntry> {
  const query = gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''
  return request<LeaderboardEntry>(
    `/api/v1/game/admin/leaderboards/${encodeURIComponent(userId)}${query}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

/** 批量覆盖展示顺序，返回调整后的管理台榜单。 */
export async function reorderLeaderboard(
  items: { id: string; displayOrder: number }[],
  gameId = '',
): Promise<LeaderboardEntry[]> {
  const query = gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''
  const data = await request<LeaderboardResponse>(
    `/api/v1/game/admin/leaderboards/order${query}`,
    { method: 'POST', body: JSON.stringify({ items }) },
  )
  return data.entries ?? []
}

/** 比赛记录预览列表（只读，玩家也能看）。 */
export async function fetchMatchRecords(limit = 8): Promise<MatchRecordPreview[]> {
  const data = await getJson<{ records: MatchRecordPreview[] }>(
    `/api/v1/game/records?limit=${limit}`,
  )
  return data.records ?? []
}

/** 管理台比赛记录列表：包含被隐藏的记录。 */
export async function fetchAdminMatchRecords(limit = 20): Promise<MatchRecordPreview[]> {
  const data = await getJson<{ records: MatchRecordPreview[] }>(
    `/api/v1/game/admin/records?limit=${limit}`,
  )
  return data.records ?? []
}

/** 管理员调整比赛记录是否展示 / 展示顺序。 */
export function updateMatchRecord(
  matchId: string,
  patch: { visible?: boolean; displayOrder?: number },
): Promise<MatchRecordPreview> {
  return request<MatchRecordPreview>(
    `/api/v1/game/admin/records/${encodeURIComponent(matchId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

/** 批量覆盖比赛记录展示顺序，返回调整后的记录列表。 */
export async function reorderMatchRecords(
  items: { id: string; displayOrder: number }[],
): Promise<MatchRecordPreview[]> {
  const data = await request<{ records: MatchRecordPreview[] }>(
    '/api/v1/game/admin/records/order',
    { method: 'POST', body: JSON.stringify({ items }) },
  )
  return data.records ?? []
}
export async function fetchTournaments(limit = 20): Promise<GameTournament[]> {
  const data = await getJson<{ tournaments: GameTournament[] }>(
    `/api/v1/game/tournaments?limit=${limit}`,
  )
  return data.tournaments ?? []
}

export async function fetchInvitations(): Promise<GameTournament[]> {
  const data = await getJson<{ tournaments: GameTournament[] }>(
    '/api/v1/game/tournaments/invitations',
  )
  return data.tournaments ?? []
}

export function fetchTournament(id: string): Promise<GameTournament> {
  return getJson<GameTournament>(`/api/v1/game/tournaments/${encodeURIComponent(id)}`)
}

export function createTournament(payload: {
  name: string
  format: GameFormat
  players: GameOnlineUser[]
  gameId?: SelectableGameId
  blindLayout?: BlindLayout
  /** S赛启用池；不传表示启用全部 1v1 剧本。 */
  gamePool?: string[]
}): Promise<GameTournament> {
  return postJson<GameTournament>('/api/v1/game/tournaments', payload)
}

export function acceptTournament(id: string): Promise<GameTournament> {
  return request<GameTournament>(
    `/api/v1/game/tournaments/${encodeURIComponent(id)}/accept`,
    { method: 'POST' },
  )
}

export function declineTournament(id: string): Promise<GameTournament> {
  return request<GameTournament>(
    `/api/v1/game/tournaments/${encodeURIComponent(id)}/decline`,
    { method: 'POST' },
  )
}

export function cancelTournament(id: string): Promise<GameTournament> {
  return request<GameTournament>(
    `/api/v1/game/tournaments/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
  )
}

/** 软删除：记录不再出现在大厅、邀请与详情中。 */
export function deleteTournament(id: string): Promise<{ id: string; deleted: boolean }> {
  return deleteJson<{ id: string; deleted: boolean }>(
    `/api/v1/game/tournaments/${encodeURIComponent(id)}`,
  )
}

export async function fetchDuels(limit = 20): Promise<GameTournament[]> {
  const data = await getJson<{ duels: GameTournament[] }>(
    `/api/v1/game/duels?limit=${limit}`,
  )
  return data.duels ?? []
}

export function fetchDuel(id: string): Promise<GameTournament> {
  return getJson<GameTournament>(`/api/v1/game/duels/${encodeURIComponent(id)}`)
}

export function createDuel(payload: {
  opponentUserId: string
  opponentNickname: string
  format: GameFormat
  gameId?: SelectableGameId
  blindLayout?: BlindLayout
}): Promise<GameTournament> {
  return postJson<GameTournament>('/api/v1/game/duels', payload)
}

export function acceptDuel(id: string): Promise<GameTournament> {
  return request<GameTournament>(
    `/api/v1/game/duels/${encodeURIComponent(id)}/accept`,
    { method: 'POST' },
  )
}

export function declineDuel(id: string): Promise<GameTournament> {
  return request<GameTournament>(
    `/api/v1/game/duels/${encodeURIComponent(id)}/decline`,
    { method: 'POST' },
  )
}

export function cancelDuel(id: string): Promise<GameTournament> {
  return request<GameTournament>(
    `/api/v1/game/duels/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
  )
}

export async function fetchActiveMatches(): Promise<GameMatch[]> {
  const data = await getJson<{ matches: GameMatch[] }>('/api/v1/game/matches/active')
  return data.matches ?? []
}

export function fetchMatch(id: string): Promise<GameMatch> {
  return getJson<GameMatch>(`/api/v1/game/matches/${encodeURIComponent(id)}`)
}

/** 页面淘汰高顺位选手指定首局剧本；传入 random 表示让系统重新抽签。 */
export function chooseMatchGame(matchId: string, gameId: string): Promise<GameMatch> {
  return postJson<GameMatch>(
    `/api/v1/game/matches/${encodeURIComponent(matchId)}/game`,
    { gameId },
  )
}

export async function fetchMatchChat(
  matchId: string,
  channel: GameChatChannel = 'PUBLIC',
  limit = 50,
): Promise<GameChatMessage[]> {
  const query = new URLSearchParams({ channel, limit: String(limit) })
  const data = await getJson<{ messages: GameChatMessage[] }>(
    `/api/v1/game/matches/${encodeURIComponent(matchId)}/chat?${query.toString()}`,
  )
  return data.messages ?? []
}

export function sendMatchChat(
  matchId: string,
  payload: {
    channel: GameChatChannel
    toUserId?: string | null
    content: string
  },
): Promise<GameChatMessage> {
  return postJson<GameChatMessage>(
    `/api/v1/game/matches/${encodeURIComponent(matchId)}/chat`,
    payload,
  )
}

export async function fetchGameNotifications(
  after = 0,
  limit = 20,
): Promise<GameNotification[]> {
  const query = new URLSearchParams({ after: String(after), limit: String(limit) })
  const data = await getJson<{ notifications: GameNotification[] }>(
    `/api/v1/game/notifications?${query.toString()}`,
  )
  return data.notifications ?? []
}

export function fetchGameWsTicket(): Promise<GameWsTicket> {
  return request<GameWsTicket>('/api/v1/game/ws-ticket', { method: 'POST' })
}

/** 集群巡检对抗：休闲房间大厅。 */
export async function fetchExerciseRooms(): Promise<ExerciseRoom[]> {
  const data = await getJson<{ rooms: ExerciseRoom[] }>('/api/v1/game/exercise/rooms')
  return data.rooms ?? []
}

export function createExerciseRoom(
  mode: ExerciseMode,
  maxPlayers?: number,
): Promise<ExerciseRoom> {
  return postJson<ExerciseRoom>('/api/v1/game/exercise/rooms', { mode, maxPlayers })
}

export function fetchExerciseRoom(key: string): Promise<ExerciseRoom> {
  return getJson<ExerciseRoom>(`/api/v1/game/exercise/rooms/${encodeURIComponent(key)}`)
}

export function joinExerciseRoom(key: string): Promise<ExerciseRoom> {
  return postJson<ExerciseRoom>(
    `/api/v1/game/exercise/rooms/${encodeURIComponent(key)}/join`,
    {},
  )
}

export function readyExerciseRoom(key: string): Promise<ExerciseRoom> {
  return postJson<ExerciseRoom>(
    `/api/v1/game/exercise/rooms/${encodeURIComponent(key)}/ready`,
    {},
  )
}

export function leaveExerciseRoom(key: string): Promise<{ left: boolean }> {
  return postJson<{ left: boolean }>(
    `/api/v1/game/exercise/rooms/${encodeURIComponent(key)}/leave`,
    {},
  )
}

/** 最近战绩只包含休闲与赛事对抗，单人训练不会出现在这里。 */
export async function fetchExerciseResults(limit = 20): Promise<ExerciseResult[]> {
  const data = await getJson<{ results: ExerciseResult[] }>(
    `/api/v1/game/exercise/results?limit=${limit}`,
  )
  return data.results ?? []
}
