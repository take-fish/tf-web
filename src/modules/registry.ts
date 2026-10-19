import type { SkinId } from '@/skins/registry'

export type ModuleIcon = 'overview' | 'terminal' | 'file' | 'activity' | 'build'

export interface ModuleDef {
  id: string
  path: string
  routeName: string
  label: string
  disguiseLabel: string
  description: string
  icon: ModuleIcon
  defaultSkin: SkinId
  documentTitle: string
  service: string
  port: number
}

export const MODULES: readonly ModuleDef[] = [
  {
    id: 'overview',
    path: '/',
    routeName: 'home',
    label: '工作台',
    disguiseLabel: 'Overview',
    description: '集群节点与服务实例状态总览',
    icon: 'overview',
    defaultSkin: 'ide',
    documentTitle: 'Overview',
    service: 'tf-console',
    port: 8301,
  },
  {
    id: 'chat',
    path: '/chat',
    routeName: 'chat',
    label: '终端协作',
    disguiseLabel: 'Terminal',
    description: 'SSH 会话与运维日志通道',
    icon: 'terminal',
    defaultSkin: 'terminal',
    documentTitle: 'dev@dev-node-01: /opt/chat',
    service: 'tf-chat',
    port: 8102,
  },
  {
    id: 'reader',
    path: '/reader',
    routeName: 'reader',
    label: '代码审阅',
    disguiseLabel: 'Code Review',
    description: '仓库代码与合并请求评审',
    icon: 'file',
    defaultSkin: 'ide',
    documentTitle: 'ReaderService.java',
    service: 'tf-reader',
    port: 8103,
  },
  {
    id: 'games',
    path: '/games',
    routeName: 'games',
    label: '监控大盘',
    disguiseLabel: 'Dashboards',
    description: '核心指标采集与告警面板',
    icon: 'activity',
    defaultSkin: 'grafana',
    documentTitle: 'FishMatrix Metrics',
    service: 'tf-game',
    port: 8104,
  },
  {
    id: 'music',
    path: '/music',
    routeName: 'music',
    label: '构建控制台',
    disguiseLabel: 'Build Pipeline',
    description: 'CI/CD 流水线与构建产物',
    icon: 'build',
    defaultSkin: 'jenkins',
    documentTitle: 'Pipeline #128',
    service: 'tf-music',
    port: 8105,
  },
]

export function moduleByPath(path: string): ModuleDef {
  const match = [...MODULES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((module) => module.path === '/' || path === module.path || path.startsWith(`${module.path}/`))
  return match ?? MODULES[0]!
}

export function moduleById(id: string): ModuleDef | undefined {
  return MODULES.find((module) => module.id === id)
}
