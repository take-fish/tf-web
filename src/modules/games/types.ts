export interface LeaderboardEntry {
  rank: number
  userId: string
  nickname: string
  score: number
  points?: number
  matches?: number
  wins?: number
  losses?: number
  championships?: number
  bestScore?: number
}

export interface LeaderboardResponse {
  gameId: string
  entries: LeaderboardEntry[]
}

export interface ScoreResponse {
  bestScore: number
  rank: number
}

export type GameFormat = 'BO1' | 'BO3' | 'BO5'
/** TOURNAMENT：多人演练；DUEL：一对一约战，不进入大厅、不计分、无聊天与观战。 */
export type GameKind = 'TOURNAMENT' | 'DUEL'
export type TournamentStatus = 'INVITING' | 'RUNNING' | 'FINISHED' | 'CANCELLED'
export type BracketType = 'TBD' | 'KNOCKOUT' | 'LEAGUE' | 'LADDER'
export type GameStage = 'KNOCKOUT' | 'LEAGUE' | 'LADDER'
export type MatchStatus = 'PENDING' | 'READY' | 'RUNNING' | 'FINISHED' | 'BYE'
export type RoundStatus = 'RUNNING' | 'REST' | 'FINISHED'
export type GameChatChannel = 'PUBLIC' | 'PLAYER_DM'
export type GameSocketStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'

export interface GamePlayer {
  userId: string
  nickname: string
  seed: number
  status: string
}

export type GameId = 'heatmap-gomoku' | 'blind-xiangqi'
export type LeaderboardGameId = 'overall' | 'heatmap-gomoku' | 'blind-xiangqi'

export type BlindLayout = 'STANDARD_SHUFFLE' | 'FULL_RANDOM' | 'HALF_RANDOM'
export type BlindPieceColor = 'RED' | 'BLACK'
export type BlindPieceType =
  | 'GENERAL'
  | 'ADVISOR'
  | 'ELEPHANT'
  | 'HORSE'
  | 'CHARIOT'
  | 'CANNON'
  | 'SOLDIER'

/** 盲棋公开棋盘格：反面棋只暴露坐标，翻开后才下发颜色与兵种。 */
export interface BlindPieceView {
  x: number
  y: number
  revealed: boolean
  color: BlindPieceColor | null
  pieceType: BlindPieceType | null
}

export interface GameMove {
  moveNo: number
  userId: string
  x: number
  y: number
  action?: 'PLACE' | 'REVEAL' | 'MOVE'
  fromX?: number | null
  fromY?: number | null
  pieceType?: BlindPieceType | null
  pieceColor?: BlindPieceColor | null
  capturedPieceType?: BlindPieceType | null
  capturedPieceColor?: BlindPieceColor | null
}

export interface GameRound {
  id: string
  gameNo: number
  status: RoundStatus
  blackUserId: string
  whiteUserId: string
  turnUserId: string | null
  winnerUserId: string | null
  moveCount: number
  lastMoveAt: number
  restUntil: number | null
  readyUserIds: string[]
  startedAt: number
  finishedAt: number | null
  moves: GameMove[]
  /** 盲棋公开棋盘；五子棋为空。 */
  blindBoard?: BlindPieceView[]
  /** 盲棋 firstUserId 为红方，secondUserId 为黑方。 */
  firstUserId?: string
  secondUserId?: string
}

export interface GameMatch {
  id: string
  tournamentId: string
  kind: GameKind
  roundNo: number
  slotNo: number
  stage: GameStage
  status: MatchStatus
  player1UserId: string | null
  player1Nickname: string | null
  player2UserId: string | null
  player2Nickname: string | null
  player1Score: number
  player2Score: number
  winnerUserId: string | null
  nextMatchId: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  currentRound: GameRound | null
  gameId?: GameId | string
  blindLayout?: BlindLayout | null
}

export interface GameTournament {
  id: string
  name: string
  gameId: string
  kind: GameKind
  format: GameFormat
  bracketType: BracketType
  status: TournamentStatus
  creatorUserId: string
  creatorNickname: string
  targetPlayers: number
  inviteDeadline: number
  currentRound: number
  totalRounds: number
  championUserId: string | null
  championNickname: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  players: GamePlayer[]
  matches: GameMatch[]
  blindLayout?: BlindLayout | null
}

export interface GameChatMessage {
  id: string
  tournamentId: string
  matchId: string | null
  channel: GameChatChannel
  fromUserId: string
  fromNickname: string
  toUserId: string | null
  content: string
  createdAt: number
}

export interface GameNotification {
  id: string
  type: 'FINAL_START' | 'CHAMPION' | string
  tournamentId: string
  matchId: string | null
  title: string
  message: string
  createdAt: number
  expiresAt: number
}

export interface GameWsTicket {
  ticket: string
  expiresIn: number
}

export interface GameOnlineUser {
  userId: string
  nickname: string
}

export interface GameStoneEvent {
  type: 'stone'
  matchId: string
  roundId: string
  moveNo: number
  userId: string
  x: number
  y: number
  turnUserId: string
  moveCount: number
  winning: boolean
}

export interface GameBlindActionEvent {
  type: 'blind_action'
  matchId: string
  roundId: string
  moveNo: number
  userId: string
  action: 'REVEAL' | 'MOVE'
  fromX: number | null
  fromY: number | null
  toX: number
  toY: number
  pieceType: BlindPieceType
  pieceColor: BlindPieceColor
  capturedPieceType: BlindPieceType | null
  capturedPieceColor: BlindPieceColor | null
  turnUserId: string
  moveCount: number
  result: 'WIN' | 'DRAW' | null
}

export interface GameMatchRestEvent {
  type: 'match_rest'
  matchId: string
  restUntil: number
  player1Score: number
  player2Score: number
}

export interface GameMatchResultEvent {
  type: 'match_result'
  matchId: string
  winnerUserId: string
  reason: string
  player1Score: number
  player2Score: number
}

export interface GameReadyFrame {
  type: 'game_ready'
  user: { userId: string; nickname: string }
  onlineUserIds?: string[]
  onlineMembers?: GameOnlineUser[]
  tournaments?: GameTournament[]
  invitations?: GameTournament[]
  duels?: GameTournament[]
  activeMatches?: GameMatch[]
}

export interface GameServerFrame {
  type: string
  user?: { userId: string; nickname: string }
  onlineUserIds?: string[]
  onlineMembers?: GameOnlineUser[]
  tournaments?: GameTournament[]
  invitations?: GameTournament[]
  duels?: GameTournament[]
  activeMatches?: GameMatch[]
  duel?: GameTournament
  tournament?: GameTournament
  tournamentId?: string
  match?: GameMatch
  matchId?: string
  readyUserIds?: string[]
  message?: GameChatMessage | string
  notification?: GameNotification
  code?: string
  reason?: string
  restUntil?: number
  player1Score?: number
  player2Score?: number
  winnerUserId?: string
  roundId?: string
  moveNo?: number
  userId?: string
  x?: number
  y?: number
  action?: 'REVEAL' | 'MOVE'
  fromX?: number | null
  fromY?: number | null
  toX?: number
  toY?: number
  pieceType?: BlindPieceType
  pieceColor?: BlindPieceColor
  capturedPieceType?: BlindPieceType | null
  capturedPieceColor?: BlindPieceColor | null
  result?: 'WIN' | 'DRAW' | null
  turnUserId?: string
  moveCount?: number
  winning?: boolean
  serverTime?: number
  traceId?: string
}
