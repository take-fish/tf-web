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
  matchStatusLabel,
  playerName,
} from '../lib/gameFormat'
import type { GameFormat, GameMatch, GamePlayer, GameTournament } from '../types'

const emit = defineEmits<{ close: [] }>()

const store = useTournamentStore()
const router = useRouter()
const route = useRoute()

const selectedOpponentId = ref('')
const format = ref<GameFormat>('BO1')
const creating = ref(false)
const actingId = ref('')
const localError = ref('')
const feedback = ref('')
const now = ref(Date.now())

let clockTimer: ReturnType<typeof setInterval> | undefined

const selfId = computed(() => store.ownUserId)
const candidates = computed(() =>
  store.lobbyOnline.filter((member) => member.userId !== selfId.value),
)
const selectedOpponent = computed(
  () => candidates.value.find((member) => member.userId === selectedOpponentId.value) ?? null,
)
const invitations = computed(() => store.pendingDuelInvitations)
const duels = computed(() =>
  [...store.duels].sort((left, right) => right.createdAt - left.createdAt),
)
const canCreate = computed(
  () => !creating.value && Boolean(selectedOpponent.value) && store.status === 'online',
)

function opponentOf(duel: GameTournament): GamePlayer | null {
  return duel.players.find((player) => player.userId !== selfId.value) ?? null
}

function isInvited(duel: GameTournament): boolean {
  return duel.players.some(
    (player) => player.userId === selfId.value && player.status === 'INVITED',
  )
}

function isCreator(duel: GameTournament): boolean {
  return duel.creatorUserId === selfId.value
}

function invitationExpired(duel: GameTournament): boolean {
  return duel.inviteDeadline <= now.value
}

function invitationRemaining(duel: GameTournament): string {
  return countdown(duel.inviteDeadline, now.value)
}

function statusLabel(duel: GameTournament): string {
  if (duel.status === 'INVITING') {
    return isInvited(duel) ? '待你响应' : '等待对方响应'
  }
  if (duel.status === 'RUNNING') return '进行中'
  if (duel.status === 'FINISHED') return '已结束'
  return '已取消'
}

function statusClass(duel: GameTournament): string {
  if (duel.status === 'INVITING') return isInvited(duel) ? 'is-invite' : 'is-waiting'
  return `is-${duel.status.toLowerCase()}`
}

function liveMatch(duel: GameTournament): GameMatch | undefined {
  return (
    duel.matches.find(
      (match) => match.status === 'RUNNING' || match.status === 'READY',
    ) ?? duel.matches.find((match) => match.status === 'FINISHED')
  )
}

function scoreLine(duel: GameTournament): string {
  const match = liveMatch(duel)
  if (!match) return '尚未开局'
  const isPlayer1 = match.player1UserId === selfId.value
  const own = isPlayer1 ? match.player1Score : match.player2Score
  const peer = isPlayer1 ? match.player2Score : match.player1Score
  return `我 ${own} : ${peer} 对方`
}

function resultText(duel: GameTournament): string {
  if (duel.status !== 'FINISHED' || !duel.championUserId) return ''
  return duel.championUserId === selfId.value ? '你赢下了这场约战' : '对方赢下了这场约战'
}

function opponentLabel(duel: GameTournament): string {
  const opponent = opponentOf(duel)
  return playerName(opponent?.userId ?? null, opponent?.nickname ?? null)
}

function busyWith(userId: string): boolean {
  return store.activeDuels.some((duel) => opponentOf(duel)?.userId === userId)
}

function selectOpponent(userId: string) {
  selectedOpponentId.value =
    selectedOpponentId.value === userId ? '' : userId
  feedback.value = ''
}

async function propose() {
  if (!canCreate.value || !selectedOpponent.value) return
  creating.value = true
  localError.value = ''
  feedback.value = ''
  try {
    await store.createDuelFor(selectedOpponent.value, format.value)
    feedback.value = `已向 ${selectedOpponent.value.nickname} 发出 ${format.value} 约战邀请`
    selectedOpponentId.value = ''
  } catch (error) {
    localError.value = formatApiError(error, '约战发起失败')
  } finally {
    creating.value = false
  }
}

async function respond(duel: GameTournament, accept: boolean) {
  if (actingId.value) return
  actingId.value = duel.id
  localError.value = ''
  feedback.value = ''
  try {
    if (accept) await store.acceptDuelInvitation(duel.id)
    else await store.declineDuelInvitation(duel.id)
    feedback.value = accept ? '已接受约战，等待开局' : '已拒绝约战'
  } catch (error) {
    localError.value = formatApiError(error, accept ? '接受约战失败' : '拒绝约战失败')
  } finally {
    actingId.value = ''
  }
}

