export interface LeaderboardEntry {
  rank: number
  userId: string
  nickname: string
  championships: number
  runnerUps: number
  points: number
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
/** 演练剧本：五子棋保留原 ID，实时竞技场各有独立引擎。 */
export type ArenaGameId =
  | 'heatmap-gomoku'
  | 'log-hotspot-arena'
  | 'topology-arena'
  | 'cluster-patrol-arena'
/** 赛事开赛前只能选“系统随机”；具体小局由服务端抽签。 */
export type TournamentGameId = ArenaGameId | 'random'
/** TOURNAMENT：多人演练；DUEL：一对一约战，不进入大厅、不计分、无聊天与观战。 */
export type GameKind = 'TOURNAMENT' | 'DUEL'
export type TournamentStatus = 'INVITING' | 'RUNNING' | 'FINISHED' | 'CANCELLED'
export type BracketType = 'TBD' | 'KNOCKOUT' | 'LEAGUE' | 'LADDER' | 'PAGE_PLAYOFF'
export type GameStage = 'KNOCKOUT' | 'LEAGUE' | 'LADDER' | 'PAGE_PLAYOFF'
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
/** 赛事默认 random，可显式固定盲棋；约战可选任意剧本。 */
export type SelectableGameId = GameId | TournamentGameId

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

export interface ArenaEvent {
  at: number
  type: string
  userId: string | null
  text: string
}

/** 所有实时竞技场共享的权威状态字段，与后端 ArenaState 一一对应。 */
export interface ArenaBaseState {
  gameId: string
  players: string[]
  startedAt: number
  endsAt: number
  finishedAt: number
  serverTime: number
  seed: number
  seq: number
  finished: boolean
  winnerUserId: string | null
  finishReason: string | null
  events: ArenaEvent[]
}

export interface HeatmapCell {
  index: number
  row: number
  col: number
  heat: number
  hp: number
  owner: string | null
  progress: Record<string, number>
}

export interface HeatmapState extends ArenaBaseState {
  rows: number
  cols: number
  lastIncomeAt: number
  lastHeatShiftAt: number
  heatShiftIndex: number
  cells: HeatmapCell[]
  scores: Record<string, number>
  energy: Record<string, number>
  cooldowns: Record<string, number>
}

export type TopologyNodeKind = 'CORE' | 'SERVICE' | 'MIDDLEWARE'
export type TopologyStatus = 'GREEN' | 'YELLOW' | 'RED'

export interface TopologyNode {
  id: string
  label: string
  kind: TopologyNodeKind
  baseCapacity: number
  capacity: number
  load: number
  utilization: number
  status: TopologyStatus
}

export interface TopologyEdge {
  id: string
  from: string
  to: string
  weight: number
  kind: 'ROUTE' | 'DEPEND'
  shifted: boolean
}

export interface TopologyState extends ArenaBaseState {
  attackerUserId: string | null
  defenderUserId: string | null
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  energy: Record<string, number>
  credits: Record<string, number>
  cooldowns: Record<string, number>
  injected: Record<string, number>
  scaleBonus: Record<string, number>
  scaleUntil: Record<string, number>
  throttleUntil: Record<string, number>
  shiftUntil: Record<string, number>
  lastRegenAt: number
  lastTickAt: number
  overloadedSince: number
}

export type ExerciseMode = 'FFA' | 'TEAM' | 'TRAINING'
export type ExerciseRoomStatus = 'WAITING' | 'RUNNING' | 'FINISHED' | 'CANCELLED'
export type ExerciseRoomSource = 'CASUAL' | 'TOURNAMENT'

/** 巡检对抗角色：服务端只下发视野内的目标，观战者收到全图。 */
export interface ExerciseActor {
  userId: string
  nickname: string
  team: string | null
  bot: boolean
  x: number
  y: number
  aim: number
  hp: number
  alive: boolean
  respawnAt: number
  score: number
  kills: number
  deaths: number
  assists: number
  shots: number
  hits: number
  lastFireAt: number
  lastInputAt: number
  inputX: number
  inputY: number
  scanUntil: number
  shieldUntil: number
  speedUntil: number
  cooldowns: Record<string, number>
  damageAt: Record<string, number>
}

export interface ExerciseObstacle {
  x: number
  y: number
  w: number
  h: number
  hard: boolean
  expiresAt: number
}

export interface ExerciseControlPoint {
  id: string
  x: number
  y: number
  ownerUserId: string | null
  ownerTeam: string | null
  holderUserId: string | null
  holdSince: number
  lastIncomeAt: number
  resourceAt: number
}

export interface ExerciseTracer {
  userId: string
  x1: number
  y1: number
  x2: number
  y2: number
  hit: boolean
  at: number
}

export interface ExerciseState extends ArenaBaseState {
  roomId: string
  mode: ExerciseMode
  status: string
  winnerTeam: string | null
  lastTickAt: number
  seedValue: number
  width: number
  height: number
  actors: ExerciseActor[]
  obstacles: ExerciseObstacle[]
  points: ExerciseControlPoint[]
  tracers: ExerciseTracer[]
  /** 服务端按接收者注入：当前视角用户；观战者为 null。 */
  you?: string | null
}

export interface ExerciseStanding {
  rank: number
  userId: string
  nickname: string
  team: string | null
  score: number
  kills: number
  deaths: number
  assists: number
  winner: boolean
}

export interface ExerciseRoomMember {
  userId: string
  nickname: string
  team: string | null
  ready: boolean
  bot: boolean
}

export interface ExerciseRoom {
  roomId: string
  roomCode: string
  mode: ExerciseMode
  source: ExerciseRoomSource
  status: ExerciseRoomStatus
  matchId: string | null
  ownerUserId: string | null
  maxPlayers: number
  durationSeconds: number
  createdAt: number
  startedAt: number | null
  members: ExerciseRoomMember[]
  state?: ExerciseState
}

export interface ExerciseResult {
  id: string
  roomId: string
  mode: ExerciseMode
  userId: string
  nickname: string
  team: string | null
  rankNo: number
  score: number
  kills: number
  deaths: number
  assists: number
  winner: boolean
  createdAt: number
}

/** 客户端每 50ms 上报一次意图；数值结算全部在服务端完成。 */
export interface ExerciseInput {
  inputSeq?: number
  moveX: number
  moveY: number
  aim: number
  fire: boolean
  skill?: string | null
  skillX?: number | null
  skillY?: number | null
}

export type ArenaStateView = HeatmapState | TopologyState | ExerciseState

/** WebSocket 动作帧：服务端只接受意图，数值全部由引擎计算。 */
export interface GameArenaAction {
  action: string
  target?: string
  skill?: string
  cell?: number
}

export interface GameRound {
  id: string
  gameId: string
  gameNo: number
  status: RoundStatus
  blackUserId: string
  whiteUserId: string
  attackerUserId: string | null
  turnUserId: string | null
  winnerUserId: string | null
  moveCount: number
  lastMoveAt: number
  restUntil: number | null
  readyUserIds: string[]
  startedAt: number
  endsAt: number | null
  finishedAt: number | null
  seq: number
  state: ArenaStateView | null
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
  gameId: string
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
  firstGameId: string | null
  gameChooserUserId: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  currentRound: GameRound | null
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
  runnerUpUserId: string | null
  runnerUpNickname: string | null
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

/** 服务端每 250ms 广播一次；重连后先用详情接口的 state 快照，再跟随增量帧。 */
export interface GameArenaStateEvent {
  type: 'arena_state'
  matchId: string
  roundId: string
  gameId: string
  seq: number
  serverTime: number
  state: ArenaStateView
}

export interface GameArenaFinishedEvent {
  type: 'arena_finished'
  matchId: string
  roundId: string
  gameId: string
  seq: number
  serverTime: number
  state: ArenaStateView
}

export interface GameExerciseStateEvent {
  type: 'exercise_state'
  roomId: string
  roomCode: string
  mode: ExerciseMode
  matchId: string | null
  seq: number
  serverTime: number
  you: string | null
  state: ExerciseState
}

export interface GameExerciseFinishedEvent {
  type: 'exercise_finished'
  roomId: string
  roomCode: string
  mode: ExerciseMode
  matchId: string | null
  winnerUserId: string | null
  winnerTeam: string | null
  reason: string
  standings: ExerciseStanding[]
  state?: ExerciseState
}

export interface GameExerciseRoomEvent {
  type: 'exercise_room'
  room: ExerciseRoom
}

export interface GameExerciseRoomsEvent {
  type: 'exercise_rooms'
  rooms: ExerciseRoom[]
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
  gameId?: string
  seq?: number
  state?: ArenaStateView
  serverTime?: number
  traceId?: string
  roomId?: string
  roomCode?: string
  mode?: ExerciseMode
  you?: string | null
  winnerTeam?: string | null
  standings?: ExerciseStanding[]
  room?: ExerciseRoom
  rooms?: ExerciseRoom[]
}
