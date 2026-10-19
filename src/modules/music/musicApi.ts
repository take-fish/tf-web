import { getJson, postJson } from '@/lib/http'
import type { PlaylistDetail, PlaylistSummary } from './types'

export async function fetchPlaylists(): Promise<PlaylistSummary[]> {
  const data = await getJson<{ playlists: PlaylistSummary[] }>('/api/v1/music/playlists')
  return data.playlists ?? []
}

export function fetchPlaylist(playlistId: string): Promise<PlaylistDetail> {
  return getJson<PlaylistDetail>(`/api/v1/music/playlists/${encodeURIComponent(playlistId)}`)
}

export function postPlaybackRecord(payload: {
  playlistId: string
  trackId: string
  userId: string
  action: string
  positionSec: number
}): Promise<void> {
  const { playlistId, ...body } = payload
  return postJson<void>(
    `/api/v1/music/playlists/${encodeURIComponent(playlistId)}/records`,
    body,
  )
}