async function cancel(duel: GameTournament) {
  if (actingId.value) return
  if (!window.confirm('确认取消这场约战？取消后对方将无法接受。')) return
  actingId.value = duel.id
  localError.value = ''
  feedback.value = ''
  try {
    await store.cancelDuelById(duel.id)
    feedback.value = '约战已取消'
  } catch (error) {
    localError.value = formatApiError(error, '取消约战失败')
  } finally {
    actingId.value = ''
  }
}

function openMatch(matchId: string) {
  void router.push({ path: '/games', query: { ...route.query, watch: matchId } })
  emit('close')
}

// 对手接受后服务端推送 duel_started，直接带双方进入对局。
watch(
  () => store.duelStartedMatchId,
  (matchId) => {
    if (!matchId) return
    store.consumeDuelStartedMatch()
    openMatch(matchId)
  },
)

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div
    class="duel"
    role="dialog"
    aria-modal="true"
    aria-label="一对一约战"
    @click.self="emit('close')"
  >
    <section class="duel__panel">
      <header class="duel__head">
        <div class="duel__title">
          <span class="duel__mark">D</span>
          <div>
            <div class="duel__eyebrow">OPS / DUEL TERMINAL</div>
            <h2>一对一约战</h2>
            <p>仅双方可见 · 不计积分 · 无聊天与观战</p>
          </div>
        </div>
        <div class="duel__head-actions">
          <span class="duel__connection" :class="`is-${store.status}`">
            <span class="duel__dot" />
            {{ store.status === 'online' ? '调度通道已连接' : '调度通道离线' }}
          </span>
          <button class="duel__icon-btn" title="刷新约战" @click="store.refreshLobby()">
            <AppIcon name="refresh" :size="13" />
          </button>
          <button class="duel__close" title="关闭一对一" @click="emit('close')">×</button>
        </div>
      </header>

      <div class="duel__body">
        <div class="duel__column">
          <section class="duel__card">
            <div class="duel__card-head">
              <span>发起约战</span>
              <em>仅在线成员 · 5 分钟未响应自动过期</em>
            </div>

            <div class="duel__field">
              <div class="duel__member-list">
                <button
                  v-for="member in candidates"
                  :key="member.userId"
                  type="button"
                  class="duel__member"
                  :class="{ 'is-selected': selectedOpponentId === member.userId }"
                  :disabled="busyWith(member.userId) || creating"
                  @click="selectOpponent(member.userId)"
                >
                  <span class="duel__avatar">{{ member.nickname.slice(0, 1).toUpperCase() }}</span>
                  <span class="duel__member-main">
                    <b>{{ member.nickname }}</b>
                    <em>@{{ member.userId }}</em>
                  </span>
                  <span v-if="busyWith(member.userId)" class="duel__member-tag">约战中</span>
                  <AppIcon
                    v-else
                    :name="selectedOpponentId === member.userId ? 'check' : 'plus'"
                    :size="12"
                  />
                </button>
                <div v-if="candidates.length === 0" class="duel__empty">
                  当前没有其他在线成员，无法发起约战。
                </div>
              </div>
            </div>

            <div class="duel__field">
              <span>赛制</span>
              <div class="duel__formats">
                <button
                  v-for="option in (['BO1', 'BO3', 'BO5'] as GameFormat[])"
                  :key="option"
                  type="button"
                  class="duel__format"
                  :class="{ 'is-active': format === option }"
                  @click="format = option"
                >
                  <b>{{ option }}</b>
                  <em>{{ option === 'BO1' ? '一局定胜负' : option === 'BO3' ? '三局两胜' : '五局三胜' }}</em>
                </button>
              </div>
            </div>

            <p v-if="feedback" class="duel__feedback">{{ feedback }}</p>
            <p v-if="localError || store.duelError" class="duel__error">
              {{ localError || store.duelError }}
            </p>

            <button
              type="button"
              class="duel__button duel__button--primary duel__button--lg"
              :disabled="!canCreate"
              @click="propose"
            >
              <AppIcon name="plus" :size="12" />
              {{
                creating
                  ? '正在发出邀请…'
                  : selectedOpponent
                    ? `向 ${selectedOpponent.nickname} 发起 ${format}`
                    : '选择一名在线成员'
              }}
            </button>
          </section>

          <section class="duel__card duel__card--invite">
            <div class="duel__card-head">
              <span>收到的约战</span>
              <em>{{ invitations.length }} 个待响应</em>
            </div>
            <div v-if="invitations.length === 0" class="duel__empty">
              暂时没有待响应的约战邀请。
            </div>
            <article
              v-for="duel in invitations"
              :key="duel.id"
              class="duel__invite"
            >
              <div class="duel__invite-main">
                <b>{{ opponentLabel(duel) }} 向你发起 {{ duel.format }} 约战</b>
                <em :class="{ 'is-expired': invitationExpired(duel) }">
                  <template v-if="invitationExpired(duel)">邀请已超时</template>
                  <template v-else>剩余 {{ invitationRemaining(duel) }}</template>
                </em>
              </div>
              <div class="duel__invite-actions">
                <button
                  type="button"
                  class="duel__button duel__button--primary"
                  :disabled="Boolean(actingId) || invitationExpired(duel)"
                  @click="respond(duel, true)"
                >
                  接受
                </button>
                <button
                  type="button"
                  class="duel__button"
                  :disabled="Boolean(actingId)"
                  @click="respond(duel, false)"
                >
                  拒绝
                </button>
              </div>
            </article>
          </section>
        </div>

        <div class="duel__column duel__column--wide">
          <section class="duel__card duel__card--list">
            <div class="duel__card-head">
              <span>我的约战</span>
              <em>{{ duels.length }} 场 · 仅你与对手可见</em>
            </div>
            <div v-if="duels.length === 0" class="duel__empty">
              还没有约战记录。选择一名在线成员，发起第一场一对一。
            </div>
            <div v-else class="duel__list">
              <article
                v-for="duel in duels"
                :key="duel.id"
                class="duel__record"
                :class="{ 'is-cancelled': duel.status === 'CANCELLED' }"
              >
                <div class="duel__record-head">
                  <b>{{ opponentLabel(duel) }}</b>
                  <span class="duel__status" :class="statusClass(duel)">
                    {{ statusLabel(duel) }}
                  </span>
                </div>
                <div class="duel__record-meta">
                  <span>{{ formatLabel(duel.format) }}</span>
                  <span>{{ scoreLine(duel) }}</span>
                  <span>{{ formatClock(duel.createdAt) }}</span>
                  <template v-if="duel.status === 'INVITING'">
                    <span v-if="isCreator(duel)">
                      等待对方响应 · 剩余 {{ invitationRemaining(duel) }}
                    </span>
                    <span v-else>等待你响应 · 剩余 {{ invitationRemaining(duel) }}</span>
                  </template>
                  <span v-else-if="liveMatch(duel)">
                    {{ matchStatusLabel(liveMatch(duel)!.status) }}
                  </span>
                </div>
                <p v-if="resultText(duel)" class="duel__record-result">
                  {{ resultText(duel) }}
                </p>
                <div class="duel__record-actions">
                  <template v-if="duel.status === 'INVITING' && isInvited(duel)">
                    <button
                      type="button"
                      class="duel__button duel__button--primary"
                      :disabled="Boolean(actingId) || invitationExpired(duel)"
                      @click="respond(duel, true)"
                    >
                      接受
                    </button>
                    <button
                      type="button"
                      class="duel__button"
                      :disabled="Boolean(actingId)"
                      @click="respond(duel, false)"
                    >
                      拒绝
                    </button>
                  </template>
                  <button
                    v-else-if="duel.status === 'INVITING' && isCreator(duel)"
                    type="button"
                    class="duel__button duel__button--danger"
                    :disabled="Boolean(actingId)"
                    @click="cancel(duel)"
                  >
                    取消约战
                  </button>
                  <button
                    v-else-if="liveMatch(duel)"
                    type="button"
                    class="duel__button"
                    :class="{ 'duel__button--primary': duel.status === 'RUNNING' }"
                    @click="openMatch(liveMatch(duel)!.id)"
                  >
                    {{ duel.status === 'FINISHED' ? '查看战报' : '进入对局' }}
                  </button>
                  <span v-else class="duel__record-note">无可进入的对局</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.duel {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(3, 5, 8, 0.78);
  backdrop-filter: blur(5px);
}

