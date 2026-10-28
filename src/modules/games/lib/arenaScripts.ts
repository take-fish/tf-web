import type { ArenaGameId } from '@/types/games'

export interface ArenaScriptOption {
  id: ArenaGameId
  name: string
  shortName: string
  tag: string
  defaultName: string
  description: string
  duration: string
}

/** 演练剧本目录，与后端 ArenaGames 的 gameId 保持一致。 */
export const ARENA_SCRIPTS: readonly ArenaScriptOption[] = [
  {
    id: 'heatmap-gomoku',
    name: '热点区域对弈',
    shortName: '五子棋',
    tag: 'GOMOKU',
    defaultName: '热力五子棋',
    description: '15×15 棋盘 · 60 秒落子 · 五子连珠',
    duration: '逐手计时',
  },
  {
    id: 'log-hotspot-arena',
    name: '日志热点排查竞赛',
    shortName: '热点排查',
    tag: 'HEATMAP',
    defaultName: '日志热区排查',
    description: '8×12 热区 · 认领/复核/固化 · 邻接加成',
    duration: '120 秒',
  },
  {
    id: 'topology-arena',
    name: '混沌工程攻防演练',
    shortName: '拓扑攻防',
    tag: 'TOPOLOGY',
    defaultName: '混沌工程演练',
    description: '攻击方注入故障 · 防守方稳态保障 · 网关守 90 秒',
    duration: '90 秒',
  },
  {
    id: 'cluster-patrol-arena',
    name: '集群巡检对抗演练',
    shortName: '集群巡检',
    tag: 'PATROL',
    defaultName: '集群巡检对抗',
    description: '2D 俯视轻 FPS · 节点巡检 · 掩体与资源点',
    duration: '180 秒',
  },
]

export function isArenaScript(gameId: string | null | undefined): boolean {
  return (
    gameId === 'log-hotspot-arena' ||
    gameId === 'topology-arena' ||
    gameId === 'cluster-patrol-arena'
  )
}

export function isKnownScript(gameId: string | null | undefined): gameId is ArenaGameId {
  return ARENA_SCRIPTS.some((script) => script.id === gameId)
}

export function scriptOption(gameId: string | null | undefined): ArenaScriptOption {
  return (
    ARENA_SCRIPTS.find((script) => script.id === gameId) ?? ARENA_SCRIPTS[0]!
  )
}

export function scriptLabel(gameId: string | null | undefined): string {
  if (gameId === 'random') return '系统随机剧本'
  return scriptOption(gameId).name
}

export function scriptShortLabel(gameId: string | null | undefined): string {
  if (gameId === 'random') return '系统随机'
  return scriptOption(gameId).shortName
}

export function scriptDefaultName(gameId: string | null | undefined): string {
  if (gameId === 'random') return '系统随机演练'
  return scriptOption(gameId).defaultName
}
