import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { BuildStatus, Track } from './types'

export const usePlayerStore = defineStore('music-player', () => {
  const currentTrack = ref<Track | null>(null)
  const currentIndex = ref(-1)
  const position = ref(0)
  const duration = ref(0)
  const status = ref<BuildStatus>('idle')
  const usingAudio = ref(false)
  const audioName = ref('')
  const volume = ref(0.6)
  const audioTrackId = ref<string | null>(null)

  let audioEl: HTMLAudioElement | null = null
  let objectUrl: string | null = null
  let simulatedTimer: ReturnType<typeof setInterval> | undefined

  const progress = computed(() => {
    if (duration.value <= 0) return 0
    return Math.min(1, Math.max(0, position.value / duration.value))
  })

  const hasLocalAudio = computed(() => Boolean(audioTrackId.value))

  function clearSimulation() {
    if (simulatedTimer) {
      clearInterval(simulatedTimer)
      simulatedTimer = undefined
    }
  }

  function startSimulation() {
    if (!currentTrack.value) return
    usingAudio.value = false
    duration.value = currentTrack.value.durationSec
    clearSimulation()
    simulatedTimer = setInterval(() => {
      position.value = Math.min(duration.value, position.value + 0.25)
      if (position.value >= duration.value) {
        status.value = 'success'
        clearSimulation()
      }
    }, 250)
  }

  function start(track: Track, index: number) {
    clearSimulation()
    if (audioEl) {
      audioEl.pause()
      audioEl.currentTime = 0
    }
    currentTrack.value = track
    currentIndex.value = index
    position.value = 0
    duration.value = track.durationSec
    status.value = 'building'
    if (audioEl && audioTrackId.value === track.id) {
      usingAudio.value = true
      audioEl.volume = volume.value
      const playPromise = audioEl.play()
      if (playPromise?.catch) {
        playPromise.catch(() => {
          usingAudio.value = false
          startSimulation()
        })
      }
    } else {
      startSimulation()
    }
  }

  function pause() {
    if (status.value !== 'building') return
    clearingAndPause()
    status.value = 'paused'
  }

  function clearingAndPause() {
    clearSimulation()
    if (usingAudio.value && audioEl) {
      audioEl.pause()
    }
  }

  function resume() {
    if (status.value !== 'paused') return
    status.value = 'building'
    if (usingAudio.value && audioEl) {
      const playPromise = audioEl.play()
      if (playPromise?.catch) {
        playPromise.catch(() => {
          usingAudio.value = false
          startSimulation()
        })
      }
    } else {
      startSimulation()
    }
  }

  function toggle() {
    if (status.value === 'building') pause()
    else if (status.value === 'paused') resume()
  }

  function seek(ratio: number) {
    const clamped = Math.min(1, Math.max(0, ratio))
    if (usingAudio.value && audioEl && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = clamped * audioEl.duration
      position.value = audioEl.currentTime
      if (clamped >= 0.995 && status.value === 'building') {
        status.value = 'success'
      }
      return
    }
    if (duration.value > 0) {
      position.value = clamped * duration.value
      if (clamped >= 0.995 && status.value === 'building') {
        status.value = 'success'
      }
    }
  }

  function setVolume(value: number) {
    volume.value = Math.min(1, Math.max(0, value))
    if (audioEl) audioEl.volume = volume.value
  }

  function attachAudio(file: File, trackId: string): boolean {
    if (typeof Audio === 'undefined' || typeof URL === 'undefined') return false
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    audioEl?.pause()
    objectUrl = URL.createObjectURL(file)
    audioEl = new Audio(objectUrl)
    audioEl.volume = volume.value
    audioEl.preload = 'metadata'
    audioTrackId.value = trackId
    audioName.value = file.name

    audioEl.addEventListener('loadedmetadata', () => {
      if (currentTrack.value?.id === trackId && Number.isFinite(audioEl?.duration)) {
        duration.value = audioEl?.duration ?? duration.value
      }
    })
    audioEl.addEventListener('timeupdate', () => {
      if (!audioEl || !usingAudio.value) return
      position.value = audioEl.currentTime
    })
    audioEl.addEventListener('ended', () => {
      if (!usingAudio.value) return
      status.value = 'success'
      position.value = duration.value
    })
    audioEl.addEventListener('error', () => {
      if (!usingAudio.value) return
      usingAudio.value = false
      status.value = 'failed'
    })
    return true
  }

  return {
    currentTrack,
    currentIndex,
    position,
    duration,
    status,
    usingAudio,
    audioName,
    volume,
    audioTrackId,
    hasLocalAudio,
    progress,
    start,
    pause,
    resume,
    toggle,
    seek,
    setVolume,
    attachAudio,
  }
})
