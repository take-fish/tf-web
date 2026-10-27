<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import ExerciseArena from './ExerciseArena.vue'
import type { ExerciseMode, ExerciseRoom } from '../types'
import { useTournamentStore } from '@/stores/tournament'

const store = useTournamentStore()
const seats = ref(4)

const modeOptions: Array<{
  mode: ExerciseMode
  title: string
  tag: string
  description: string
}> = [
  {
    mode: 'TRAINING',
    title: '单人训练',
    tag: 'TRAINING',
    description: '1 名巡检员 + 3 个被动训练靶，180 秒练习走位与技能，不计入排行。',
  },
  {
    mode: 'FFA',
    title: '自由对抗',
    tag: 'FFA',
    description: '2–4 名巡检员各自为战，积分与击杀决定排名。',
  },
  {
    mode: 'TEAM',
    title: '团队对抗',
    tag: 'TEAM',
    description: '按加入顺序拆成 A / B 两队，队伍总分与击杀优先。',
  },
]

const room = computed(() => store.exerciseRoom)
const state = computed(() => store.exerciseState)
const playingView = computed(
  () => Boolean(room.value && room.value.status !== 'WAITING'),
)
const ownMember = computed(
  () =>
    room.value?.members.find((member) => member.userId === store.ownUserId) ?? null,
)
const humanCount = computed(
  () => room.value?.members.filter((member) => !member.bot).length ?? 0,
)
const readyCount = computed(
  () =>
    room.value?.members.filter((member) => !member.bot && member.ready).length ?? 0,
)
const waitingRooms = computed(() =>
  store.exerciseRooms.filter((entry) => entry.status === 'WAITING'),
)
const recentResults = computed(() => store.exerciseResults.slice(0, 6))
const canCreate = computed(() => !store.exerciseBusy && !store.exerciseInRoom)

function modeText(mode: string): string {
  if (mode === 'TRAINING') return '单人训练'
  if (mode === 'TEAM') return '团队对抗'
  return '自由对抗'
}

function statusText(value: string): string {
  if (value === 'WAITING') return '等待准备'
  if (value === 'RUNNING') return '对抗中'
  if (value === 'FINISHED') return '已结束'
  return '已取消'
}

function seatText(entry: ExerciseRoom): string {
  const humans = entry.members.filter((member) => !member.bot).length
  return `${humans}/${entry.maxPlayers}`
}

function joined(entry: ExerciseRoom): boolean {
  return store.exerciseRoomId === entry.roomId
}

function resultTime(createdAt: string | number | null | undefined): string {
  if (createdAt == null) return ''
  const value = typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt))
  if (Number.isNaN(value)) return ''
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function createRoom(mode: ExerciseMode) {
  if (store.exerciseBusy) return
  const capacity = mode === 'TEAM' && seats.value === 3 ? 4 : seats.value
  await store.createExercise(mode, mode === 'TRAINING' ? undefined : capacity)
}

async function joinRoom(key: string) {
  if (store.exerciseBusy) return
  await store.joinExercise(key)
}

async function leaveWaitingRoom() {
  await store.leaveExercise()
  await store.refreshExerciseRooms()
}

async function backToLobby() {
  await store.leaveExercise()
  await store.refreshExerciseRooms()
}

async function quitRoom() {
  if (room.value?.status === 'RUNNING') {
    const confirmed = window.confirm('对局仍在进行，退出会判定离开房间，确定退出吗？')
    if (!confirmed) return
  }
  await store.leaveExercise()
  await store.refreshExerciseRooms()
}

function close() {
  if (room.value?.status === 'RUNNING') {
    const confirmed = window.confirm('对局仍在进行，关闭大厅会退出房间，确定关闭吗？')
    if (!confirmed) return
  }
  store.closeExerciseLobby()
}

onMounted(() => {
  void store.refreshExerciseRooms()
})
</script>

