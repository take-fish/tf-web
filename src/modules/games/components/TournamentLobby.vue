<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { formatApiError } from '@/lib/http'
import { useTournamentStore } from '@/stores/tournament'
import {
  countdown,
  formatClock,
  formatLabel,
  tournamentStatusLabel,
} from '../lib/gameFormat'
import type { GameFormat, GameMatch, GameOnlineUser, GameTournament } from '../types'
import TournamentBracket from './TournamentBracket.vue'

const emit = defineEmits<{ close: [] }>()

const MAX_PLAYERS = 16
const store = useTournamentStore()
const router = useRouter()
const route = useRoute()

const format = ref<GameFormat>('BO1')
const name = ref('')
const selectedIds = ref<string[]>([])
const creating = ref(false)
const createError = ref('')
const actingId = ref('')
const selectedTournamentId = ref('')
const now = ref(Date.now())

let clockTimer: ReturnType<typeof setInterval> | undefined

const selfId = computed(() => store.ownUserId)
const selfPlayer = computed<GameOnlineUser>(() => ({
  userId: selfId.value,
  nickname: store.ownNickname,
}))
const candidates = computed(() =>
  store.lobbyOnline.filter((member) => member.userId !== selfId.value),
)
const selectedPlayers = computed(() =>
  candidates.value.filter((member) => selectedIds.value.includes(member.userId)),
)
const roster = computed<GameOnlineUser[]>(() => [selfPlayer.value, ...selectedPlayers.value])
const selectedTournament = computed<GameTournament | undefined>(() =>
  store.tournaments.find((tournament) => tournament.id === selectedTournamentId.value),
)
const myActiveMatches = computed(() => store.activeMatches)
const connectionLabel = computed(() => {
  if (store.status === 'online') return '比赛大厅已连接'
  if (store.status === 'connecting') return '正在连接比赛大厅'
  if (store.status === 'reconnecting') return '正在重连比赛大厅'
  return '比赛大厅离线 · 可查看与创建，操作需恢复连接'
})
const canCreate = computed(
  () =>
    !creating.value &&
    Boolean(selfId.value) &&
    roster.value.length >= 2 &&
    roster.value.length <= MAX_PLAYERS,
)

watch(
  candidates,
  (members) => {
    const available = new Set(members.map((member) => member.userId))
    selectedIds.value = selectedIds.value.filter((userId) => available.has(userId))
  },
  { deep: true },
)

watch(
  () => store.tournaments,
  (tournaments) => {
    if (
      selectedTournamentId.value &&
      tournaments.some((tournament) => tournament.id === selectedTournamentId.value)
    ) {
      return
    }
    const preferred =
      tournaments.find((tournament) => tournament.status === 'RUNNING') ?? tournaments[0]
    selectedTournamentId.value = preferred?.id ?? ''
  },
  { deep: true, immediate: true },
)

function toggle(userId: string) {
  if (selectedIds.value.includes(userId)) {
    selectedIds.value = selectedIds.value.filter((entry) => entry !== userId)
    return
  }
  if (roster.value.length >= MAX_PLAYERS) return
  selectedIds.value.push(userId)
}

function isSelected(userId: string): boolean {
  return selectedIds.value.includes(userId)
}

function invitationRemaining(tournament: GameTournament): string {
  return countdown(tournament.inviteDeadline, now.value)
}

function isInvitationExpired(tournament: GameTournament): boolean {
  return tournament.inviteDeadline <= now.value
}

function playerCount(tournament: GameTournament): number {
  return tournament.players.filter((player) => player.status === 'ACCEPTED').length
}

function preferredMatch(tournament: GameTournament): GameMatch | undefined {
  const live = store.bestMatchFor(tournament)
  if (live) return live
  const finished = [...tournament.matches]
    .reverse()
    .find((match) => match.status === 'FINISHED')
  return finished
}

function watchMatch(matchId: string) {
  void router.push({ path: '/games', query: { ...route.query, watch: matchId } })
  emit('close')
}

function openTournament(tournament: GameTournament) {
  const match = preferredMatch(tournament)
  if (match) watchMatch(match.id)
}

function selectTournament(tournament: GameTournament) {
  selectedTournamentId.value = tournament.id
}

async function create() {
  if (!canCreate.value) return
  creating.value = true
  createError.value = ''
  try {
    const created = await store.create({
      name: name.value.trim() || '热力五子棋',
      format: format.value,
      players: roster.value,
    })
    selectedIds.value = []
    name.value = ''
    selectedTournamentId.value = created.id
  } catch (error) {
    createError.value = formatApiError(error, '赛事创建失败')
  } finally {
    creating.value = false
  }
}

