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
    name: '时序跑酷',
    metricTitle: '响应耗时时序图',
    description: '沿耗时曲线躲避尖峰，采集任务待接入',
    playable: false,
    span: 5,
  },
  {
    id: 'ring-2048',
    name: '环形 2048',
    metricTitle: '磁盘使用率环形图',
    description: '环形轨道合并磁盘碎片，采集任务待接入',
    playable: false,
    span: 3,
  },
  {
    id: 'topology-minesweeper',
    name: '拓扑扫雷',
    metricTitle: '节点拓扑图',
    description: '排查集群故障节点，采集任务待接入',
    playable: false,
    span: 4,
  },
  {
    id: 'qps-breakout',
    name: '流量打砖块',
    metricTitle: 'QPS 柱状图',
    description: '削峰填谷演练，消除异常流量峰值',
    playable: true,
    span: 7,
  },
  {
    id: 'heatmap-gomoku',
    name: '热力五子棋',
    metricTitle: '日志热力图',
    description: '创建赛事、邀请在线选手、对战与观战',
    playable: true,
    span: 5,
  },
]