.duel__panel {
  display: flex;
  flex-direction: column;
  width: min(1040px, 100%);
  max-height: 92vh;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 22%, var(--fm-border));
  border-radius: 4px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
}

.duel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-bg) 34%, transparent);
}

.duel__title {
  display: flex;
  align-items: center;
  gap: 11px;
}

.duel__mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 42%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 13px;
  font-weight: 600;
}

.duel__eyebrow {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.duel__title h2 {
  margin: 2px 0 0;
  color: var(--fm-text);
  font-size: 16px;
  font-weight: 600;
}

.duel__title p {
  margin: 2px 0 0;
  color: var(--fm-text-muted);
  font-size: 9px;
}

.duel__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.duel__connection {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  color: var(--fm-text-muted);
  font-size: 9px;
}

.duel__connection.is-online {
  color: var(--fm-ok);
}

.duel__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.duel__icon-btn,
.duel__close {
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

.duel__icon-btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.duel__close {
  font-size: 16px;
}

.duel__close:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.duel__body {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}

.duel__column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.duel__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--fm-bg) 32%, transparent);
}

.duel__card--invite {
  border-color: color-mix(in srgb, var(--fm-warn) 38%, transparent);
}

.duel__card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.duel__card-head > span {
  color: var(--fm-text);
  font-size: 11.5px;
  font-weight: 600;
}

