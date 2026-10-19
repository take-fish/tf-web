export interface Track {
  id: string
  title: string
  artist: string
  durationSec: number
  stage: string
  lyrics: string[]
}

export interface PlaylistSummary {
  id: string
  name: string
  description: string
  buildNumber: number
  trackCount: number
}

export interface PlaylistDetail {
  id: string
  name: string
  buildNumber: number
  tracks: Track[]
}

export type BuildStatus = 'idle' | 'building' | 'paused' | 'success' | 'failed'

export interface BuildLogLine {
  key: string
  time: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
  text: string
}
