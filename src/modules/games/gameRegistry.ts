import type { ArenaGameId } from '@/types/games'

export interface GameDefinition {
  id: string
  name: string
  metricTitle: string
  description: string
  playable: boolean
  span: number
  /** 可执行卡片对应的演练剧本，点击后直接按该剧本打开调度台。 */
  scriptId?: ArenaGameId
}

export const GAMES: readonly GameDefinition[] = [
  {
    id: 'timeseries-runner',
    name: '耗时采样',
    metricTitle: '响应耗时时序图',
    description: '耗时曲线采样与尖峰标注，采集任务待接入',
    playable: false,
    span: 5,
  },
  {
    id: 'ring-2048',
    name: '容量回收',
    metricTitle: '磁盘使用率环形图',
    description: '磁盘容量回收与碎片整理，采集任务待接入',
    playable: false,
    span: 3,
  },
  {
    id: 'topology-minesweeper',
    name: '节点巡检',
    metricTitle: '节点拓扑图',
    description: '混沌工程攻防演练：注入故障与稳态保障',
    playable: true,
    span: 4,
    scriptId: 'topology-arena',
  },
  {
    id: 'qps-breakout',
    name: '峰值削峰',
    metricTitle: 'QPS 柱状图',
    description: '削峰填谷演练，压降异常流量峰值',
    playable: true,
    span: 4,
  },
  {
    id: 'heatmap-gomoku',
    name: '日志热点',
    metricTitle: '日志热力图',
    description: '热点区域对弈与日志热区排查',
    playable: true,
    span: 5,
    scriptId: 'heatmap-gomoku',
  },
  {
    id: 'blind-xiangqi',
    name: '盲棋',
    metricTitle: '暗棋盘面',
    description: '中国象棋暗棋：翻棋、盲吃与将帅见面',
    playable: true,
    span: 4,
  },
]