<template>
  <section class="exlobby" role="dialog" aria-modal="true" aria-label="集群巡检对抗演练">
    <div class="exlobby__panel" :class="{ 'is-playing': playingView }">
      <header class="exlobby__head">
        <div class="exlobby__title">
          <span class="exlobby__eyebrow">DRILL / CLUSTER PATROL ARENA</span>
          <b>集群巡检对抗演练</b>
          <em>2D 俯视轻 FPS · 180 秒 · 服务端权威 25Hz · 系统随机选择赛事剧本</em>
        </div>
        <div class="exlobby__head-actions">
          <button
            v-if="playingView"
            type="button"
            class="exlobby__ghost"
            @click="backToLobby"
          >
            返回大厅
          </button>
          <button
            v-if="playingView"
            type="button"
            class="exlobby__ghost is-danger"
            @click="quitRoom"
          >
            退出房间
          </button>
          <button type="button" class="exlobby__close" aria-label="关闭" @click="close">
            ×
          </button>
        </div>
      </header>

      <div v-if="store.exerciseError" class="exlobby__error">
        {{ store.exerciseError }}
      </div>

      <div v-if="playingView" class="exlobby__play">
        <div class="exlobby__play-bar">
          <span>房间 <b>{{ room?.roomCode }}</b></span>
          <span>{{ room ? modeText(room.mode) : '' }}</span>
          <span>{{ room ? statusText(room.status) : '' }}</span>
          <span class="exlobby__play-tip">
            左键开火 · WASD 移动 · Q/E/空格/R 技能 · Esc 老板键
          </span>
        </div>
        <ExerciseArena
          v-if="state"
          :state="state"
          :self-user-id="store.ownUserId"
          :interactive="room?.status === 'RUNNING' && !state.finished"
          :standings="store.exerciseFinished?.standings"
          @input="store.sendExerciseInput"
        />
        <div v-else class="exlobby__loading">正在同步对局状态…</div>
      </div>

      <div v-else class="exlobby__grid">
        <aside class="exlobby__aside">
          <section class="exlobby__block">
            <header>
              <b>创建演练</b>
              <span v-if="canCreate">即时开局</span>
              <span v-else>请先离开当前房间</span>
            </header>
            <div v-if="canCreate" class="exlobby__seats">
              <span>人数</span>
              <button
                v-for="count in [2, 3, 4]"
                :key="count"
                type="button"
                :class="{ 'is-active': seats === count }"
                @click="seats = count"
              >
                {{ count }} 人
              </button>
            </div>
            <div class="exlobby__modes">
              <article
                v-for="option in modeOptions"
                :key="option.mode"
                class="exlobby__mode"
                :class="{ 'is-training': option.mode === 'TRAINING' }"
              >
                <div>
                  <span>{{ option.tag }}</span>
                  <b>{{ option.title }}</b>
                  <em>{{ option.description }}</em>
                </div>
                <button
                  type="button"
                  :disabled="!canCreate || store.exerciseBusy"
                  @click="createRoom(option.mode)"
                >
                  {{ option.mode === 'TRAINING' ? '立即训练' : '创建房间' }}
                </button>
              </article>
            </div>
          </section>

          <section class="exlobby__block">
            <header>
              <b>等待中的房间</b>
              <button type="button" class="exlobby__link" @click="store.refreshExerciseRooms()">
                刷新
              </button>
            </header>
            <p v-if="store.exerciseLoading" class="exlobby__muted">正在加载房间…</p>
            <p v-else-if="waitingRooms.length === 0" class="exlobby__muted">
              暂无等待房间，创建一个自由对抗或团队对抗房间。
            </p>
            <ul v-else class="exlobby__rooms">
              <li v-for="entry in waitingRooms" :key="entry.roomId">
                <div>
                  <b>{{ entry.roomCode }}</b>
                  <span>{{ modeText(entry.mode) }} · {{ seatText(entry) }} · {{ statusText(entry.status) }}</span>
                </div>
                <button v-if="joined(entry)" type="button" class="is-joined" disabled>
                  当前房间
                </button>
                <button
                  v-else
                  type="button"
                  :disabled="store.exerciseBusy || store.exerciseInRoom"
                  @click="joinRoom(entry.roomId)"
                >
                  加入
                </button>
              </li>
            </ul>
          </section>

          <section class="exlobby__block">
            <header>
              <b>最近战绩</b>
              <span>仅休闲与赛事</span>
            </header>
            <p v-if="recentResults.length === 0" class="exlobby__muted">还没有完成过巡检对局。</p>
            <ul v-else class="exlobby__results">
              <li v-for="result in recentResults" :key="`${result.id}-${result.userId}`">
                <span class="exlobby__result-rank" :class="{ 'is-winner': result.winner }">
                  {{ result.rankNo }}
                </span>
                <span class="exlobby__result-name">{{ result.nickname }}</span>
                <span class="exlobby__result-mode">{{ modeText(result.mode) }}</span>
                <span class="exlobby__result-score">{{ result.score }} 分</span>
                <span class="exlobby__result-time">{{ resultTime(result.createdAt) }}</span>
              </li>
            </ul>
          </section>
        </aside>

        <section class="exlobby__main">
          <div v-if="!room" class="exlobby__intro">
            <span class="exlobby__intro-mark">CP</span>
            <b>选择一种巡检模式</b>
            <p>
              单人训练会立刻部署 3 个被动训练靶；自由对抗与团队对抗需要所有真人准备后自动开始。
            </p>
            <ul>
              <li>命中 +1 · 击杀 +5 · 助攻 +2 · 拾取资源 +2</li>
              <li>控制点每 3 秒 +1 分，按住即可持续占领</li>
              <li>硬掩体阻挡视线，扫描技能可短时查看全图</li>
            </ul>
          </div>

          <div v-else class="exlobby__waiting">
            <header class="exlobby__waiting-head">
              <div>
                <span class="exlobby__eyebrow">ROOM / {{ room.roomCode }}</span>
                <b>{{ modeText(room.mode) }}</b>
              </div>
              <span class="exlobby__badge">{{ statusText(room.status) }}</span>
            </header>

            <div class="exlobby__waiting-meta">
              <span>真人 {{ humanCount }}/{{ room.maxPlayers }}</span>
              <span>已准备 {{ readyCount }}/{{ humanCount }}</span>
              <span>单局 {{ room.durationSeconds }}s</span>
              <span>房主 {{ room.ownerUserId === store.ownUserId ? '你' : room.ownerUserId }}</span>
            </div>

            <ul class="exlobby__members">
              <li
                v-for="member in room.members"
                :key="member.userId"
                :class="{ 'is-self': member.userId === store.ownUserId }"
              >
                <span class="exlobby__member-dot" :class="{ 'is-ready': member.ready, 'is-bot': member.bot }" />
                <span class="exlobby__member-name">
                  {{ member.nickname }}
                  <em v-if="member.userId === store.ownUserId">你</em>
                  <em v-if="member.userId === room.ownerUserId" class="is-owner">房主</em>
                  <em v-if="member.bot" class="is-bot">训练靶</em>
                </span>
                <span v-if="member.team" class="exlobby__member-team">{{ member.team }} 队</span>
                <span class="exlobby__member-state">
                  {{ member.bot ? '被动' : member.ready ? '已准备' : '未准备' }}
                </span>
              </li>
            </ul>

            <div class="exlobby__waiting-actions">
              <button
                type="button"
                class="exlobby__primary"
                :disabled="store.exerciseBusy || Boolean(ownMember?.ready)"
                @click="store.readyExercise()"
              >
                {{ ownMember?.ready ? '已准备，等待其他巡检员' : '准备开始' }}
              </button>
              <button
                type="button"
                class="exlobby__ghost"
                :disabled="store.exerciseBusy"
                @click="leaveWaitingRoom"
              >
                离开房间
              </button>
              <span class="exlobby__waiting-tip">
                至少 2 名真人且全部准备后自动开局；开始后系统按队伍总分与击杀判定胜负。
              </span>
            </div>

            <div class="exlobby__rules">
              <span>赛事沿用同一套巡检引擎：随机剧本、前四页面淘汰、高顺位首局选图。</span>
              <span>大排行榜只记录冠军数、亚军数与总积分（冠军 +30 / 亚军 +10）。</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.exlobby {
  position: fixed;
  inset: 0;
  z-index: 720;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(3px);
}

