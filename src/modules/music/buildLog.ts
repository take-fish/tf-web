import type { BuildLogLine, BuildStatus } from './types'

interface Milestone {
  threshold: number
  level: BuildLogLine['level']
  text: string
}

const MILESTONES: readonly Milestone[] = [
  { threshold: 0, level: 'INFO', text: 'Started by user dev' },
  { threshold: 0.03, level: 'INFO', text: 'Cloning repository git@fishmatrix/internal.git' },
  { threshold: 0.1, level: 'INFO', text: 'Resolving dependencies from internal mirror' },
  { threshold: 0.18, level: 'INFO', text: 'Compiling module fishmatrix-core' },
  { threshold: 0.34, level: 'INFO', text: 'Running unit tests (128 specs)' },
  { threshold: 0.5, level: 'INFO', text: 'Archiving artifact target/fishmatrix.jar' },
  { threshold: 0.64, level: 'INFO', text: 'Uploading artifact to package registry' },
  { threshold: 0.78, level: 'INFO', text: 'Deploying build to staging cluster' },
  { threshold: 0.9, level: 'INFO', text: 'Running smoke checks on staging' },
  { threshold: 0.98, level: 'INFO', text: 'Publishing release metadata' },
]

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = Math.floor(safe % 60)
  const tenths = Math.floor((safe % 1) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${tenths}`
}

export function buildLogLines(input: {
  progress: number
  positionSec: number
  durationSec: number
  trackTitle: string
  lyrics: string[]
  status: BuildStatus
}): BuildLogLine[] {
  const progress = Math.min(1, Math.max(0, input.progress))
  const duration = Math.max(1, input.durationSec)
  const lines: BuildLogLine[] = []

  for (const milestone of MILESTONES) {
    if (progress + 0.001 < milestone.threshold) continue
    lines.push({
      key: `m-${milestone.threshold}-${milestone.text}`,
      time: formatTime(milestone.threshold * duration),
      level: milestone.level,
      text: milestone.text,
    })
  }

  const lyricStart = 0.22
  const lyricSpan = 0.56
  input.lyrics.forEach((lyric, index) => {
    const threshold = lyricStart + ((index + 1) / (input.lyrics.length + 1)) * lyricSpan
    if (progress + 0.001 < threshold) return
    lines.push({
      key: `lyric-${index}`,
      time: formatTime(threshold * duration),
      level: 'INFO',
      text: `[lyric] ${lyric}`,
    })
  })

  if (progress >= 0.995 && input.status !== 'failed') {
    lines.push({
      key: 'finish-success',
      time: formatTime(duration),
      level: 'SUCCESS',
      text: 'BUILD SUCCESS',
    })
  }

  if (input.status === 'paused') {
    lines.push({
      key: 'paused',
      time: formatTime(input.positionSec),
      level: 'WARN',
      text: 'Build paused, waiting for available executor',
    })
  } else if (input.status === 'failed') {
    lines.push({
      key: 'failed',
      time: formatTime(input.positionSec),
      level: 'ERROR',
      text: 'BUILD FAILED: unable to load audio source',
    })
  } else if (input.status === 'building' && progress < 0.995) {
    lines.push({
      key: 'running',
      time: formatTime(input.positionSec),
      level: 'INFO',
      text: `Building ${input.trackTitle}...`,
    })
  }

  return lines
}