async function respond(tournament: GameTournament, accept: boolean) {
  if (actingId.value) return
  actingId.value = tournament.id
  createError.value = ''
  try {
    if (accept) await store.acceptInvitation(tournament.id)
    else await store.declineInvitation(tournament.id)
    selectedTournamentId.value = tournament.id
  } catch (error) {
    createError.value = formatApiError(error, accept ? '接受邀请失败' : '拒绝邀请失败')
  } finally {
    actingId.value = ''
  }
}

async function cancel(tournament: GameTournament) {
  if (actingId.value) return
  if (!window.confirm(`确认取消赛事「${tournament.name}」？`)) return
  actingId.value = tournament.id
  createError.value = ''
  try {
    await store.cancel(tournament.id)
  } catch (error) {
    createError.value = formatApiError(error, '取消赛事失败')
  } finally {
    actingId.value = ''
  }
}

function isCreator(tournament: GameTournament): boolean {
  return tournament.creatorUserId === selfId.value
}

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  void store.refreshLobby()
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div class="lobby" role="dialog" aria-modal="true" aria-label="热力五子棋赛事大厅" @click.self="emit('close')">
    <section class="lobby__panel">
      <header class="lobby__head">
        <div class="lobby__title">
          <span class="lobby__mark">五</span>
          <div>
            <div class="lobby__eyebrow">CONNECT / HEATMAP GOMOKU</div>
            <h2>热力五子棋 · 赛事大厅</h2>
            <p>创建比赛、邀请在线选手、观战与回看</p>
          </div>
        </div>
        <div class="lobby__head-actions">
          <span class="lobby__connection" :class="`is-${store.status}`">
            <span class="lobby__dot" />
            {{ connectionLabel }}
          </span>
          <button class="lobby__icon-btn" title="刷新大厅" @click="store.refreshLobby()">
            <AppIcon name="refresh" :size="13" />
          </button>
          <button class="lobby__close" title="关闭赛事大厅" @click="emit('close')">×</button>
        </div>
      </header>

      <div class="lobby__body">
        <div class="lobby__column">
          <section v-if="store.invitations.length" class="lobby__card lobby__card--invite">
            <div class="lobby__card-head">
              <span>收到的邀请</span>
              <em>{{ store.invitations.length }} 个待响应</em>
            </div>
            <article
              v-for="invitation in store.invitations"
              :key="invitation.id"
              class="lobby__invite"
            >
              <div class="lobby__invite-main">
                <b>{{ invitation.name }}</b>
                <span>
                  {{ invitation.creatorNickname }} 邀请你 · {{ formatLabel(invitation.format) }}
                </span>
                <em :class="{ 'is-expired': isInvitationExpired(invitation) }">
                  <template v-if="isInvitationExpired(invitation)">邀请已超时</template>
                  <template v-else>剩余 {{ invitationRemaining(invitation) }}</template>
                </em>
              </div>
              <div class="lobby__invite-actions">
                <button
                  type="button"
                  class="lobby__button lobby__button--primary"
                  :disabled="Boolean(actingId) || isInvitationExpired(invitation)"
                  @click="respond(invitation, true)"
                >
                  接受
                </button>
                <button
                  type="button"
                  class="lobby__button"
                  :disabled="Boolean(actingId)"
                  @click="respond(invitation, false)"
                >
                  拒绝
                </button>
              </div>
            </article>
          </section>

          <section v-if="myActiveMatches.length" class="lobby__card lobby__card--active">
            <div class="lobby__card-head">
              <span>我的进行中比赛</span>
              <em>{{ myActiveMatches.length }} 场</em>
            </div>
            <button
              v-for="match in myActiveMatches"
              :key="match.id"
              type="button"
              class="lobby__active-match"
              @click="watchMatch(match.id)"
            >
              <span>
                {{ match.player1Nickname || match.player1UserId }} vs
                {{ match.player2Nickname || match.player2UserId }}
              </span>
              <em>
                {{ match.status === 'RUNNING' ? '进行中' : '待准备' }}
                · 进入比赛
              </em>
            </button>
          </section>

          <section class="lobby__card">
            <div class="lobby__card-head">
              <span>创建比赛</span>
              <em>{{ roster.length }}/{{ MAX_PLAYERS }} 人</em>
            </div>

            <label class="lobby__field">
              <span>赛事名称</span>
              <input
                v-model="name"
                type="text"
                maxlength="32"
                placeholder="热力五子棋"
                :disabled="creating"
              />
            </label>

            <div class="lobby__field">
              <span>赛制</span>
              <div class="lobby__formats">
                <button
                  v-for="option in (['BO1', 'BO3', 'BO5'] as GameFormat[])"
                  :key="option"
                  type="button"
                  class="lobby__format"
                  :class="{ 'is-active': format === option }"
                  @click="format = option"
                >
                  <b>{{ option }}</b>
                  <em>
                    {{
                      option === 'BO1'
                        ? '一局定胜负'
                        : option === 'BO3'
                          ? '三局两胜 · 局间休 60 秒'
                          : '五局三胜 · 局间休 60 秒'
                    }}
                  </em>
                </button>
              </div>
            </div>

            <div class="lobby__field">
              <div class="lobby__field-head">
                <span>在线选手</span>
                <em>创建者已自动加入 · 点击选择对手</em>
              </div>
              <div class="lobby__roster">
                <div class="lobby__member is-self">
                  <span class="lobby__avatar">{{ store.ownNickname.slice(0, 1).toUpperCase() }}</span>
                  <span class="lobby__member-main">
                    <b>{{ store.ownNickname }}</b>
                    <em>你 · 创建者</em>
                  </span>
                  <AppIcon name="check" :size="12" />
                </div>
                <button
                  v-for="member in candidates"
                  :key="member.userId"
                  type="button"
                  class="lobby__member"
                  :class="{ 'is-selected': isSelected(member.userId) }"
                  :disabled="!isSelected(member.userId) && roster.length >= MAX_PLAYERS"
                  @click="toggle(member.userId)"
                >
                  <span class="lobby__avatar">{{ member.nickname.slice(0, 1).toUpperCase() }}</span>
                  <span class="lobby__member-main">
                    <b>{{ member.nickname }}</b>
                    <em>{{ member.userId }}</em>
                  </span>
                  <AppIcon :name="isSelected(member.userId) ? 'check' : 'plus'" :size="12" />
                </button>
                <div v-if="candidates.length === 0" class="lobby__empty">
                  当前没有其他在线用户。让对方登录并打开任意页面后，再刷新大厅。
                </div>
              </div>
            </div>

            <div class="lobby__rules">
              <p><b>2/4/8/16 人</b>：随机单败淘汰，自动生成对阵图。</p>
              <p><b>3-5 人</b>：单循环积分赛；<b>6 人以上非 2 的幂</b>：瑞士轮 3 轮。</p>
              <p><b>积分前三</b>：三号挑战二号，胜者再挑战一号，决出冠军。</p>
              <p><b>观战</b>：未参赛用户可从赛事列表进入；比赛内保留公开聊天与选手私聊。</p>
            </div>

            <p v-if="createError || store.lobbyError" class="lobby__error">
              {{ createError || store.lobbyError }}
            </p>

            <div class="lobby__create-foot">
              <span>至少选择 1 名在线选手，最多 {{ MAX_PLAYERS }} 人。</span>
              <button
                type="button"
                class="lobby__button lobby__button--primary lobby__button--lg"
                :disabled="!canCreate"
                @click="create"
              >
                <AppIcon name="plus" :size="12" />
                {{ creating ? '正在创建…' : `创建比赛（${roster.length} 人）` }}
              </button>
            </div>
          </section>
        </div>

        <div class="lobby__column lobby__column--wide">
          <section class="lobby__card lobby__card--list">
            <div class="lobby__card-head">
              <span>赛事列表</span>
              <em>{{ store.tournaments.length }} 个 · 最近创建在前</em>
            </div>
            <div v-if="store.lobbyLoading && store.tournaments.length === 0" class="lobby__empty">
              正在载入赛事…
            </div>
            <div v-else-if="store.tournaments.length === 0" class="lobby__empty">
              还没有赛事。选择在线选手，创建第一场热力五子棋比赛。
            </div>
            <div v-else class="lobby__tournaments">
              <article
                v-for="tournament in store.tournaments"
                :key="tournament.id"
                class="lobby__tournament"
                :class="{
                  'is-selected': selectedTournamentId === tournament.id,
                  'is-cancelled': tournament.status === 'CANCELLED',
                }"
                @click="selectTournament(tournament)"
              >
                <div class="lobby__tournament-head">
                  <b>{{ tournament.name }}</b>
                  <span :class="`is-${tournament.status.toLowerCase()}`">
                    {{ tournamentStatusLabel(tournament.status) }}
                  </span>
                </div>
                <div class="lobby__tournament-meta">
                  <span>{{ formatLabel(tournament.format) }}</span>
                  <span>{{ playerCount(tournament) }}/{{ tournament.targetPlayers }} 人</span>
                  <span>{{ formatClock(tournament.createdAt) }}</span>
                </div>
                <div class="lobby__tournament-foot">
                  <span>
                    创建者 {{ tournament.creatorNickname }}
                    <template v-if="tournament.championNickname">
                      · 冠军 <b>{{ tournament.championNickname }}</b>
                    </template>
                  </span>
                  <div class="lobby__tournament-actions">
                    <button
                      v-if="preferredMatch(tournament)"
                      type="button"
                      class="lobby__button lobby__button--primary"
                      @click.stop="openTournament(tournament)"
                    >
                      {{ tournament.status === 'FINISHED' ? '回看' : '观战' }}
                    </button>
                    <button type="button" class="lobby__button" @click.stop="selectTournament(tournament)">
                      对阵图
                    </button>
                    <button
                      v-if="tournament.status === 'INVITING' && isCreator(tournament)"
                      type="button"
                      class="lobby__button lobby__button--danger"
                      :disabled="Boolean(actingId)"
                      @click.stop="cancel(tournament)"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <TournamentBracket
            v-if="selectedTournament"
            :tournament="selectedTournament"
            :self-user-id="selfId"
            @watch="watchMatch"
          />
          <div v-else class="lobby__placeholder">
            选择一场赛事查看对阵图
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lobby {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(3, 5, 8, 0.72);
  backdrop-filter: blur(5px);
}

