export interface AuthUser {
  id: number
  username: string
  nickname: string
  role: 'USER' | 'ADMIN' | string
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
  status: string
  message: string
}
