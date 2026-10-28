import type {
  SelectableGameId,
  TournamentPoolGameId,
  TournamentType,
} from '@/types/games'

export interface TournamentGameOption {
  id: TournamentPoolGameId
  name: string
  shortName: string
  description: string
  defaultName: string
}

/** 1v1 剧本池：S赛在此范围内逐场抽签，锦标赛从中选定一个专精。 */
export const TOURNAMENT_GAMES: readonly TournamentGameOption[] = [
  {
    id: 'heatmap-gomoku',
    name: '热点区域对弈',
    shortName: '五子棋',
    description: '15×15 棋盘 · 五子连珠',
    defaultName: '热力五子棋',
  },
  {
    id: 'log-hotspot-arena',
    name: '日志热点排查竞赛',
    shortName: '热点排查',
    description: '8×12 热区 · 认领/复核/固化',
    defaultName: '日志热区排查',
  },
  {
    id: 'topology-arena',
    name: '混沌工程攻防演练',
    shortName: '拓扑攻防',
    description: '注入故障 · 稳态保障',
    defaultName: '混沌工程演练',
  },
  {
    id: 'cluster-patrol-arena',
    name: '集群巡检对抗演练',
    shortName: '集群巡检',
    description: '2D 轻 FPS · 节点巡检',
    defaultName: '集群巡检对抗',
  },
  {
    id: 'blind-xiangqi',
    name: '盲棋',
    shortName: '盲棋',
    description: '中国象棋暗棋 · 翻棋/盲吃',
    defaultName: '盲棋演练',
  },
]

export function isTournamentPoolGame(
  gameId: string | null | undefined,
): gameId is TournamentPoolGameId {
  return TOURNAMENT_GAMES.some((option) => option.id === gameId)
}

export function tournamentGameOption(
  gameId: string | null | undefined,
): TournamentGameOption {
  return (
    TOURNAMENT_GAMES.find((option) => option.id === gameId) ?? TOURNAMENT_GAMES[0]!
  )
}

/** S赛默认启用全部剧本，可在创建时取消勾选，但至少保留一个。 */
export function defaultSeriesPool(): TournamentPoolGameId[] {
  return TOURNAMENT_GAMES.map((option) => option.id)
}

/** 增删启用剧本，结果始终按目录顺序排列。 */
export function toggleSeriesPool(
  pool: readonly TournamentPoolGameId[],
  gameId: TournamentPoolGameId,
): TournamentPoolGameId[] {
  const enabled = new Set(pool)
  if (enabled.has(gameId)) {
    if (enabled.size <= 1) return [...pool]
    enabled.delete(gameId)
  } else {
    enabled.add(gameId)
  }
  return defaultSeriesPool().filter((id) => enabled.has(id))
}

export function defaultTournamentName(
  type: TournamentType,
  gameId: SelectableGameId,
): string {
  if (type === 'SERIES' || gameId === 'random') return 'S赛演练'
  return tournamentGameOption(gameId).defaultName
}
