<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import { buildLogLines } from '@/modules/music/buildLog'
import { fetchPlaylist, fetchPlaylists, postPlaybackRecord } from '@/modules/music/musicApi'
import { usePlayerStore } from '@/modules/music/playerStore'
import type { BuildLogLine, PlaylistDetail, PlaylistSummary, Track } from '@/modules/music/types'

const identity = useIdentityStore()
const settings = useSettingsStore()
const skinStore = useSkinStore()
const player = usePlayerStore()

const DEFAULT_PLAYLIST: PlaylistDetail = {
  id: 'fishmatrix-api',
  name: 'fishmatrix-api',
  buildNumber: 128,
  tracks: [
    {
      id: 'quiet-night',
      title: '静夜思（Demo）',
      artist: 'Demo Build',
      durationSec: 120,
      stage: 'prepare',
      lyrics: ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],
    },
    {
      id: 'river-echo',
      title: 'River Echo (Instrumental)',
      artist: 'Pipeline Sounds',
      durationSec: 184,
      stage: 'compile',
      lyrics: [],
    },
    {
      id: 'deploy-waltz',
      title: 'Deploy Waltz',
      artist: 'CI Ensemble',
      durationSec: 156,
      stage: 'publish',
      lyrics: [],
    },
  ],
}

const playlists = ref<PlaylistSummary[]>([])
const playlist = ref<PlaylistDetail>(DEFAULT_PLAYLIST)
const offline = ref(false)
const loading = ref(false)
const notice = ref('')
const consoleEl = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

let noticeTimer: ReturnType<typeof setTimeout> | undefined

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    idle: '空闲',
    building: '构建中',
    paused: '已暂停',
    success: '构建成功',
    failed: '构建失败',
  }
  return labels[player.status] ?? '空闲'
})

const statusTone = computed(() => {
  if (player.status === 'success') return 'ok'
  if (player.status === 'failed') return 'err'
  if (player.status === 'building' || player.status === 'paused') return 'warn'
  return 'idle'
})

const currentTrack = computed<Track | null>(() => player.currentTrack)

const logs = computed<BuildLogLine[]>(() => {
  if (!currentTrack.value) return []
  return buildLogLines({
    progress: player.progress,
    positionSec: player.position,
    durationSec: player.duration || currentTrack.value.durationSec,
    trackTitle: currentTrack.value.title,
    lyrics: currentTrack.value.lyrics,
    status: player.status,
  })
})

const progressPercent = computed(() => Math.round(player.progress * 100))

function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function showNotice(message: string) {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
  }, 2600)
}

function trackStatus(index: number): string {
  if (player.currentIndex !== index) return 'idle'
  return player.status
}

function record(action: string, positionSec: number) {
  const track = currentTrack.value
  if (!track) return
  void postPlaybackRecord({
    playlistId: playlist.value.id,
    trackId: track.id,
    userId: identity.state.userId,
    action,
    positionSec,
  }).catch(() => {
    // 埋点失败不影响播放
  })
}

function startTrack(track: Track, index: number) {
  player.start(track, index)
  record('start', 0)
  showNotice(`已启动构建任务：${track.title}`)
}

function primaryAction() {
  if (!currentTrack.value) {
    const first = playlist.value.tracks[0]
    if (first) startTrack(first, 0)
    return
  }
  if (player.status === 'building') {
    player.pause()
    record('pause', player.position)
    return
  }
  if (player.status === 'paused') {
    player.resume()
    record('resume', player.position)
    return
  }
  const index = player.currentIndex
  const track = playlist.value.tracks[index]
  if (track) startTrack(track, index)
}

function restart() {
  const index = player.currentIndex >= 0 ? player.currentIndex : 0
  const track = playlist.value.tracks[index]
  if (track) startTrack(track, index)
}

function onSeek(event: Event) {
  const ratio = Number((event.target as HTMLInputElement).value) / 1000
  player.seek(ratio)
  record('seek', player.position)
}

function onVolume(event: Event) {
  settings.update({ volume: Number((event.target as HTMLInputElement).value) })
}

function openAudioPicker() {
  fileInput.value?.click()
}

function onAudioFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const track = currentTrack.value ?? playlist.value.tracks[0]
  if (!track) return
  const attached = player.attachAudio(file, track.id)
  if (attached) {
    showNotice(`本地音源已挂载到「${track.title}」，重新开始任务即可播放`)
  } else {
    showNotice('当前环境不支持本地音频')
  }
  input.value = ''
}

function primaryLabel(): string {
  if (!currentTrack.value) return '开始构建'
  if (player.status === 'building') return '暂停构建'
  if (player.status === 'paused') return '继续构建'
  return '重新构建'
}

async function loadPlaylist() {
  loading.value = true
  try {
    const summaries = await fetchPlaylists()
    playlists.value = summaries
    if (summaries[0]) {
      playlist.value = await fetchPlaylist(summaries[0].id)
      offline.value = false
    }
  } catch {
    playlists.value = [
      {
        id: DEFAULT_PLAYLIST.id,
        name: DEFAULT_PLAYLIST.name,
        description: '持续集成构建流水线',
        buildNumber: DEFAULT_PLAYLIST.buildNumber,
        trackCount: DEFAULT_PLAYLIST.tracks.length,
      },
    ]
    playlist.value = DEFAULT_PLAYLIST
    offline.value = true
  } finally {
    loading.value = false
  }
}

