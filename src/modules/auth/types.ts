export interface AuthUser {
  id: number
  username: string
  nickname: string
  /** 用户中台头像地址；未设置时为 null。 */
  avatarUrl?: string | null
  role: 'USER' | 'ADMIN' | string
  /** 多角色与细粒度权限均由用户中台下发；role 仅作单角色兼容字段。 */
  roles?: string[]
  permissions?: string[]
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED' | string
  createdAt?: string
  approvedAt?: string | null
  approvedBy?: string | null
  lastLoginAt?: string | null
}

export interface Credentials {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

export interface RegisterResponse {
  id: number
  status: string
  message: string
}

export interface AppMeta {
  environment: 'production' | 'test' | string
  environmentLabel: string
  database: string
  namespace: string
  version: string
}
