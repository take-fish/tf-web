<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import {
  addTrackToPlaylist,
  approveAccessRequest,
  cancelAccessRequest,
  createCategory,
  createPlaylist,
  deleteTrack,
  fetchCategories,
  fetchMyAccessRequests,
  fetchMyTracks,
  fetchPlaylist,
  fetchPlaylists,
  fetchReceivedAccessRequests,
  fetchSharedTracks,
  fetchTracks,
  importTrack,
  previewSharedTrack,
  recordPlayback,
  rejectAccessRequest,
  requestAccess,
  revokeAccessRequest,
  shareTrack,
  updateTrack,
} from '@/modules/music/musicApi'
import { usePlayerStore } from '@/modules/music/playerStore'
import type {
  AccessRequest,
  Category,
  ContentStatus,
  Playlist,
  PlaylistDetail,
  Track,
} from '@/modules/music/types'

interface PlayLogLine {
  key: number
  time: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'OK'
  text: string
}

const auth = useAuthStore()
const settings = useSettingsStore()
const skinStore = useSkinStore()
const player = usePlayerStore()

const mode = ref<'public' | 'private' | 'shared'>('public')
const tracks = ref<Track[]>([])
const categories = ref<Category[]>([])
const categoryFilter = ref<number | null>(null)
const searchQuery = ref('')
const loading = ref(false)
const error = ref('')
const notice = ref('')

const playlists = ref<Playlist[]>([])
const activePlaylist = ref<PlaylistDetail | null>(null)
const playlistDraft = ref('')

const shareTokenInput = ref('')
const sharePreview = ref<Track | null>(null)
const sharePreviewToken = ref('')
const applying = ref(false)
const applyMessage = ref('')
const applyError = ref('')

const shareOpen = ref(false)
const shareToken = ref('')
const shareError = ref('')

const importOpen = ref(false)
const importFile = ref<File | null>(null)
const importTitle = ref('')
const importArtist = ref('')
const importAlbum = ref('')
const importScope = ref<'public' | 'private'>('public')
const importCategoryId = ref<number | null>(null)
const importing = ref(false)
const importError = ref('')

const editOpen = ref(false)
const editTitle = ref('')
const editArtist = ref('')
const editAlbum = ref('')
const editCategoryId = ref<number | null>(null)
const editStatus = ref<ContentStatus>('VISIBLE')
const editError = ref('')
const savingEdit = ref(false)

const playlistPickerOpen = ref(false)
const requestsOpen = ref(false)
const receivedRequests = ref<AccessRequest[]>([])
const myRequests = ref<AccessRequest[]>([])

const logs = ref<PlayLogLine[]>([])
const consoleEl = ref<HTMLDivElement | null>(null)
const categoryDraft = ref('')
const categoryEditorOpen = ref(false)

let noticeTimer: ReturnType<typeof setTimeout> | undefined
let logSeq = 0

const canUploadPublic = computed(() => auth.hasPermission('music.public.upload'))
const canManagePrivate = computed(() => auth.hasPermission('music.private.manage'))
const canManageCategory = computed(() => auth.hasPermission('music.category.manage'))
const canImport = computed(() =>
  mode.value === 'private' ? canManagePrivate.value : canUploadPublic.value,
)
const pendingIncoming = computed(
  () => receivedRequests.value.filter((item) => item.status === 'PENDING').length,
)
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

function errorText(value: unknown): string {
  return formatApiError(value)
}

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

async function loadCategories() {
  try {
    categories.value = await fetchCategories()
  } catch {
    // 分类加载失败不影响播放
  }
}

async function loadTracks() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'private') {
      tracks.value = await fetchMyTracks()
    } else if (mode.value === 'shared') {
      tracks.value = await fetchSharedTracks()
    } else {
      const page = await fetchTracks({
        scope: 'public',
        categoryId: categoryFilter.value,
        q: searchQuery.value,
      })
      tracks.value = page.tracks
    }
  } catch (value) {
    error.value = errorText(value)
    tracks.value = []
  } finally {
    loading.value = false
  }
}

async function switchMode(next: 'public' | 'private' | 'shared') {
  if (mode.value === next) return
  mode.value = next
  sharePreview.value = null
  shareTokenInput.value = ''
  await loadTracks()
}

