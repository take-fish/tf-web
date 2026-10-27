export interface GameDefinition {
  id: string
  name: string
  metricTitle: string
  description: string
  playable: boolean
  span: number
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
    description: '集群节点巡检与故障标记，采集任务待接入',
    playable: false,
    span: 4,
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
    description: '创建联调演练、邀请在线成员、执行与回放',
    playable: true,
    span: 4,
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
