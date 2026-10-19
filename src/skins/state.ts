import { skinById, type SkinId } from './registry'

export const BOSS_TITLE = 'VehicleService.java - fishmatrix-api - IntelliJ IDEA'

export interface TitleContext {
  skin: SkinId
  moduleTitle: string
  host: string
}

export function documentTitle(context: TitleContext, boss: boolean): string {
  if (boss) return BOSS_TITLE

  const { skin, moduleTitle, host } = context
  const app = skinById(skin).appName
  const title = moduleTitle.trim()

  if (skin === 'terminal') {
    return `${title || 'bash'} — ${host}`
  }
  if (skin === 'grafana') {
    return `${title || 'FishMatrix Metrics'} - Grafana`
  }
  if (skin === 'swagger') {
    return `${title || 'FishMatrix API'} - Swagger UI`
  }
  if (skin === 'jenkins') {
    return `${title || 'Dashboard'} [Jenkins]`
  }
  if (skin === 'kibana') {
    return `${title || 'Discover'} - Kibana`
  }
  return title ? `${title} - ${app}` : app
}

export function normalizeRoutePath(path: string): string {
  if (!path || path === '/') return '/'
  const trimmed = path.split('?')[0]?.split('#')[0] ?? '/'
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed
}