.lobby__panel {
  display: flex;
  flex-direction: column;
  width: min(1280px, 100%);
  max-height: 94vh;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 26%, var(--fm-border));
  border-radius: 6px;
  background: var(--fm-panel);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}

.lobby__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-bg) 34%, transparent);
}

.lobby__title {
  display: flex;
  align-items: center;
  gap: 11px;
}

.lobby__mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #ffc06b, #ff7a1a 65%, #b74300);
  color: #23160a;
  font-size: 15px;
  font-weight: 800;
  box-shadow: 0 0 18px rgba(255, 122, 26, 0.3);
}

.lobby__eyebrow {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.lobby__title h2 {
  margin: 2px 0 0;
  color: var(--fm-text);
  font-size: 16px;
  font-weight: 600;
}

.lobby__title p {
  margin: 2px 0 0;
  color: var(--fm-text-muted);
  font-size: 9px;
}

.lobby__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lobby__connection {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  color: var(--fm-text-muted);
  font-size: 9px;
}

.lobby__connection.is-online {
  color: var(--fm-ok);
}

.lobby__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.lobby__connection.is-reconnecting .lobby__dot,
.lobby__connection.is-connecting .lobby__dot {
  animation: lobby-pulse 1.2s ease-in-out infinite;
}

@keyframes lobby-pulse {
  50% {
    opacity: 0.25;
  }
}

.lobby__icon-btn,
.lobby__close {
  display: inline-grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  cursor: pointer;
}

.lobby__icon-btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.lobby__close {
  font-size: 16px;
}

.lobby__close:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.lobby__body {
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}

.lobby__column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.lobby__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--fm-bg) 32%, transparent);
}