async function submitCategory() {
  const name = categoryDraft.value.trim()
  if (!name) return
  try {
    await createCategory(name)
    categoryDraft.value = ''
    categoryEditorOpen.value = false
    await loadCategories()
  } catch (value) {
    error.value = errorText(value)
  }
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

function openImport() {
  if (!canImport.value) {
    error.value =
      mode.value === 'private' ? '没有管理个人曲库的权限' : '没有向公共曲库上传的权限'
    return
  }
  importOpen.value = true
  importError.value = ''
  importFile.value = null
  importTitle.value = ''
  importArtist.value = ''
  importAlbum.value = ''
  importScope.value = mode.value === 'private' ? 'private' : 'public'
  importCategoryId.value = categoryFilter.value
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  if (importFile.value && !importTitle.value) {
    importTitle.value = importFile.value.name.replace(/\.[^.]+$/, '')
  }
}

async function submitImport() {
  if (!importFile.value || importing.value) {
    importError.value = '请选择音频文件'
    return
  }
  importing.value = true
  importError.value = ''
  try {
    const created = await importTrack(importFile.value, {
      scope: importScope.value,
      title: importTitle.value,
      artist: importArtist.value,
      album: importAlbum.value,
      categoryId: importScope.value === 'public' ? importCategoryId.value : null,
    })
    importOpen.value = false
    mode.value = importScope.value === 'private' ? 'private' : 'public'
    await loadCategories()
    await loadTracks()
    showNotice(`已导入 ${created.title}`)
  } catch (value) {
    importError.value = errorText(value)
  } finally {
    importing.value = false
  }
}

async function openShare(track: Track) {
  shareOpen.value = true
  shareToken.value = ''
  shareError.value = ''
  try {
    const link = await shareTrack(track.id)
    shareToken.value = link.shareToken
  } catch (value) {
    shareError.value = errorText(value)
  }
}

async function copyShareToken() {
  if (!shareToken.value) return
  try {
    await navigator.clipboard.writeText(shareToken.value)
    shareError.value = '已复制分享码'
  } catch {
    shareError.value = '复制失败，请手动选择分享码'
  }
}

function openEdit(track: Track) {
  editOpen.value = true
  editTitle.value = track.title
  editArtist.value = track.artist
  editAlbum.value = track.album
  editCategoryId.value = track.categoryId
  editStatus.value = track.status
  editError.value = ''
}

async function submitEdit() {
  if (!currentEditId.value || savingEdit.value) return
  savingEdit.value = true
  editError.value = ''
  try {
    await updateTrack(currentEditId.value, {
      title: editTitle.value.trim(),
      artist: editArtist.value.trim(),
      album: editAlbum.value.trim(),
      categoryId: editCategoryId.value,
      status: editStatus.value,
    })
    editOpen.value = false
    await loadTracks()
  } catch (value) {
    editError.value = errorText(value)
  } finally {
    savingEdit.value = false
  }
}

const currentEditId = ref<number | null>(null)

function openEditFor(track: Track) {
  currentEditId.value = track.id
  openEdit(track)
}

async function removeTrack(track: Track) {
  if (!window.confirm(`确认删除「${track.title}」？音频文件会一并删除。`)) return
  try {
    await deleteTrack(track.id)
    if (currentTrack.value?.id === track.id) player.stop()
    await loadTracks()
  } catch (value) {
    error.value = errorText(value)
  }
}

async function lookupShare() {
  const token = shareTokenInput.value.trim()
  if (!token) return
  error.value = ''
  applyError.value = ''
  try {
    sharePreview.value = await previewSharedTrack(token)
    sharePreviewToken.value = token
  } catch (value) {
    sharePreview.value = null
    error.value = errorText(value)
  }
}

async function submitAccessRequest() {
  if (!sharePreview.value || applying.value) return
  applying.value = true
  applyError.value = ''
  try {
    await requestAccess(sharePreview.value.id, sharePreviewToken.value, applyMessage.value)
    sharePreview.value = null
    shareTokenInput.value = ''
    applyMessage.value = ''
    await loadTracks()
    showNotice('申请已提交，等待所有者处理')
  } catch (value) {
    applyError.value = errorText(value)
  } finally {
    applying.value = false
  }
}

async function openRequests() {
  requestsOpen.value = true
  await refreshRequests()
}

async function refreshRequests() {
  try {
    const [received, mine] = await Promise.all([
      fetchReceivedAccessRequests(),
      fetchMyAccessRequests(),
    ])
    receivedRequests.value = received
    myRequests.value = mine
  } catch (value) {
    error.value = errorText(value)
  }
}

async function decideRequest(
  request: AccessRequest,
  action: 'approve' | 'reject' | 'revoke' | 'cancel',
) {
  try {
    if (action === 'approve') await approveAccessRequest(request.id)
    else if (action === 'reject') await rejectAccessRequest(request.id)
    else if (action === 'revoke') await revokeAccessRequest(request.id)
    else await cancelAccessRequest(request.id)
    await refreshRequests()
    if (mode.value === 'shared') await loadTracks()
  } catch (value) {
    error.value = errorText(value)
  }
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

onMounted(async () => {
  player.setVolume(settings.state.volume)
  log('INFO', 'player initialized · auth from user center')
  await Promise.all([loadCategories(), loadTracks(), loadPlaylists()])
  void refreshRequests()
})

onBeforeUnmount(() => {
  player.pause()
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="music">
    <header class="music__head">
      <div class="music__crumbs">
        <span>音乐库</span>
        <AppIcon name="chevron" :size="11" />
        <b>{{ currentTrack?.title ?? '未选择曲目' }}</b>
        <span v-if="currentTrack" class="music__build">
          {{ currentTrack.scope === 'PRIVATE' ? '私有' : '公共' }}
        </span>
      </div>
      <span class="music__status" :class="`music__status--${statusTone}`">
        <i class="dot" />
        {{ statusLabel }}
      </span>
      <span class="music__head-spacer" />
      <label class="music__volume">
        <span>音量</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="settings.state.volume"
          @input="onVolume"
        />
        <em>{{ Math.round(settings.state.volume * 100) }}%</em>
      </label>
      <button class="music__btn" @click="openRequests">
        访问申请
        <em v-if="pendingIncoming > 0" class="music__badge">{{ pendingIncoming }}</em>
      </button>
      <button v-if="canImport" class="music__btn music__btn--primary" @click="openImport">
        <AppIcon name="import" :size="11" />
        上传曲目
      </button>
    </header>

    <div class="music__body">
      <aside class="music__side">
        <div class="music__side-head">
          <span>曲库</span>
          <em>{{ tracks.length }}</em>
        </div>
        <div class="music__tabs">
          <button
            class="music__tab"
            :class="{ 'is-active': mode === 'public' }"
            @click="switchMode('public')"
          >
            公共库
          </button>
          <button
            v-if="canManagePrivate"
            class="music__tab"
            :class="{ 'is-active': mode === 'private' }"
            @click="switchMode('private')"
          >
            私有库
          </button>
          <button
            class="music__tab"
            :class="{ 'is-active': mode === 'shared' }"
            @click="switchMode('shared')"
          >
            共享
          </button>
        </div>

        <form v-if="mode === 'public'" class="music__filter" @submit.prevent="loadTracks">
          <input v-model="searchQuery" maxlength="64" placeholder="搜索曲名 / 歌手" />
          <select v-model="categoryFilter" @change="loadTracks">
            <option :value="null">全部分类</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
          <button
            v-if="canManageCategory"
            type="button"
            class="music__mini"
            title="新建分类"
            @click="categoryEditorOpen = !categoryEditorOpen"
          >
            +
          </button>
          <div v-if="categoryEditorOpen" class="music__filter-inline">
            <input v-model="categoryDraft" maxlength="32" placeholder="新分类名称" />
            <button type="button" @click="submitCategory">保存</button>
          </div>
        </form>

        <form v-if="mode === 'shared'" class="music__filter" @submit.prevent="lookupShare">
          <input v-model="shareTokenInput" placeholder="粘贴分享码" />
          <button type="submit">查询</button>
        </form>

        <button
          v-for="track in tracks"
          :key="track.id"
          class="music__track"
          :class="{ 'is-active': currentTrack?.id === track.id }"
          @click="playTrack(track)"
        >
          <span class="music__track-icon" :class="{ 'is-playing': currentTrack?.id === track.id && player.isPlaying }">
            <AppIcon :name="currentTrack?.id === track.id && player.isPlaying ? 'pause' : 'play'" :size="9" />
          </span>
          <span class="music__track-body">
            <b>{{ track.title }}</b>
            <em>
              {{ track.artist || '未知歌手' }} · {{ clock(track.durationSec) }}
              <template v-if="track.scope === 'PRIVATE'"> · 私有</template>
            </em>
          </span>
          <span class="music__track-owner">{{ track.mine ? '我' : track.ownerNickname || '—' }}</span>
        </button>
        <p v-if="tracks.length === 0" class="music__empty">
          {{ mode === 'shared' ? '暂无授权给你的共享曲目' : mode === 'private' ? '私有库还是空的' : '公共库暂无曲目' }}
        </p>

        <div v-if="currentTrack" class="music__side-actions">
          <button class="music__mini" @click="openPlaylistPicker">加入歌单</button>
          <button v-if="currentTrack.canEdit" class="music__mini" @click="openEditFor(currentTrack)">编辑</button>
          <button
            v-if="currentTrack.scope === 'PRIVATE' && currentTrack.mine"
            class="music__mini"
            @click="openShare(currentTrack)"
          >
            分享
          </button>
          <button v-if="currentTrack.canDelete" class="music__mini music__mini--danger" @click="removeTrack(currentTrack)">删除</button>
        </div>
      </aside>

      <section class="music__console-panel">
        <header class="music__console-head">
          <div class="music__job">
            <b>{{ currentTrack?.title ?? '等待播放任务' }}</b>
            <span v-if="currentTrack">
              {{ currentTrack.artist || '未知歌手' }} · {{ currentTrack.album || '无专辑' }}
              <template v-if="currentTrack.categoryName"> · {{ currentTrack.categoryName }}</template>
            </span>
            <span v-else>从左侧曲库选择曲目开始播放</span>
          </div>
          <span class="music__progress-label">{{ progressPercent }}%</span>
          <span class="music__time">
            {{ clock(player.position) }} / {{ clock(player.duration || currentTrack?.durationSec || 0) }}
          </span>
        </header>
        <div class="music__bar">
          <i :style="{ width: `${progressPercent}%` }" :class="`music__bar--${statusTone}`" />
        </div>

        <div ref="consoleEl" class="music__console">
          <div
            v-for="line in logs"
            :key="line.key"
            class="music__log"
            :class="`music__log--${line.level.toLowerCase()}`"
          >
            <time>[{{ line.time }}]</time>
            <span class="music__log-level">[{{ line.level }}]</span>
            <span>{{ line.text }}</span>
          </div>
          <div v-if="player.status === 'error' && player.errorMessage" class="music__log music__log--error">
            <time>[--:--]</time>
            <span class="music__log-level">[ERROR]</span>
            <span>{{ player.errorMessage }}</span>
          </div>
          <div class="music__log-cursor">
            <span class="music__prompt">$</span>
            <span class="music__caret" />
          </div>
        </div>

        <footer class="music__controls">
          <button class="music__primary" :disabled="!currentTrack && tracks.length === 0" @click="primaryAction">
            <AppIcon :name="player.isPlaying ? 'pause' : 'play'" :size="11" />
            {{ player.isPlaying ? '暂停' : player.status === 'paused' ? '继续' : '播放' }}
          </button>
          <button class="music__btn" :disabled="!currentTrack" @click="restart">重新开始</button>
          <input
            type="range"
            min="0"
            max="1000"
            :value="Math.round(player.progress * 1000)"
            :disabled="!currentTrack"
            class="music__seek"
            @input="onSeek"
          />
          <span class="music__controls-spacer" />
          <span class="music__shortcut">
            {{ currentTrack ? `${sizeText(currentTrack.fileSize)} · ${currentTrack.contentType}` : 'HTTP Range · Bearer 鉴权' }}
          </span>
        </footer>
      </section>

      <aside class="music__rail">
        <div class="music__side-head">
          <span>播放列表</span>
          <em>{{ playlists.length }}</em>
        </div>
        <form class="music__rail-form" @submit.prevent="submitPlaylist">
          <input v-model="playlistDraft" maxlength="64" placeholder="新建歌单" />
          <button type="submit">+</button>
        </form>
        <button
          v-for="item in playlists"
          :key="item.id"
          class="music__playlist"
          :class="{ 'is-active': activePlaylist?.playlist.id === item.id }"
          @click="selectPlaylist(item.id)"
        >
          <AppIcon name="bookmark" :size="12" />
          <span>{{ item.name }}</span>
          <em>{{ item.trackCount }}</em>
        </button>
        <template v-if="activePlaylist">
          <div class="music__side-head music__side-head--sub">
            <span>{{ activePlaylist.playlist.name }}</span>
            <em>{{ activePlaylist.tracks.length }}</em>
          </div>
          <button
            v-for="track in activePlaylist.tracks"
            :key="`pl-${track.id}`"
            class="music__playlist-track"
            :class="{ 'is-active': currentTrack?.id === track.id }"
            @click="playTrack(track)"
          >
            <AppIcon name="play" :size="9" />
            <span>{{ track.title }}</span>
            <em>{{ clock(track.durationSec) }}</em>
          </button>
          <p v-if="activePlaylist.tracks.length === 0" class="music__empty">歌单还是空的</p>
        </template>
        <p v-if="playlists.length === 0" class="music__empty">还没有歌单</p>
      </aside>
    </div>

    <div v-if="sharePreview" class="overlay" @click.self="sharePreview = null">
      <div class="sheet music__sheet">
        <header class="sheet__head">
          <div>
            <h2>{{ sharePreview.title }}</h2>
            <p>私有曲目 · 所有者 {{ sharePreview.ownerNickname || '—' }}</p>
          </div>
          <button type="button" class="icon-button" @click="sharePreview = null">×</button>
        </header>
        <div class="music__sheet-body">
          <p class="music__hint">
            分享码只用于发现内容，不等于授权。提交申请后需由所有者批准，管理员也不能直接读取私有曲目。
          </p>
          <textarea v-model="applyMessage" rows="3" maxlength="255" placeholder="向所有者说明申请原因（可选）" />
          <p v-if="applyError" class="music__error">{{ applyError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>{{ sharePreview.artist || '未知歌手' }} · {{ clock(sharePreview.durationSec) }}</span>
          <button class="primary-button" :disabled="applying" @click="submitAccessRequest">
            {{ applying ? '提交中…' : '申请访问' }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="importOpen" class="overlay" @click.self="importOpen = false">
      <form class="sheet music__sheet" @submit.prevent="submitImport">
        <header class="sheet__head">
          <div>
            <h2>上传音频</h2>
            <p>支持 mp3 / m4a / aac / ogg / wav / flac / webm，单个不超过 50 MB。</p>
          </div>
          <button type="button" class="icon-button" @click="importOpen = false">×</button>
        </header>
        <div class="music__sheet-body">
          <label class="music__row">
            <span>目标库</span>
            <select v-model="importScope">
              <option v-if="canUploadPublic" value="public">公共曲库（所有人可听）</option>
              <option v-if="canManagePrivate" value="private">个人私有库（仅自己/授权可见）</option>
            </select>
          </label>
          <label class="music__row">
            <span>音频文件</span>
            <input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac,.webm" @change="onImportFile" />
          </label>
          <label class="music__row">
            <span>曲名</span>
            <input v-model="importTitle" maxlength="255" placeholder="留空则取文件名" />
          </label>
          <label class="music__row">
            <span>歌手</span>
            <input v-model="importArtist" maxlength="128" placeholder="可选" />
          </label>
          <label class="music__row">
            <span>专辑</span>
            <input v-model="importAlbum" maxlength="128" placeholder="可选" />
          </label>
          <label
            v-if="importScope === 'public' && canManageCategory && categories.length > 0"
            class="music__row"
          >
            <span>分类</span>
            <select v-model="importCategoryId">
              <option :value="null">未分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <p v-if="importError" class="music__error">{{ importError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>音频落服务端存储卷，数据库只保存元数据</span>
          <button class="primary-button" type="submit" :disabled="importing">
            {{ importing ? '上传中…' : '上传' }}
          </button>
        </footer>
      </form>
    </div>

    <div v-if="shareOpen" class="overlay" @click.self="shareOpen = false">
      <div class="sheet music__sheet">
        <header class="sheet__head">
          <div>
            <h2>分享曲目</h2>
            <p>分享码只允许对方发起访问申请，不直接授予播放权限。</p>
          </div>
          <button type="button" class="icon-button" @click="shareOpen = false">×</button>
        </header>
        <div class="music__sheet-body">
          <label class="music__row">
            <span>分享码</span>
            <input :value="shareToken" readonly placeholder="生成中…" />
          </label>
          <p v-if="shareError" class="music__error">{{ shareError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>可在「共享」标签中预览并申请</span>
          <button class="primary-button" @click="copyShareToken">复制分享码</button>
        </footer>
      </div>
    </div>

    <div v-if="editOpen" class="overlay" @click.self="editOpen = false">
      <form class="sheet music__sheet" @submit.prevent="submitEdit">
        <header class="sheet__head">
          <div>
            <h2>编辑曲目</h2>
            <p>仅上传者本人或内容管理员可以修改。</p>
          </div>
          <button type="button" class="icon-button" @click="editOpen = false">×</button>
        </header>
        <div class="music__sheet-body">
          <label class="music__row">
            <span>曲名</span>
            <input v-model="editTitle" maxlength="255" required />
          </label>
          <label class="music__row">
            <span>歌手</span>
            <input v-model="editArtist" maxlength="128" />
          </label>
          <label class="music__row">
            <span>专辑</span>
            <input v-model="editAlbum" maxlength="128" />
          </label>
          <label v-if="auth.hasPermission('music.category.manage')" class="music__row">
            <span>分类</span>
            <select v-model="editCategoryId">
              <option :value="null">未分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <label v-if="auth.hasPermission('music.content.manage.any')" class="music__row">
            <span>可见状态</span>
            <select v-model="editStatus">
              <option value="VISIBLE">公开可见</option>
              <option value="HIDDEN">隐藏</option>
            </select>
          </label>
          <p v-if="editError" class="music__error">{{ editError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>元数据变更不会影响音频文件</span>
          <button class="primary-button" type="submit" :disabled="savingEdit">
            {{ savingEdit ? '保存中…' : '保存' }}
          </button>
        </footer>
      </form>
    </div>

    <div v-if="playlistPickerOpen" class="overlay" @click.self="playlistPickerOpen = false">
      <div class="sheet music__sheet">
        <header class="sheet__head">
          <div>
            <h2>加入歌单</h2>
            <p>{{ currentTrack?.title ?? '' }}</p>
          </div>
          <button type="button" class="icon-button" @click="playlistPickerOpen = false">×</button>
        </header>
        <div class="music__sheet-body">
          <button
            v-for="item in playlists"
            :key="`pick-${item.id}`"
            class="music__playlist"
            @click="addToPlaylist(item.id)"
          >
            <AppIcon name="bookmark" :size="12" />
            <span>{{ item.name }}</span>
            <em>{{ item.trackCount }}</em>
          </button>
          <p v-if="playlists.length === 0" class="music__empty">还没有歌单，先在右侧新建。</p>
        </div>
        <footer class="sheet__foot">
          <span>歌单只有自己可见</span>
        </footer>
      </div>
    </div>

    <div v-if="requestsOpen" class="overlay" @click.self="requestsOpen = false">
      <div class="sheet music__requests">
        <header class="sheet__head">
          <div>
            <h2>访问申请</h2>
            <p>私有曲目仅所有者可批准，管理员不可绕过。</p>
          </div>
          <button type="button" class="icon-button" @click="requestsOpen = false">×</button>
        </header>
        <div class="music__requests-body">
          <section>
            <h3>收到的申请 <em>{{ receivedRequests.length }}</em></h3>
            <div
              v-for="item in receivedRequests"
              :key="`in-${item.id}`"
              class="music__request"
            >
              <div class="music__request-main">
                <b>{{ item.trackTitle }}</b>
                <span>{{ item.requesterNickname }} · {{ item.status }}</span>
                <p v-if="item.message">{{ item.message }}</p>
              </div>
              <div class="music__request-actions">
                <button v-if="item.status === 'PENDING'" class="music__mini" @click="decideRequest(item, 'approve')">批准</button>
                <button v-if="item.status === 'PENDING'" class="music__mini" @click="decideRequest(item, 'reject')">拒绝</button>
                <button v-if="item.status === 'APPROVED'" class="music__mini" @click="decideRequest(item, 'revoke')">撤销</button>
              </div>
            </div>
            <p v-if="receivedRequests.length === 0" class="music__empty">暂无收到的申请</p>
          </section>
          <section>
            <h3>我发出的申请 <em>{{ myRequests.length }}</em></h3>
            <div v-for="item in myRequests" :key="`out-${item.id}`" class="music__request">
              <div class="music__request-main">
                <b>{{ item.trackTitle }}</b>
                <span>所有者 {{ item.ownerNickname }} · {{ item.status }}</span>
                <p v-if="item.decisionMessage">回复：{{ item.decisionMessage }}</p>
              </div>
              <div class="music__request-actions">
                <button v-if="item.status === 'PENDING'" class="music__mini" @click="decideRequest(item, 'cancel')">取消</button>
              </div>
            </div>
            <p v-if="myRequests.length === 0" class="music__empty">暂无申请记录</p>
          </section>
        </div>
      </div>
    </div>

    <div v-if="error" class="music__error-bar">{{ error }}</div>
    <div v-if="notice" class="music__notice">{{ notice }}</div>
    <div v-if="loading" class="music__loading">正在同步曲库…</div>
  </div>
</template>

<style scoped>
.music {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--fm-bg);
}

.music__head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--fm-border);
  background: var(--fm-panel);
  font-size: 10.5px;
}

.music__crumbs {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--fm-text-muted);
  white-space: nowrap;
}

.music__crumbs b {
  overflow: hidden;
  max-width: 260px;
  color: var(--fm-text);
  font-weight: 600;
  text-overflow: ellipsis;
}

.music__build {
  padding: 1px 5px;
  border-radius: 2px;
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.music__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  white-space: nowrap;
}

.music__status i {
  background: currentColor;
}

.music__status--ok {
  color: var(--fm-ok);
}

.music__status--warn {
  color: var(--fm-warn);
}

.music__status--err {
  color: var(--fm-err);
}

.music__head-spacer {
  flex: 1;
}

.music__volume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  white-space: nowrap;
}

.music__volume input {
  width: 80px;
}

.music__volume em {
  width: 30px;
  font-style: normal;
  text-align: right;
}

.music__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-size: 10px;
  white-space: nowrap;
  cursor: pointer;
}

.music__btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.music__btn--primary {
  border-color: var(--fm-accent);
  background: var(--fm-accent-soft);
  color: var(--fm-accent);
}

.music__badge {
  padding: 0 4px;
  border-radius: 8px;
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 8.5px;
  font-style: normal;
}

.music__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.music__side {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 246px;
  padding: 8px;
  overflow-y: auto;
  border-right: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.music__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 6px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.music__side-head--sub {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--fm-border);
}

.music__side-head em {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-style: normal;
}

.music__tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  margin: 0 4px 6px;
}

.music__tab {
  height: 24px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 10px;
  cursor: pointer;
}

.music__tab.is-active {
  border-color: var(--fm-accent);
  background: var(--fm-accent-soft);
  color: var(--fm-accent);
}

.music__filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 4px 6px;
}

.music__filter input,
.music__filter select {
  flex: 1;
  min-width: 0;
  height: 25px;
  padding: 0 6px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 10.5px;
  outline: none;
}

.music__filter input:focus,
.music__filter select:focus {
  border-color: var(--fm-accent);
}

.music__filter > button[type='submit'] {
  height: 25px;
  padding: 0 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-size: 10px;
  cursor: pointer;
}

.music__filter-inline {
  display: flex;
  flex-basis: 100%;
  gap: 4px;
}

.music__filter-inline button {
  flex: none;
  height: 25px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 10px;
  cursor: pointer;
}

.music__mini {
  height: 22px;
  padding: 0 7px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  cursor: pointer;
}

.music__mini:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.music__mini--danger:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.music__track {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.music__track:hover {
  background: var(--fm-hover);
  color: var(--fm-text);
}

.music__track.is-active {
  background: var(--fm-active);
  color: var(--fm-text);
}

.music__track-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--fm-border);
  border-radius: 50%;
  color: var(--fm-text-muted);
}

.music__track-icon.is-playing {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.music__track-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.music__track-body b {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__track-body em {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-size: 9px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__track-owner {
  flex: none;
  color: var(--fm-text-muted);
  font-size: 8.5px;
}

.music__side-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 10px 4px 0;
  padding-top: 10px;
  border-top: 1px solid var(--fm-border);
}

.music__empty {
  padding: 6px 8px;
  color: var(--fm-text-muted);
  font-size: 10px;
  line-height: 1.6;
}

.music__console-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.music__console-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 0 14px;
  border-bottom: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.music__job {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.music__job b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__job span {
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.music__progress-label {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 11px;
}

.music__time {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9.5px;
}

.music__bar {
  flex: none;
  height: 3px;
  background: var(--fm-panel-2);
}

.music__bar i {
  display: block;
  height: 100%;
  background: var(--fm-text-muted);
  transition: width 0.2s linear;
}

.music__bar--warn {
  background: var(--fm-accent) !important;
}

.music__bar--ok {
  background: var(--fm-ok) !important;
}

.music__bar--err {
  background: var(--fm-err) !important;
}

.music__console {
  flex: 1;
  min-height: 0;
  padding: 14px;
  overflow-y: auto;
  background: var(--fm-bg);
  font-family: var(--fm-mono);
  font-size: 11px;
  line-height: 1.8;
}

.music__log {
  display: flex;
  gap: 8px;
  color: var(--fm-text-dim);
  white-space: pre-wrap;
  word-break: break-word;
}

.music__log time {
  flex: none;
  color: var(--fm-text-muted);
}

.music__log-level {
  flex: none;
}

.music__log--info .music__log-level {
  color: var(--fm-link);
}

.music__log--ok .music__log-level {
  color: var(--fm-ok);
}

.music__log--warn .music__log-level {
  color: var(--fm-warn);
}

.music__log--error {
  color: var(--fm-err);
}

.music__log-cursor {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--fm-text-muted);
}

.music__caret {
  width: 7px;
  height: 13px;
  background: var(--fm-text-dim);
  animation: music-caret 1.1s steps(1) infinite;
}

@keyframes music-caret {
  50% {
    opacity: 0;
  }
}

.music__controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 14px;
  border-top: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.music__primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--fm-radius);
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.music__primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.music__seek {
  flex: 1;
  max-width: 420px;
}

.music__controls-spacer {
  flex: 1;
}

.music__shortcut {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
  white-space: nowrap;
}

.music__rail {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 260px;
  padding: 8px;
  overflow-y: auto;
  border-left: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.music__rail-form {
  display: flex;
  gap: 4px;
  margin: 0 4px 6px;
}

.music__rail-form input {
  flex: 1;
  min-width: 0;
  height: 25px;
  padding: 0 6px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 10.5px;
  outline: none;
}

.music__rail-form button {
  flex: none;
  width: 26px;
  height: 25px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  cursor: pointer;
}

.music__playlist,
.music__playlist-track {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.music__playlist:hover,
.music__playlist-track:hover {
  background: var(--fm-hover);
  color: var(--fm-text);
}

.music__playlist.is-active,
.music__playlist-track.is-active {
  background: var(--fm-active);
  color: var(--fm-text);
}

.music__playlist span,
.music__playlist-track span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__playlist em,
.music__playlist-track em {
  flex: none;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.music__playlist-track {
  padding-left: 18px;
}

.music__sheet {
  width: min(560px, 100%);
}

.music__sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 22px;
}

.music__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--fm-text-dim);
  font-size: 11.5px;
}

.music__row input:not([type='file']),
.music__row select {
  width: 280px;
  height: 29px;
  padding: 0 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 11.5px;
  outline: none;
}

.music__sheet-body textarea {
  resize: vertical;
  padding: 8px 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text);
  font-size: 11.5px;
  line-height: 1.6;
  outline: none;
}

.music__hint {
  margin: 0;
  color: var(--fm-text-muted);
  font-size: 11px;
  line-height: 1.7;
}

.music__error {
  color: var(--fm-err);
  font-size: 11px;
}

.music__requests {
  width: min(680px, 100%);
}

.music__requests-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(62vh, 560px);
  padding: 16px 22px;
  overflow-y: auto;
}

.music__requests-body h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--fm-text-dim);
  font-size: 11px;
  font-weight: 600;
}

.music__requests-body h3 em {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--fm-panel-2);
  color: var(--fm-text-muted);
  font-style: normal;
}

.music__request {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  padding: 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
}

.music__request-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.music__request-main b {
  color: var(--fm-text);
  font-size: 11.5px;
}

.music__request-main span {
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.music__request-main p {
  margin: 0;
  color: var(--fm-text-dim);
  font-size: 10.5px;
}

.music__request-actions {
  display: flex;
  flex: none;
  gap: 4px;
}

.music__error-bar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  max-width: 420px;
  padding: 8px 12px;
  border: 1px solid var(--fm-err);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-err) 12%, var(--fm-panel));
  color: var(--fm-err);
  font-size: 11px;
  z-index: 30;
}

.music__notice {
  position: fixed;
  right: 16px;
  bottom: 16px;
  padding: 8px 12px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel);
  color: var(--fm-text);
  font-size: 11px;
  z-index: 31;
}

.music__loading {
  position: fixed;
  right: 16px;
  top: 48px;
  padding: 6px 10px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel);
  color: var(--fm-text-muted);
  font-size: 10px;
  z-index: 30;
}

@media (max-width: 1180px) {
  .music__rail {
    width: 220px;
  }

  .music__side {
    width: 210px;
  }
}

@media (max-width: 980px) {
  .music__rail {
    display: none;
  }
}
</style>
