export type SkinId = 'ide' | 'terminal' | 'grafana' | 'swagger' | 'jenkins' | 'kibana'

export interface SkinDef {
  id: SkinId
  name: string
  appName: string
  description: string
}

export const SKINS: readonly SkinDef[] = [
  {
    id: 'ide',
    name: 'IDE 代码编辑',
    appName: 'Visual Studio Code',
    description: '还原代码编辑器的文件树、标签页与状态栏',
  },
  {
    id: 'terminal',
    name: 'Linux 终端',
    appName: 'Xshell',
    description: '还原 SSH 终端的标签页与命令行会话',
  },
  {
    id: 'grafana',
    name: '监控大盘',
    appName: 'Grafana',
    description: '还原 Grafana 的仪表盘导航与时间范围',
  },
  {
    id: 'swagger',
    name: '接口文档',
    appName: 'Swagger UI',
    description: '还原 OpenAPI 文档的服务端与接口浏览视图',
  },
  {
    id: 'jenkins',
    name: '构建控制台',
    appName: 'Jenkins',
    description: '还原 CI/CD 流水线的构建队列与控制台',
  },
  {
    id: 'kibana',
    name: '日志检索',
    appName: 'Kibana',
    description: '还原 Discover 的查询栏与日志检索视图',
  },
]

export const SKIN_IDS: readonly SkinId[] = SKINS.map((skin) => skin.id)

export const DEFAULT_SKIN: SkinId = 'ide'

const MODULE_SKIN_MAP: ReadonlyArray<readonly [string, SkinId]> = [
  ['/chat', 'terminal'],
  ['/reader', 'ide'],
  ['/games', 'grafana'],
  ['/music', 'jenkins'],
]

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value)
}

export function skinById(id: SkinId): SkinDef {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0]!
}

export function defaultSkinForPath(path: string): SkinId {
  const match = MODULE_SKIN_MAP.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return match?.[1] ?? DEFAULT_SKIN
}

export function nextSkin(current: SkinId): SkinId {
  const index = SKIN_IDS.indexOf(current)
  return SKIN_IDS[(index + 1) % SKIN_IDS.length] ?? DEFAULT_SKIN
}