.exlobby__panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(1240px, 100%);
  max-height: 94vh;
  padding: 14px 16px 16px;
  overflow: hidden;
  border: 1px solid var(--fm-border);
  border-radius: 5px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
}

.exlobby__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.exlobby__title b {
  display: block;
  margin-top: 2px;
  color: var(--fm-text);
  font-size: 15px;
}

.exlobby__title em {
  display: block;
  margin-top: 2px;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.exlobby__eyebrow {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 7px;
  letter-spacing: 0.08em;
}

.exlobby__head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.exlobby__ghost,
.exlobby__primary,
.exlobby__link {
  padding: 4px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9px;
  cursor: pointer;
}

.exlobby__ghost:hover,
.exlobby__link:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.exlobby__ghost.is-danger:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.exlobby__primary {
  border-color: color-mix(in srgb, var(--fm-accent) 46%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-accent) 10%, transparent);
  color: var(--fm-accent);
}

.exlobby__primary:disabled,
.exlobby__ghost:disabled,
.exlobby__mode button:disabled,
.exlobby__rooms button:disabled {
  opacity: 0.45;
  cursor: default;
}

.exlobby__close {
  width: 26px;
  height: 26px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 15px;
  cursor: pointer;
}

.exlobby__close:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.exlobby__error {
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--fm-err) 48%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-err) 8%, transparent);
  color: var(--fm-err);
  font-size: 9px;
}