.duel__card-head em {
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.duel__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.duel__field > span {
  color: var(--fm-text-dim);
  font-size: 9.5px;
}

.duel__member-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 230px;
  padding-right: 2px;
  overflow-y: auto;
}

.duel__member {
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

.duel__member:disabled {
  opacity: 0.5;
  cursor: default;
}

.duel__member.is-selected {
  border-color: color-mix(in srgb, var(--fm-accent) 42%, transparent);
  background: color-mix(in srgb, var(--fm-accent) 6%, transparent);
  color: var(--fm-accent);
}

.duel__avatar {
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

.duel__member-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.duel__member-main b {
  overflow: hidden;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duel__member-main em {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duel__member-tag {
  flex: none;
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--fm-warn) 32%, transparent);
  border-radius: 8px;
  color: var(--fm-warn);
  font-size: 7px;
}

.duel__formats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.duel__format {
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

.duel__format b {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 10px;
}

.duel__format em {
  font-size: 7.5px;
  font-style: normal;
}

.duel__format.is-active {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
}

.duel__format.is-active b {
  color: var(--fm-accent);
}

.duel__button {
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

.duel__button:hover:not(:disabled) {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.duel__button--primary {
  border-color: color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
  color: var(--fm-accent);
}

.duel__button--danger {
  border-color: color-mix(in srgb, var(--fm-err) 35%, transparent);
  color: var(--fm-err);
}

.duel__button--lg {
  height: 30px;
  padding: 0 14px;
  font-size: 10px;
}

.duel__button:disabled {
  opacity: 0.45;
  cursor: default;
}

.duel__invite {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-warn) 5%, transparent);
}

.duel__invite-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.duel__invite-main b {
  color: var(--fm-text);
  font-size: 10.5px;
}

.duel__invite-main em {
  color: var(--fm-warn);
  font-size: 8.5px;
  font-style: normal;
}

.duel__invite-main em.is-expired {
  color: var(--fm-err);
}

.duel__invite-actions {
  display: flex;
  flex: none;
  gap: 5px;
}

.duel__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 430px;
  overflow-y: auto;
}

.duel__record {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
}

.duel__record.is-cancelled {
  opacity: 0.55;
}

.duel__record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.duel__record-head b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 10.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duel__status {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--fm-border);
  border-radius: 8px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  white-space: nowrap;
}

.duel__status.is-invite {
  border-color: color-mix(in srgb, var(--fm-warn) 34%, transparent);
  color: var(--fm-warn);
}

.duel__status.is-waiting {
  color: var(--fm-text-muted);
}

.duel__status.is-running {
  border-color: color-mix(in srgb, var(--fm-ok) 32%, transparent);
  color: var(--fm-ok);
}

.duel__record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
}

.duel__record-result {
  margin: 0;
  color: var(--fm-ok);
  font-size: 8.5px;
}

.duel__record-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 2px;
}

.duel__record-note {
  color: var(--fm-text-muted);
  font-size: 8px;
}

.duel__feedback {
  margin: 0;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--fm-ok) 35%, transparent);
  border-radius: 3px;
  color: var(--fm-ok);
  font-size: 9px;
}

.duel__error {
  margin: 0;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--fm-err) 38%, transparent);
  border-radius: 3px;
  color: var(--fm-err);
  font-size: 9px;
}

.duel__empty {
  padding: 16px 6px;
  color: var(--fm-text-muted);
  font-size: 9px;
  line-height: 1.6;
  text-align: center;
}

@media (max-width: 900px) {
  .duel {
    padding: 10px;
  }

  .duel__body {
    grid-template-columns: 1fr;
  }

  .duel__panel {
    max-height: 96vh;
  }

  .duel__connection {
    display: none;
  }
}
</style>
