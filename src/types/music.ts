export type ContentScope = 'PUBLIC' | 'PRIVATE'
export type ContentStatus = 'VISIBLE' | 'HIDDEN'
export type LibraryScope = 'public' | 'private' | 'shared'
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REVOKED'
export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

/** 曲目列表项，canEdit/canDelete 由服务端按当前用户计算。 */
export interface Track {
  id: number
  title: string
  artist: string
  album: string
  durationSec: number
  scope: ContentScope
  ownerId: number | null
  ownerNickname: string
  categoryId: number | null
  categoryName: string | null
  status: ContentStatus
  contentType: string
  fileSize: number
  mine: boolean
  canEdit: boolean
  canDelete: boolean
  createdAt: string
  updatedAt: string
}

export interface TrackPage {
  tracks: Track[]
  total: number
  page: number
  size: number
}

export interface Playlist {
  id: number
  name: string
  description: string
  trackCount: number
  updatedAt: string
}

export interface PlaylistDetail {
  playlist: Playlist
  tracks: Track[]
}

export interface Category {
  id: number
  name: string
  sortOrder: number
}

export interface AccessRequest {
  id: number
  trackId: number
  trackTitle: string
  ownerId: number
  ownerNickname: string
  requesterId: number
  requesterNickname: string
  status: RequestStatus
  message: string
  decisionMessage: string
  createdAt: string
  decidedAt: string | null
}

export interface ShareLink {
  shareToken: string
}

export interface PlaybackRecord {
  id: number
  trackId: number
  trackTitle: string
  action: string
  positionSec: number
  ts: number
}

export interface TrackUpdatePayload {
  title?: string
  artist?: string
  album?: string
  durationSec?: number
  categoryId?: number | null
  status?: ContentStatus
}

export interface ImportTrackOptions {
  scope: 'public' | 'private'
  title?: string
  artist?: string
  album?: string
  durationSec?: number
  categoryId?: number | null
}