.lobby__card--invite {
  border-color: color-mix(in srgb, var(--fm-warn) 38%, transparent);
}

.lobby__card--active {
  border-color: color-mix(in srgb, var(--fm-ok) 30%, transparent);
}

.lobby__card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.lobby__card-head > span {
  color: var(--fm-text);
  font-size: 11.5px;
  font-weight: 600;
}

.lobby__card-head em {
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.lobby__invite {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-warn) 5%, transparent);
}

.lobby__invite-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lobby__invite-main b {
  color: var(--fm-text);
  font-size: 10.5px;
}

.lobby__invite-main span,
.lobby__invite-main em {
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.lobby__invite-main em {
  color: var(--fm-warn);
}

.lobby__invite-main em.is-expired {
  color: var(--fm-err);
}

.lobby__invite-actions {
  display: flex;
  flex: none;
  gap: 5px;
}

.lobby__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9px;
  cursor: pointer;
  white-space: nowrap;
}

.lobby__button:hover:not(:disabled) {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.lobby__button--primary {
  border-color: color-mix(in srgb, var(--fm-accent) 55%, transparent);
  background: color-mix(in srgb, var(--fm-accent) 10%, transparent);
  color: var(--fm-accent);
}

.lobby__button--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--fm-accent) 18%, transparent);
  color: var(--fm-accent);
}

.lobby__button--danger {
  border-color: color-mix(in srgb, var(--fm-err) 35%, transparent);
  color: var(--fm-err);
}

