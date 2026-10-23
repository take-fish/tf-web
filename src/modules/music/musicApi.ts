import { deleteJson, getJson, postForm, postJson, request } from '@/lib/http'
import type {
  AccessRequest,
  Category,
  ImportTrackOptions,
  LibraryScope,
  PlaybackRecord,
  Playlist,
  PlaylistDetail,
  ShareLink,
  Track,
  TrackPage,
  TrackUpdatePayload,
} from './types'

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function fetchTracks(params: {
  scope?: LibraryScope
  categoryId?: number | null
  q?: string
  page?: number
  size?: number
} = {}): Promise<TrackPage> {
  const scope = params.scope === 'private' ? 'private' : 'public'
  const data = await getJson<TrackPage>(
    `/api/v1/music/tracks${query({
      scope,
      categoryId: params.categoryId,
      q: params.q?.trim(),
      page: params.page,
      size: params.size,
    })}`,
  )
  return {
    tracks: data.tracks ?? [],
    total: data.total ?? 0,
    page: data.page ?? 0,
    size: data.size ?? 20,
  }
}

export async function fetchMyTracks(): Promise<Track[]> {
  const data = await getJson<{ tracks: Track[] }>('/api/v1/music/tracks/mine')
  return data.tracks ?? []
}

export async function fetchSharedTracks(): Promise<Track[]> {
  const data = await getJson<{ tracks: Track[] }>('/api/v1/music/tracks/shared')
  return data.tracks ?? []
}

export function previewSharedTrack(shareToken: string): Promise<Track> {
  return getJson<Track>(`/api/v1/music/tracks/shared/${encodeURIComponent(shareToken)}`)
}

export function fetchTrack(trackId: number): Promise<Track> {
  return getJson<Track>(`/api/v1/music/tracks/${trackId}`)
}

export function importTrack(file: File, options: ImportTrackOptions): Promise<Track> {
  const form = new FormData()
  form.append('file', file)
  form.append('scope', options.scope)
  if (options.title?.trim()) form.append('title', options.title.trim())
  if (options.artist?.trim()) form.append('artist', options.artist.trim())
  if (options.album?.trim()) form.append('album', options.album.trim())
  if (options.durationSec) form.append('durationSec', String(options.durationSec))
  if (options.categoryId) form.append('categoryId', String(options.categoryId))
  return postForm<Track>('/api/v1/music/tracks/import', form)
}

export function updateTrack(trackId: number, payload: TrackUpdatePayload): Promise<Track> {
  return request<Track>(`/api/v1/music/tracks/${trackId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteTrack(trackId: number): Promise<void> {
  return deleteJson<void>(`/api/v1/music/tracks/${trackId}`)
}

export function shareTrack(trackId: number): Promise<ShareLink> {
  return postJson<ShareLink>(`/api/v1/music/tracks/${trackId}/share`, {})
}

/** 音频流地址。浏览器播放前需要用 getBlob 带 Bearer 拉取，再由 blob URL 播放。 */
export function trackStreamPath(trackId: number): string {
  return `/api/v1/music/tracks/${trackId}/stream`
}

export async function fetchCategories(): Promise<Category[]> {
  const data = await getJson<{ categories: Category[] }>('/api/v1/music/categories')
  return data.categories ?? []
}

export function createCategory(name: string, sortOrder = 0): Promise<Category> {
  return postJson<Category>('/api/v1/music/categories', { name, sortOrder })
}

export async function fetchPlaylists(): Promise<Playlist[]> {
  const data = await getJson<{ playlists: Playlist[] }>('/api/v1/music/playlists')
  return data.playlists ?? []
}

export function fetchPlaylist(playlistId: number): Promise<PlaylistDetail> {
  return getJson<PlaylistDetail>(`/api/v1/music/playlists/${playlistId}`)
}

export function createPlaylist(name: string, description = ''): Promise<Playlist> {
  return postJson<Playlist>('/api/v1/music/playlists', { name, description })
}

export function deletePlaylist(playlistId: number): Promise<void> {
  return deleteJson<void>(`/api/v1/music/playlists/${playlistId}`)
}

export function addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
  return postJson<void>(`/api/v1/music/playlists/${playlistId}/tracks/${trackId}`, {})
}

export function removeTrackFromPlaylist(
  playlistId: number,
  trackId: number,
): Promise<void> {
  return deleteJson<void>(`/api/v1/music/playlists/${playlistId}/tracks/${trackId}`)
}

export function requestAccess(
  trackId: number,
  shareToken: string,
  message = '',
): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/music/tracks/${trackId}/access-requests`, {
    shareToken,
    message,
  })
}

export async function fetchMyAccessRequests(): Promise<AccessRequest[]> {
  const data = await getJson<{ requests: AccessRequest[] }>(
    '/api/v1/music/access-requests/mine',
  )
  return data.requests ?? []
}

export async function fetchReceivedAccessRequests(
  status?: string,
): Promise<AccessRequest[]> {
  const data = await getJson<{ requests: AccessRequest[] }>(
    `/api/v1/music/access-requests/received${query({ status })}`,
  )
  return data.requests ?? []
}

export function approveAccessRequest(requestId: number): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/music/access-requests/${requestId}/approve`, {})
}

export function rejectAccessRequest(
  requestId: number,
  message = '',
): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/music/access-requests/${requestId}/reject`, {
    message,
  })
}

export function revokeAccessRequest(requestId: number): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/music/access-requests/${requestId}/revoke`, {})
}

export function cancelAccessRequest(requestId: number): Promise<AccessRequest> {
  return postJson<AccessRequest>(`/api/v1/music/access-requests/${requestId}/cancel`, {})
}

export function recordPlayback(
  trackId: number,
  action: string,
  positionSec: number,
): Promise<void> {
  return postJson<void>(`/api/v1/music/tracks/${trackId}/records`, {
    action,
    positionSec: Math.max(0, Math.round(positionSec)),
  })
}

export async function fetchPlaybackRecords(limit = 20): Promise<PlaybackRecord[]> {
  const data = await getJson<{ records: PlaybackRecord[] }>(
    `/api/v1/music/records${query({ limit })}`,
  )
  return data.records ?? []
}
