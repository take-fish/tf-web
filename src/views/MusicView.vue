<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import {
  createCategory,
  deleteTrack,
  fetchCategories,
  fetchMyTracks,
  fetchSharedTracks,
  fetchTracks,
  importTrack,
  shareTrack,
  updateTrack,
} from '@/modules/music/musicApi'
import type { Category, ContentStatus, Track } from '@/modules/music/types'
import { errorText } from './music/music-helpers'
import { useMusicAccess } from './music/useMusicAccess'
import { useMusicConsole } from './music/useMusicConsole'

const auth = useAuthStore()
const settings = useSettingsStore()

const mode = ref<'public' | 'private' | 'shared'>('public')
const tracks = ref<Track[]>([])
const categories = ref<Category[]>([])
const categoryFilter = ref<number | null>(null)
const searchQuery = ref('')
const loading = ref(false)
const error = ref('')

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

const categoryDraft = ref('')
const categoryEditorOpen = ref(false)
const currentEditId = ref<number | null>(null)

const {
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
} = useMusicConsole(tracks, error)

const canUploadPublic = computed(() => auth.hasPermission('music.public.upload'))
const canManagePrivate = computed(() => auth.hasPermission('music.private.manage'))
const canManageCategory = computed(() => auth.hasPermission('music.category.manage'))
const canImport = computed(() =>
  mode.value === 'private' ? canManagePrivate.value : canUploadPublic.value,
)
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

const {
  shareTokenInput,
  sharePreview,
  applying,
  applyMessage,
  applyError,
  requestsOpen,
  receivedRequests,
  myRequests,
  lookupShare,
  submitAccessRequest,
  openRequests,
  refreshRequests,
  decideRequest,
} = useMusicAccess({ mode, error, loadTracks, showNotice })

const pendingIncoming = computed(
  () => receivedRequests.value.filter((item) => item.status === 'PENDING').length,
)

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

onMounted(async () => {
  player.setVolume(settings.state.volume)
  log('INFO', 'player initialized · auth from user center')
  await Promise.all([loadCategories(), loadTracks(), loadPlaylists()])
  void refreshRequests()
})

onBeforeUnmount(() => {
  player.pause()
  disposeNotice()
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

<style scoped src="./music-view.css"></style>
<style scoped src="./music-view-2.css"></style>