.lobby__button--danger:hover:not(:disabled) {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.lobby__button--lg {
  height: 30px;
  padding: 0 14px;
  font-size: 10px;
}

.lobby__button:disabled {
  opacity: 0.45;
  cursor: default;
}

.lobby__active-match {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 8px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  text-align: left;
  cursor: pointer;
}

.lobby__active-match:hover {
  border-color: var(--fm-ok);
}

.lobby__active-match em {
  color: var(--fm-ok);
  font-size: 8.5px;
  font-style: normal;
  white-space: nowrap;
}

.lobby__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.lobby__field > span,
.lobby__field-head > span {
  color: var(--fm-text-dim);
  font-size: 9.5px;
}

.lobby__field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.lobby__field-head em {
  color: var(--fm-text-muted);
  font-size: 8px;
  font-style: normal;
}

.lobby__field input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-bg);
  color: var(--fm-text);
  font-size: 10px;
  outline: none;
}

.lobby__field input:focus {
  border-color: var(--fm-accent);
}

.lobby__formats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.lobby__format {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  text-align: left;
  cursor: pointer;
}

.lobby__format b {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 10px;
}

.lobby__format em {
  font-size: 7.5px;
  font-style: normal;
  line-height: 1.35;
}

.lobby__format.is-active {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
}

.lobby__format.is-active b {
  color: var(--fm-accent);
}

.lobby__roster {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 210px;
  padding-right: 2px;
  overflow-y: auto;
}

.lobby__member {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  text-align: left;
  cursor: pointer;
}

.lobby__member:disabled {
  opacity: 0.45;
  cursor: default;
}

.lobby__member.is-selected,
.lobby__member.is-self {
  border-color: color-mix(in srgb, var(--fm-accent) 42%, transparent);
  background: color-mix(in srgb, var(--fm-accent) 6%, transparent);
  color: var(--fm-accent);
}

.lobby__member.is-self {
  cursor: default;
}

.lobby__avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--fm-accent) 16%, transparent);
  color: var(--fm-accent);
  font-size: 9px;
  font-weight: 600;
}

.lobby__member-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lobby__member-main b {
  overflow: hidden;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__member-main em {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__empty {
  padding: 14px 6px;
  color: var(--fm-text-muted);
  font-size: 9px;
  line-height: 1.6;
  text-align: center;
}

.lobby__rules {
  padding: 8px 9px;
  border: 1px dashed var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 24%, transparent);
}

.lobby__rules p {
  margin: 0 0 3px;
  color: var(--fm-text-muted);
  font-size: 8px;
  line-height: 1.55;
}

.lobby__rules p:last-child {
  margin-bottom: 0;
}

.lobby__rules b {
  color: var(--fm-text-dim);
  font-weight: 500;
}

.lobby__error {
  margin: 0;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--fm-err) 38%, transparent);
  border-radius: 3px;
  color: var(--fm-err);
  font-size: 9px;
}

.lobby__create-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.lobby__create-foot > span {
  color: var(--fm-text-muted);
  font-size: 8px;
}

.lobby__tournaments {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 262px;
  overflow-y: auto;
}

.lobby__tournament {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.lobby__tournament:hover {
  border-color: color-mix(in srgb, var(--fm-accent) 45%, transparent);
}

.lobby__tournament.is-selected {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 6%, transparent);
}

.lobby__tournament.is-cancelled {
  opacity: 0.55;
}

.lobby__tournament-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.lobby__tournament-head b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 10.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__tournament-head > span {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--fm-border);
  border-radius: 8px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
}

.lobby__tournament-head > span.is-running {
  border-color: color-mix(in srgb, var(--fm-ok) 40%, transparent);
  color: var(--fm-ok);
}

.lobby__tournament-head > span.is-inviting {
  border-color: color-mix(in srgb, var(--fm-warn) 40%, transparent);
  color: var(--fm-warn);
}

.lobby__tournament-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
}

.lobby__tournament-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.lobby__tournament-foot > span {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__tournament-foot > span b {
  color: var(--fm-warn);
  font-weight: 500;
}

.lobby__tournament-actions {
  display: flex;
  flex: none;
  gap: 4px;
}

.lobby__placeholder {
  display: grid;
  place-items: center;
  min-height: 180px;
  border: 1px dashed var(--fm-border);
  border-radius: 4px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

@media (max-width: 980px) {
  .lobby {
    padding: 10px;
  }

  .lobby__body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .lobby__panel {
    max-height: 96vh;
  }

  .lobby__connection {
    display: none;
  }
}

@media (max-width: 620px) {
  .lobby__head {
    align-items: flex-start;
  }

  .lobby__title p {
    display: none;
  }

  .lobby__formats {
    grid-template-columns: 1fr;
  }

  .lobby__create-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .lobby__tournament-foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
