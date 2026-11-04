import { getJson, postJson } from '@/lib/http'

/** 服务端锁步房间的视图模型：客户端只读，权威状态在 tf-game。 */

export type DrillRoomMode = 'CASUAL' | 'TOURNAMENT'
export type DrillRoomStatus = 'WAITING' | 'RUNNING' | 'FINISHED'
export type DrillRoomPhase = 'PREP' | 'BATTLE' | 'FINISHED'
export type DrillRoundResult = 'WIN' | 'LOSS' | 'DRAW'

export interface DrillRoomReward {
  items: number
  quota: number
}

export interface DrillRoomPlayer {
  userId: string
  nickname: string
  seat: number
  ready: boolean
  wins: number
  losses: number
  draws: number
  score: number
  reportedRound: number
  /** 休闲模式才有 */
  hp?: number
  alive?: boolean
  placement: number | null
  reward: DrillRoomReward | null
}

export interface DrillRoomChat {
  userId: string
  nickname: string
  text: string
  at: number
}

export interface DrillRoomView {
  id: string
  source: string
  mode: DrillRoomMode
  status: DrillRoomStatus
  phase: DrillRoomPhase
  seed: number
  round: number
  totalRounds: number
  serverTime: number
  prepEndsAt: number
  maxPlayers: number
  intermissionSeconds: number
  preludeSeconds: number
  players: DrillRoomPlayer[]
  carouselWins: Record<string, string>
  placement: string[]
  placements: Record<string, number>
  skipVotes: string[]
  skipGranted: boolean
  chats: DrillRoomChat[]
  rewards: Record<string, DrillRoomReward>
}

export interface DrillRoomReport {
  round: number
  hp?: number
  result?: DrillRoundResult
  carouselId?: string | null
}

const BASE = '/api/v1/game/drill/rooms'

export function createRoom(mode: DrillRoomMode): Promise<DrillRoomView> {
  return postJson<DrillRoomView>(BASE, { source: 'web', mode })
}

export function fetchRoom(roomId: string): Promise<DrillRoomView> {
  return getJson<DrillRoomView>(`${BASE}/${encodeURIComponent(roomId)}`)
}

export function joinRoom(roomId: string): Promise<DrillRoomView> {
  return postJson<DrillRoomView>(`${BASE}/${encodeURIComponent(roomId)}/join`, {})
}

export function readyRoom(roomId: string): Promise<DrillRoomView> {
  return postJson<DrillRoomView>(`${BASE}/${encodeURIComponent(roomId)}/ready`, {})
}

export function skipRoom(roomId: string): Promise<DrillRoomView> {
  return postJson<DrillRoomView>(`${BASE}/${encodeURIComponent(roomId)}/skip`, {})
}

export function reportRoom(roomId: string, report: DrillRoomReport): Promise<DrillRoomView> {
  return postJson<DrillRoomView>(`${BASE}/${encodeURIComponent(roomId)}/report`, report)
}

export function chatRoom(roomId: string, text: string): Promise<DrillRoomView> {
  return postJson<DrillRoomView>(`${BASE}/${encodeURIComponent(roomId)}/chat`, { text })
}