.exlobby__grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.exlobby__aside {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding-right: 2px;
  overflow-y: auto;
}

.exlobby__block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--fm-bg) 32%, transparent);
}

.exlobby__block header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.exlobby__block header b {
  color: var(--fm-text);
  font-size: 10px;
  font-weight: 600;
}

.exlobby__block header span {
  color: var(--fm-text-muted);
  font-size: 7.5px;
}

.exlobby__seats {
  display: flex;
  align-items: center;
  gap: 4px;
}

.exlobby__seats span {
  margin-right: 2px;
  color: var(--fm-text-muted);
  font-size: 8px;
}

.exlobby__seats button {
  flex: 1;
  padding: 3px 0;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  cursor: pointer;
}

.exlobby__seats button.is-active {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.exlobby__modes {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.exlobby__mode {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
}

.exlobby__mode.is-training {
  border-color: color-mix(in srgb, var(--fm-accent) 32%, var(--fm-border));
}

.exlobby__mode span {
  display: block;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 6.5px;
}

.exlobby__mode b {
  display: block;
  color: var(--fm-text);
  font-size: 9.5px;
  font-weight: 600;
}

.exlobby__mode em {
  display: block;
  margin-top: 1px;
  color: var(--fm-text-muted);
  font-size: 7.5px;
  font-style: normal;
  line-height: 1.45;
}

.exlobby__mode button,
.exlobby__rooms button {
  flex: none;
  padding: 3px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 8px;
  cursor: pointer;
}

.exlobby__mode button:hover,
.exlobby__rooms button:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.exlobby__rooms,
.exlobby__results {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.exlobby__rooms li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 6px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
}

.exlobby__rooms li div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.exlobby__rooms b {
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 9px;
}

.exlobby__rooms li div span {
  color: var(--fm-text-muted);
  font-size: 7px;
}

.exlobby__rooms button.is-joined,
.exlobby__rooms button.is-joined:disabled {
  border-color: color-mix(in srgb, var(--fm-ok) 46%, var(--fm-border));
  color: var(--fm-ok);
  opacity: 1;
}

.exlobby__results li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 5px;
  padding: 3px 4px;
  border-bottom: 1px dashed var(--fm-border);
  font-size: 7.5px;
}

.exlobby__result-rank {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  text-align: center;
}

.exlobby__result-rank.is-winner {
  color: var(--fm-warn);
}

.exlobby__result-name {
  overflow: hidden;
  color: var(--fm-text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exlobby__result-mode {
  color: var(--fm-text-muted);
  font-size: 6.5px;
}

.exlobby__result-score {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
}

.exlobby__result-time {
  display: none;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 6.5px;
}

.exlobby__muted {
  margin: 0;
  color: var(--fm-text-muted);
  font-size: 7.5px;
  line-height: 1.5;
}

.exlobby__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background:
    radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--fm-accent) 9%, transparent), transparent 46%),
    color-mix(in srgb, var(--fm-bg) 55%, transparent);
}

