import { computed, nextTick, ref, watch, type Ref } from 'vue'

import { useSettingsStore } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import {
  addTrackToPlaylist,
  createPlaylist,
  fetchPlaylist,
  fetchPlaylists,
  recordPlayback,
} from '@/modules/music/musicApi'
import { usePlayerStore } from '@/modules/music/playerStore'
import type { Playlist, PlaylistDetail, Track } from '@/modules/music/types'
import { errorText } from './music-helpers'

interface PlayLogLine {
  key: number
  time: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'OK'
  text: string
}

export function useMusicConsole(tracks: Ref<Track[]>, error: Ref<string>) {
  const settings = useSettingsStore()
  const skinStore = useSkinStore()
  const player = usePlayerStore()

  const notice = ref('')
  const playlists = ref<Playlist[]>([])
  const activePlaylist = ref<PlaylistDetail | null>(null)
  const playlistDraft = ref('')
  const playlistPickerOpen = ref(false)

  const logs = ref<PlayLogLine[]>([])
  const consoleEl = ref<HTMLDivElement | null>(null)

  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let logSeq = 0

  const currentTrack = computed(() => player.currentTrack)
  const progressPercent = computed(() => Math.round(player.progress * 100))
  const statusLabel = computed(() => {
    const labels: Record<string, string> = {
      idle: '空闲',
      loading: '缓冲中',
      playing: '播放中',
      paused: '已暂停',
      ended: '播放完成',
      error: '播放失败',
    }
    return labels[player.status] ?? '空闲'
  })
  const statusTone = computed(() => {
    if (player.status === 'error') return 'err'
    if (player.status === 'ended') return 'ok'
    if (player.status === 'playing' || player.status === 'loading') return 'warn'
    return 'idle'
  })

  function showNotice(message: string) {
    notice.value = message
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice.value = ''
    }, 2600)
  }

  function log(level: PlayLogLine['level'], text: string) {
    const now = new Date()
    const time = now.toLocaleTimeString('zh-CN', { hour12: false })
    logs.value.push({ key: ++logSeq, time, level, text })
    if (logs.value.length > 120) logs.value.splice(0, logs.value.length - 120)
  }

  function clock(seconds: number): string {
    const safe = Math.max(0, Math.round(seconds || 0))
    const minutes = Math.floor(safe / 60)
    const rest = safe % 60
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }

  function sizeText(bytes: number): string {
    if (!bytes) return '—'
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  function record(action: string, position = player.position) {
    const track = currentTrack.value
    if (!track) return
    void recordPlayback(track.id, action, position).catch(() => {
      // 播放埋点失败不影响主流程
    })
  }

  async function playTrack(track: Track) {
    if (currentTrack.value?.id === track.id && player.status !== 'error') {
      player.toggle()
      record(player.status === 'paused' ? 'resume' : 'pause')
      log('INFO', `${player.status === 'paused' ? 'resume' : 'pause'} ${track.title}`)
      return
    }
    log('INFO', `GET /api/v1/music/tracks/${track.id}/stream`)
    log('INFO', `track "${track.title}" scope=${track.scope} owner=${track.ownerNickname || '—'}`)
    await player.play(track)
    if (player.status === 'error') {
      log('ERROR', player.errorMessage || '音频加载失败')
      return
    }
    log('OK', 'stream ready · Range 已启用')
    record('start', 0)
  }

  function primaryAction() {
    if (!currentTrack.value) {
      if (tracks.value[0]) void playTrack(tracks.value[0])
      return
    }
    player.toggle()
    record(player.status === 'paused' ? 'pause' : 'resume')
  }

  function restart() {
    if (!currentTrack.value) return
    void player.play(currentTrack.value).then(() => record('start', 0))
  }

  function onSeek(event: Event) {
    const ratio = Number((event.target as HTMLInputElement).value) / 1000
    player.seek(ratio)
    record('seek')
  }

  function onVolume(event: Event) {
    settings.update({ volume: Number((event.target as HTMLInputElement).value) })
  }

  async function loadPlaylists() {
    try {
      playlists.value = await fetchPlaylists()
      if (playlists.value[0]) await selectPlaylist(playlists.value[0].id)
    } catch {
      playlists.value = []
      activePlaylist.value = null
    }
  }

  async function selectPlaylist(playlistId: number) {
    try {
      activePlaylist.value = await fetchPlaylist(playlistId)
    } catch (value) {
      error.value = errorText(value)
    }
  }

  async function submitPlaylist() {
    const name = playlistDraft.value.trim()
    if (!name) return
    try {
      const created = await createPlaylist(name)
      playlistDraft.value = ''
      await loadPlaylists()
      await selectPlaylist(created.id)
    } catch (value) {
      error.value = errorText(value)
    }
  }

  function openPlaylistPicker() {
    playlistPickerOpen.value = true
    void loadPlaylists()
  }

  async function addToPlaylist(playlistId: number) {
    if (!currentTrack.value) return
    try {
      await addTrackToPlaylist(playlistId, currentTrack.value.id)
      playlistPickerOpen.value = false
      if (activePlaylist.value?.playlist.id === playlistId) await selectPlaylist(playlistId)
      showNotice('已加入歌单')
    } catch (value) {
      error.value = errorText(value)
    }
  }

  function disposeNotice() {
    if (noticeTimer) clearTimeout(noticeTimer)
  }

  watch(
    () => settings.state.volume,
    (value) => player.setVolume(value),
  )

  watch(
    () => skinStore.bossActive,
    (active) => {
      if (active) player.pause()
    },
  )

  watch(
    () => player.status,
    (status) => {
      if (status === 'ended') {
        record('complete')
        log('OK', `完成播放 ${currentTrack.value?.title ?? ''}`)
      } else if (status === 'error' && player.errorMessage) {
        log('ERROR', player.errorMessage)
      }
    },
  )

  watch(
    () => logs.value.length,
    async () => {
      await nextTick()
      if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
    },
  )

  return {
    player,
    currentTrack,
    progressPercent,
    statusLabel,
    statusTone,
    notice,
    logs,
    consoleEl,
    playlists,
    activePlaylist,
    playlistDraft,
    playlistPickerOpen,
    showNotice,
    log,
    clock,
    sizeText,
    playTrack,
    primaryAction,
    restart,
    onSeek,
    onVolume,
    loadPlaylists,
    selectPlaylist,
    submitPlaylist,
    openPlaylistPicker,
    addToPlaylist,
    disposeNotice,
  }
}
