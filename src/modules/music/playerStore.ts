import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { formatApiError, getBlob } from '@/lib/http'
import { trackStreamPath } from './musicApi'
import type { PlayStatus, Track } from './types'

/**
 * 音频播放器。后端音频接口需要 Bearer 头，<audio src> 无法携带，
 * 因此先用 getBlob 取回再生成 blob URL；后端 Range 能力仍对原生播放器生效。
 */
export const usePlayerStore = defineStore('music-player', () => {
  const currentTrack = ref<Track | null>(null)
  const status = ref<PlayStatus>('idle')
  const position = ref(0)
  const duration = ref(0)
  const volume = ref(0.6)
  const errorMessage = ref('')

  let audioEl: HTMLAudioElement | null = null
  let objectUrl: string | null = null
  let loadToken = 0

  const progress = computed(() => {
    if (duration.value <= 0) return 0
    return Math.min(1, Math.max(0, position.value / duration.value))
  })

  const isPlaying = computed(() => status.value === 'playing')

  function releaseAudio() {
    if (audioEl) {
      audioEl.pause()
      audioEl.onloadedmetadata = null
      audioEl.ontimeupdate = null
      audioEl.onended = null
      audioEl.onerror = null
      audioEl.src = ''
      audioEl = null
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
  }

  function attachEvents() {
    if (!audioEl) return
    audioEl.onloadedmetadata = () => {
      if (audioEl && Number.isFinite(audioEl.duration)) duration.value = audioEl.duration
    }
    audioEl.ontimeupdate = () => {
      if (audioEl) position.value = audioEl.currentTime
    }
    audioEl.onended = () => {
      status.value = 'ended'
      position.value = duration.value
    }
    audioEl.onerror = () => {
      status.value = 'error'
      errorMessage.value = '音频解码失败或文件不可读'
    }
  }

  async function play(track: Track) {
    const token = ++loadToken
    releaseAudio()
    currentTrack.value = track
    status.value = 'loading'
    position.value = 0
    duration.value = track.durationSec
    errorMessage.value = ''
    try {
      const blob = await getBlob(trackStreamPath(track.id))
      if (token !== loadToken) return
      objectUrl = URL.createObjectURL(blob)
      audioEl = new Audio(objectUrl)
      audioEl.volume = volume.value
      audioEl.preload = 'metadata'
      attachEvents()
      status.value = 'playing'
      await audioEl.play()
    } catch (error) {
      if (token !== loadToken) return
      status.value = 'error'
      errorMessage.value = formatApiError(error, '音频加载失败')
    }
  }

  function pause() {
    if (status.value !== 'playing') return
    audioEl?.pause()
    status.value = 'paused'
  }

  function resume() {
    if (status.value !== 'paused' || !audioEl) return
    status.value = 'playing'
    const promise = audioEl.play()
    if (promise?.catch) {
      promise.catch(() => {
        status.value = 'error'
        errorMessage.value = '播放被浏览器拦截，请再次点击播放'
      })
    }
  }

  function toggle() {
    if (status.value === 'playing') pause()
    else if (status.value === 'paused') resume()
    else if (currentTrack.value) void play(currentTrack.value)
  }

  function seekTo(seconds: number) {
    if (!audioEl || !Number.isFinite(audioEl.duration)) {
      position.value = Math.min(duration.value, Math.max(0, seconds))
      return
    }
    audioEl.currentTime = Math.min(audioEl.duration, Math.max(0, seconds))
    position.value = audioEl.currentTime
  }

  function seek(ratio: number) {
    const clamped = Math.min(1, Math.max(0, ratio))
    seekTo(clamped * (duration.value || currentTrack.value?.durationSec || 0))
  }

  function setVolume(value: number) {
    volume.value = Math.min(1, Math.max(0, value))
    if (audioEl) audioEl.volume = volume.value
  }

  function stop() {
    loadToken += 1
    releaseAudio()
    status.value = 'idle'
    position.value = 0
    duration.value = 0
    currentTrack.value = null
  }

  function markUnavailable() {
    loadToken += 1
    releaseAudio()
    status.value = 'error'
    errorMessage.value = '当前身份无权播放该曲目'
  }

  return {
    currentTrack,
    status,
    position,
    duration,
    volume,
    errorMessage,
    progress,
    isPlaying,
    play,
    pause,
    resume,
    toggle,
    seek,
    seekTo,
    setVolume,
    stop,
    markUnavailable,
  }
})