watch(
  () => player.status,
  (status, previous) => {
    if (status === 'success' && previous !== 'success') {
      record('complete', player.duration)
      showNotice('BUILD SUCCESS — 构建完成')
    }
  },
)

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
  () => logs.value.length,
  async () => {
    await nextTick()
    if (consoleEl.value) {
      consoleEl.value.scrollTop = consoleEl.value.scrollHeight
    }
  },
)

onMounted(async () => {
  player.setVolume(settings.state.volume)
  await loadPlaylist()
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
        <span>构建流水线</span>
        <AppIcon name="chevron" :size="11" />
        <b>{{ playlist.name }}</b>
        <span class="music__build">#{{ playlist.buildNumber }}</span>
      </div>
      <span class="music__status" :class="`music__status--${statusTone}`">
        <i class="dot" />
        {{ statusLabel }}
      </span>
      <span class="music__head-spacer" />
      <label class="music__volume">
        <span>并发数</span>
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
      <button class="music__btn" @click="openAudioPicker">
        <AppIcon name="import" :size="11" />
        挂载音源
      </button>
      <input
        ref="fileInput"
        class="music__file"
        type="file"
        accept="audio/*"
        @change="onAudioFile"
      />
      <span v-if="offline" class="music__offline">离线构建数据</span>
    </header>

    <div class="music__body">
      <aside class="music__side">
        <div class="music__side-head">
          <span>构建流水线</span>
          <em>{{ playlists.length }}</em>
        </div>
        <button
          v-for="item in playlists"
          :key="item.id"
          class="music__pipeline"
          :class="{ 'is-active': item.id === playlist.id }"
        >
          <AppIcon name="build" :size="13" />
          <span>{{ item.name }}</span>
          <em>#{{ item.buildNumber }}</em>
        </button>

        <div class="music__side-head music__side-head--sub">
          <span>构建任务</span>
          <em>{{ playlist.tracks.length }}</em>
        </div>
        <button
          v-for="(track, index) in playlist.tracks"
          :key="track.id"
          class="music__track"
          :class="{ 'is-active': player.currentIndex === index && currentTrack }"
          @click="startTrack(track, index)"
        >
          <span
            class="music__track-icon"
            :class="`music__track-icon--${trackStatus(index)}`"
          >
            <AppIcon :name="trackStatus(index) === 'building' ? 'pause' : 'play'" :size="9" />
          </span>
          <span class="music__track-body">
            <b>{{ track.title }}</b>
            <em>{{ track.stage }} · {{ clock(track.durationSec) }}</em>
          </span>
          <span class="music__track-state">{{ trackStatus(index) }}</span>
        </button>

        <div class="music__side-head music__side-head--sub">
          <span>执行器</span>
          <em>2 / 4</em>
        </div>
        <div class="music__executors">
          <span><i class="dot dot--ok" /> built-in</span>
          <span><i class="dot dot--ok" /> {{ identity.nodeName }}</span>
          <span><i class="dot" /> agent-03</span>
        </div>
        <div v-if="player.audioName" class="music__audio">
          <span>本地音源</span>
          <b>{{ player.audioName }}</b>
          <em>仅本机播放 · 不持久化</em>
        </div>
      </aside>

      <section class="music__console-panel">
        <header class="music__console-head">
          <div class="music__job">
            <b>{{ currentTrack?.title ?? '等待构建任务' }}</b>
            <span v-if="currentTrack">{{ currentTrack.artist }}</span>
            <span v-else>选择左侧任务启动流水线</span>
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
          <template v-if="currentTrack && logs.length > 0">
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
          </template>
          <template v-else>
            <div class="music__log music__log--muted">Started by user dev</div>
            <div class="music__log music__log--muted">Workspace: /var/jenkins_home/workspace/fishmatrix-api</div>
            <div class="music__log music__log--muted">Waiting for next build task...</div>
            <div class="music__log music__log--muted">
              选择左侧构建任务，构建日志将实时输出。
            </div>
          </template>
          <div v-if="player.status === 'paused'" class="music__log music__log--warn">
            <time>[--:--]</time>
            <span class="music__log-level">[WARN]</span>
            <span>Build paused, waiting for available executor</span>
          </div>
          <div class="music__log-cursor">
            <span class="music__prompt">$</span>
            <span class="music__caret" />
          </div>
        </div>

        <footer class="music__controls">
          <button class="music__primary" @click="primaryAction">
            <AppIcon :name="player.status === 'building' ? 'pause' : 'play'" :size="11" />
            {{ primaryLabel() }}
          </button>
          <button class="music__btn" @click="restart">重新开始</button>
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
          <span class="music__shortcut">JAVA 17 · maven-3.9</span>
        </footer>
      </section>
    </div>

    <div v-if="notice" class="music__notice">{{ notice }}</div>
    <div v-if="loading" class="music__loading">正在同步构建队列…</div>
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
  color: var(--fm-text);
  font-weight: 600;
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
  font-size: 9px;
}

.music__volume input {
  width: 90px;
  accent-color: var(--fm-accent);
}

.music__volume em {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-style: normal;
}

.music__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 23px;
  padding: 0 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  cursor: pointer;
}