.exlobby__intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 380px;
  padding: 24px;
  text-align: center;
}

.exlobby__intro-mark {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 44%, var(--fm-border));
  border-radius: 4px;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 14px;
}

.exlobby__intro b {
  color: var(--fm-text);
  font-size: 14px;
  font-weight: 600;
}

.exlobby__intro p {
  max-width: 430px;
  margin: 0;
  color: var(--fm-text-muted);
  font-size: 9px;
  line-height: 1.6;
}

.exlobby__intro ul {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 4px 0 0;
  padding: 0;
  color: var(--fm-text-dim);
  font-size: 8px;
  list-style: none;
}

.exlobby__waiting {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.exlobby__waiting-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.exlobby__waiting-head b {
  display: block;
  margin-top: 2px;
  color: var(--fm-text);
  font-size: 15px;
  font-weight: 600;
}

.exlobby__badge {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--fm-warn) 46%, transparent);
  border-radius: 999px;
  color: var(--fm-warn);
  font-family: var(--fm-mono);
  font-size: 7.5px;
}

.exlobby__waiting-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 6px 9px;
  border: 1px dashed var(--fm-border);
  border-radius: 3px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.exlobby__members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.exlobby__members li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-panel) 55%, transparent);
}

.exlobby__members li.is-self {
  border-color: color-mix(in srgb, var(--fm-accent) 36%, var(--fm-border));
}

.exlobby__member-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fm-text-muted) 50%, transparent);
}

.exlobby__member-dot.is-ready {
  background: var(--fm-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fm-ok) 16%, transparent);
}

.exlobby__member-dot.is-bot {
  background: var(--fm-warn);
}

.exlobby__member-name {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--fm-text);
  font-size: 9.5px;
}

.exlobby__member-name em {
  padding: 1px 4px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  color: var(--fm-text-muted);
  font-size: 6.5px;
  font-style: normal;
}

.exlobby__member-name em.is-owner {
  border-color: color-mix(in srgb, var(--fm-accent) 40%, var(--fm-border));
  color: var(--fm-accent);
}

.exlobby__member-name em.is-bot {
  border-color: color-mix(in srgb, var(--fm-warn) 40%, var(--fm-border));
  color: var(--fm-warn);
}

.exlobby__member-team {
  margin-left: auto;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
}

.exlobby__member-state {
  color: var(--fm-text-muted);
  font-size: 8px;
}

.exlobby__waiting-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.exlobby__waiting-tip {
  flex: 1;
  min-width: 200px;
  color: var(--fm-text-muted);
  font-size: 8px;
  line-height: 1.5;
}

.exlobby__rules {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--fm-border);
  color: var(--fm-text-muted);
  font-size: 7.5px;
}

.exlobby__play {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.exlobby__play-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 5px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.exlobby__play-bar b {
  color: var(--fm-accent);
  font-weight: 600;
}

.exlobby__play-tip {
  margin-left: auto;
  font-family: var(--fm-sans);
  font-size: 7.5px;
}

.exlobby__loading {
  display: grid;
  place-items: center;
  min-height: 320px;
  border: 1px dashed var(--fm-border);
  border-radius: 3px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
}

@media (max-width: 900px) {
  .exlobby {
    padding: 8px;
  }

  .exlobby__grid {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .exlobby__aside {
    max-height: none;
    overflow: visible;
  }

  .exlobby__play-bar {
    gap: 8px;
  }

  .exlobby__play-tip {
    margin-left: 0;
  }
}
</style>
