import { getJson } from '@/lib/http'

export interface UserStats {
  active: number
  total: number
}

/** 启用用户数作为首页“总人数”的分母，需要登录后访问。 */
export async function fetchUserStats(): Promise<UserStats> {
  const data = await getJson<Partial<UserStats>>('/api/v1/user/stats')
  return {
    active: data.active ?? 0,
    total: data.total ?? 0,
  }
}