.music__btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.music__file {
  display: none;
}

.music__offline {
  color: var(--fm-warn);
  font-family: var(--fm-mono);
  font-size: 8.5px;
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
  width: 270px;
  padding: 8px;
  overflow-y: auto;
  border-right: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.music__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 7px 5px 5px;
  color: var(--fm-text-muted);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.music__side-head--sub {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid var(--fm-border);
}

.music__side-head em {
  font-style: normal;
}

.music__pipeline,
.music__track {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  text-align: left;
  cursor: pointer;
}

.music__pipeline:hover,
.music__track:hover {
  background: var(--fm-hover);
}

.music__pipeline.is-active,
.music__track.is-active {
  background: var(--fm-active);
  color: var(--fm-text);
}

.music__pipeline span {
  flex: 1;
  font-size: 11.5px;
}

.music__pipeline em {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
  font-style: normal;
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

.music__track-icon--building {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.music__track-icon--success {
  border-color: var(--fm-ok);
  color: var(--fm-ok);
}

.music__track-icon--paused {
  border-color: var(--fm-warn);
  color: var(--fm-warn);
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
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__track-body em {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
  font-style: normal;
}

.music__track-state {
  color: var(--fm-text-muted);
  font-size: 8px;
}

.music__executors {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0 8px;
  color: var(--fm-text-dim);
  font-size: 10px;
}

.music__executors span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.music__audio {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 14px 4px 0;
  padding: 8px;
  border: 1px dashed var(--fm-border);
  border-radius: var(--fm-radius);
  color: var(--fm-text-muted);
  font-size: 9px;
}

.music__audio b {
  overflow: hidden;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 9.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__audio em {
  font-style: normal;
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
  min-height: 36px;
  padding: 0 14px;
  border-bottom: 1px solid var(--fm-border);
  background: var(--fm-panel);
}

.music__job {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.music__job b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music__job span {
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.music__progress-label {
  margin-left: auto;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 11px;
}

.music__time {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.music__bar {
  flex: none;
  height: 3px;
  background: var(--fm-panel-2);
}

.music__bar i {
  display: block;
  height: 100%;
  background: var(--fm-accent);
  transition: width 0.25s linear;
}

.music__bar i.music__bar--ok {
  background: var(--fm-ok);
}

.music__bar i.music__bar--err {
  background: var(--fm-err);
}

.music__console {
  flex: 1;
  min-height: 0;
  padding: 10px 14px;
  overflow-y: auto;
  border-bottom: 1px solid var(--fm-border);
  background: #0c0c0c;
  color: #bdbdbd;
  font-family: var(--fm-mono);
  font-size: 10.5px;
  line-height: 1.65;
}

.music__log {
  display: flex;
  gap: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.music__log time {
  flex: none;
  color: #6a9955;
}

.music__log-level {
  flex: none;
  color: #4daafc;
}

.music__log--success .music__log-level,
.music__log--success span:last-child {
  color: #3fb950;
  font-weight: 600;
}

.music__log--warn .music__log-level {
  color: #d29922;
}

.music__log--error .music__log-level,
.music__log--error span:last-child {
  color: #f85149;
}

.music__log--muted {
  color: #6a737d;
}

.music__log-cursor {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.music__prompt {
  color: #3fb950;
}

.music__caret {
  width: 7px;
  height: 13px;
  background: #bdbdbd;
  animation: blink 1.1s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.music__controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  background: var(--fm-panel);
}

.music__primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 25px;
  padding: 0 10px;
  border: 1px solid var(--fm-accent);
  border-radius: var(--fm-radius);
  background: var(--fm-accent);
  color: var(--fm-on-accent);
  font-size: 9.5px;
  font-weight: 600;
  cursor: pointer;
}

.music__primary:hover {
  filter: brightness(1.08);
}

.music__seek {
  width: min(320px, 30vw);
  accent-color: var(--fm-accent);
}

.music__seek:disabled {
  opacity: 0.35;
}

.music__controls-spacer {
  flex: 1;
}

.music__shortcut {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
}

.music__notice {
  position: fixed;
  right: 20px;
  bottom: 44px;
  z-index: 800;
  padding: 8px 12px;
  border: 1px solid var(--fm-accent);
  border-radius: 4px;
  background: var(--fm-panel);
  color: var(--fm-accent);
  font-size: 10.5px;
  box-shadow: var(--fm-shadow);
}

.music__loading {
  position: fixed;
  right: 20px;
  bottom: 44px;
  padding: 6px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: var(--fm-panel);
  color: var(--fm-text-dim);
  font-size: 10px;
}

@media (max-width: 900px) {
  .music__side {
    width: 220px;
  }

  .music__volume {
    display: none;
  }
}
</style>
