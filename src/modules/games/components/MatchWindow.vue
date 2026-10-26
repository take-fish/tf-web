<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useTournamentStore } from '@/stores/tournament'
import {
  formatClock,
  formatDuration,
  formatLabel,
  isParticipant,
  playerName,
} from '../lib/gameFormat'
import type { GameChatChannel, GameRound } from '../types'
import GomokuBoard from './GomokuBoard.vue'

const emit = defineEmits<{ close: [] }>()

const store = useTournamentStore()

const MOVE_TIMEOUT_SECONDS = 30

const now = ref(Date.now())
const channel = ref<GameChatChannel>('PUBLIC')
const chatInput = ref('')
const chatBody = ref<HTMLElement | null>(null)
const actionError = ref('')
const resigning = ref(false)
const boardExpanded = ref(false)

let clockTimer: ReturnType<typeof setInterval> | undefined

const match = computed(() => store.currentMatch)
/** 一对一约战：只用棋盘与比分，不提供聊天与观战。 */
const isDuel = computed(() => match.value?.kind === 'DUEL')
const matchLoading = computed(() => store.matchLoading)
const matchError = computed(() => store.matchError)
const chatLoading = computed(() => store.chatLoading)
const chatError = computed(() => store.chatError)
const tournament = computed(() => store.currentTournament)
const round = computed<GameRound | null>(() => store.currentRound)
const selfId = computed(() => store.ownUserId)
const participant = computed(() => isParticipant(match.value, selfId.value))
const isBlack = computed(() => Boolean(round.value && round.value.blackUserId === selfId.value))
const myColor = computed(() => {
  if (!participant.value || !round.value) return ''
  return isBlack.value ? '先手' : '后手'
})
const blackName = computed(() =>
  match.value && round.value
    ? playerName(round.value.blackUserId, nicknameFor(round.value.blackUserId))
    : '待定',
)
const whiteName = computed(() =>
  match.value && round.value
    ? playerName(round.value.whiteUserId, nicknameFor(round.value.whiteUserId))
    : '待定',
)
const turnName = computed(() =>
  match.value && round.value?.turnUserId
    ? nicknameFor(round.value.turnUserId)
    : '',
)
const isMyTurn = computed(
  () =>
    participant.value &&
    round.value?.status === 'RUNNING' &&
    round.value.turnUserId === selfId.value,
)
const boardInteractive = computed(
  () => isMyTurn.value && match.value?.status === 'RUNNING',
)
const readyUserIds = computed(() => round.value?.readyUserIds ?? [])
const canReady = computed(
  () =>
    participant.value &&
    store.status === 'online' &&
    (match.value?.status === 'READY' ||
      (match.value?.status === 'RUNNING' && round.value?.status === 'REST')),
)
const restSeconds = computed(() => {
  if (!round.value?.restUntil) return 0
  return Math.max(0, Math.ceil((round.value.restUntil - now.value) / 1000))
})
const moveSeconds = computed(() => {
  if (!round.value || round.value.status !== 'RUNNING' || !round.value.turnUserId) return 0
  return Math.max(
    0,
    Math.ceil((round.value.lastMoveAt + MOVE_TIMEOUT_SECONDS * 1000 - now.value) / 1000),
  )
})
const maxGames = computed(() => {
  if (match.value?.stage === 'LEAGUE') return 1
  const format = tournament.value?.format ?? 'BO1'
  return format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1
})
const gameLabel = computed(() => {
  if (round.value) return `第 ${round.value.gameNo} / ${maxGames.value} 阶段`
  return maxGames.value > 1 ? `BO${maxGames.value}` : 'BO1'
})
const stateLabel = computed(() => {
  if (!match.value) return ''
  if (match.value.status === 'FINISHED') return '已结束'
  if (match.value.status === 'READY') return '等待双方就绪'
  if (round.value?.status === 'REST') return '阶段间隔'
  if (round.value?.status === 'RUNNING') return '执行中'
  return '就绪中'
})
const winnerName = computed(() => {
  const value = match.value
  if (!value?.winnerUserId) return ''
  if (value.winnerUserId === value.player1UserId) return value.player1Nickname || value.winnerUserId
  if (value.winnerUserId === value.player2UserId) return value.player2Nickname || value.winnerUserId
  return value.winnerUserId
})
const resultReason = computed(() => store.lastResult?.reason ?? '')
const chatClosed = computed(
  () =>
    tournament.value?.status === 'FINISHED' || tournament.value?.status === 'CANCELLED',
)
const chatMessages = computed(() =>
  store.chatMessages.filter((message) => message.channel === channel.value),
)
const privateTabVisible = computed(() => participant.value)
const chatHint = computed(() => {
  if (chatClosed.value) return '演练已结束，聊天记录仅供回看'
  if (channel.value === 'PLAYER_DM') return '仅双方成员可见，结束后仍可回看'
  return '公开频道 · 所有查看者可见'
})
const chatPlaceholder = computed(() => {
  if (chatClosed.value) return '演练已结束，无法发送消息'
  if (channel.value === 'PLAYER_DM') return '与对方私聊…'
  return '和频道里的成员聊聊…'
})
const readyState = computed(() => {
  if (!match.value) return ''
  if (match.value.status === 'READY') return '双方确认就绪后开始执行，随机分配先手'
  if (round.value?.status === 'REST') {
    return readyUserIds.value.length
      ? `已就绪：${readyUserIds.value.map(nicknameFor).join('、')}`
      : '双方可选择立即继续，或等待间隔结束'
  }
  return ''
})
const bothReady = computed(() => {
  const value = match.value
  if (!value) return false
  return (
    readyUserIds.value.includes(value.player1UserId ?? '') &&
    readyUserIds.value.includes(value.player2UserId ?? '')
  )
})

function nicknameFor(userId: string | null): string {
  if (!userId) return '待定'
  const value = match.value
  if (value?.player1UserId === userId) return value.player1Nickname || userId
  if (value?.player2UserId === userId) return value.player2Nickname || userId
  return userId
}

function colorFor(userId: string | null): string {
  if (!userId || !round.value) return ''
  if (round.value.blackUserId === userId) return 'A'
  if (round.value.whiteUserId === userId) return 'B'
  return ''
}

function hasReady(userId: string | null): boolean {
  return Boolean(userId && readyUserIds.value.includes(userId))
}

function isWinner(userId: string | null): boolean {
  return Boolean(userId && match.value?.winnerUserId === userId)
}

async function scrollChat() {
  await nextTick()
  if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight
}

function sendChat() {
  const text = chatInput.value.trim()
  if (!text || chatClosed.value) return
  actionError.value = ''
  void store.sendChat(text, channel.value).then((ok) => {
    if (ok) {
      chatInput.value = ''
      void scrollChat()
    }
  })
}

function ready() {
  actionError.value = ''
  if (!store.ready()) actionError.value = store.lastError
}

function place(x: number, y: number) {
  if (!boardInteractive.value) return
  actionError.value = ''
  if (!store.placeStone(x, y)) actionError.value = store.lastError
}

function openBoardWindow() {
  boardExpanded.value = true
}

function closeBoardWindow() {
  boardExpanded.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !boardExpanded.value) return
  event.preventDefault()
  closeBoardWindow()
}

function resign() {
  if (!participant.value || resigning.value) return
  if (!window.confirm('确认终止本轮？本轮将判定为失败。')) return
  resigning.value = true
  actionError.value = ''
  if (!store.resign()) {
    actionError.value = store.lastError
    resigning.value = false
  }
}

watch(
  () => match.value?.status,
  (status) => {
    if (status === 'FINISHED') resigning.value = false
  },
)

watch(
  () => [channel.value, chatMessages.value.length],
  () => void scrollChat(),
)

watch(privateTabVisible, (visible) => {
  if (!visible && channel.value === 'PLAYER_DM') channel.value = 'PUBLIC'
})

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  window.addEventListener('keydown', onKeydown)
  void scrollChat()
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="match-window"
    role="dialog"
    aria-modal="true"
    :aria-label="isDuel ? '一对一约战对局' : '演练执行窗口'"
  >
    <div class="match-window__panel">
      <header class="match-window__head">
        <div class="match-window__title">
          <span class="match-window__mark">{{ isDuel ? 'D' : 'T' }}</span>
          <div>
            <div class="match-window__eyebrow">
              <template v-if="isDuel">
                {{ tournament?.name || '一对一约战' }} / DUEL SESSION
              </template>
              <template v-else>{{ tournament?.name || '联调演练' }} / DRILL SESSION</template>
            </div>
            <h2>
              {{ match ? `${gameLabel} · ${stateLabel}` : '正在连接执行通道…' }}
              <span v-if="tournament" class="match-window__format">
                {{ tournament.format }}
              </span>
            </h2>
          </div>
        </div>
        <div class="match-window__head-actions">
          <span class="match-window__mode">
            <span class="match-window__dot" :class="{ 'is-live': store.status === 'online' }" />
            {{
              isDuel
                ? '约战参与方'
                : participant
                  ? myColor
                    ? `你是${myColor}`
                    : '参与方'
                  : '只读查看'
            }}
          </span>
          <button
            class="match-window__close"
            :title="isDuel ? '关闭约战窗口' : '关闭执行窗口'"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </header>

      <div v-if="matchLoading" class="match-window__loading">正在载入执行记录…</div>
      <div v-else-if="matchError" class="match-window__error">
        <span>{{ matchError }}</span>
        <button type="button" @click="store.currentMatchId && store.watch(store.currentMatchId)">
          重试
        </button>
      </div>

      <div v-else-if="match" class="match-window__body" :class="{ 'is-duel': isDuel }">
        <section class="match-window__game">
          <div class="match-window__scoreboard">
            <div
              class="match-window__player"
              :class="{
                'is-turn': round?.turnUserId === match.player1UserId,
                'is-winner': isWinner(match.player1UserId),
                'is-self': match.player1UserId === selfId,
              }"
            >
              <span class="match-window__chip" :class="{ 'is-black': round?.blackUserId === match.player1UserId }">
                {{ colorFor(match.player1UserId) || '·' }}
              </span>
              <div class="match-window__player-main">
                <b>{{ playerName(match.player1UserId, match.player1Nickname) }}</b>
                <span v-if="hasReady(match.player1UserId)" class="match-window__ready">已就绪</span>
              </div>
              <strong>{{ match.player1Score }}</strong>
            </div>
            <div class="match-window__vs">
              <span>{{ round?.status === 'REST' ? 'REST' : 'VS' }}</span>
              <em v-if="round?.status === 'REST'">
                {{ formatDuration(restSeconds) }}
              </em>
            </div>
            <div
              class="match-window__player match-window__player--right"
              :class="{
                'is-turn': round?.turnUserId === match.player2UserId,
                'is-winner': isWinner(match.player2UserId),
                'is-self': match.player2UserId === selfId,
              }"
            >
              <strong>{{ match.player2Score }}</strong>
              <div class="match-window__player-main">
                <b>{{ playerName(match.player2UserId, match.player2Nickname) }}</b>
                <span v-if="hasReady(match.player2UserId)" class="match-window__ready">已就绪</span>
              </div>
              <span class="match-window__chip" :class="{ 'is-white': round?.whiteUserId === match.player2UserId }">
                {{ colorFor(match.player2UserId) || '·' }}
              </span>
            </div>
          </div>

          <div class="match-window__statusbar">
            <template v-if="match.status === 'READY'">
              <span class="match-window__hint">{{ readyState }}</span>
              <button
                v-if="canReady"
                class="match-window__primary"
                :disabled="hasReady(selfId)"
                @click="ready"
              >
                {{ hasReady(selfId) ? '已就绪，等待对方' : '开始执行' }}
              </button>
            </template>
            <template v-else-if="match.status === 'RUNNING' && round?.status === 'REST'">
              <span class="match-window__hint">
                {{ readyState }} · 休息 {{ formatDuration(restSeconds) }}
              </span>
              <button
                v-if="canReady"
                class="match-window__primary"
                :disabled="hasReady(selfId)"
                @click="ready"
              >
                {{ hasReady(selfId) ? (bothReady ? '双方已确认，即将开始' : '已就绪，等待对方') : '立即继续' }}
              </button>
            </template>
            <template v-else-if="match.status === 'RUNNING'">
              <span class="match-window__hint">
                {{ turnName }} 轮次 · {{ round?.moveCount ?? 0 }} 步
                <template v-if="isMyTurn"> · 请提交</template>
                <template v-else-if="participant"> · 等待对方</template>
              </span>
              <span
                class="match-window__clock"
                :class="{ 'is-danger': moveSeconds <= 10 }"
              >
                {{ formatDuration(moveSeconds) }}
              </span>
              <button v-if="participant" class="match-window__ghost" :disabled="resigning" @click="resign">
                终止本轮
              </button>
            </template>
            <template v-else-if="match.status === 'FINISHED'">
              <span class="match-window__hint">
                结果：<b>{{ winnerName }}</b>
                <template v-if="resultReason"> · {{ resultReason }}</template>
              </span>
              <span class="match-window__finished">FINISHED</span>
            </template>
            <span v-else class="match-window__hint">
              {{ readyState }}
            </span>
          </div>

          <div v-if="match.status === 'FINISHED'" class="match-window__result">
            <span class="match-window__result-title">
              {{ winnerName }} 完成本轮
            </span>
            <span class="match-window__result-score">
              {{ match.player1Score }} : {{ match.player2Score }}
            </span>
            <span class="match-window__result-note">
              {{
                isDuel
                  ? '战报仅双方可见'
                  : chatClosed
                    ? '聊天记录仅供回看'
                    : '演练仍在进行，可继续留在公开频道'
              }}
            </span>
          </div>

          <div v-if="isDuel" class="match-window__duel-note">
            <AppIcon name="user" :size="12" />
            一对一约战 · 不计积分 · 无聊天与观战 · 战报仅双方可见
          </div>

          <div
            v-else-if="!participant && match.status !== 'FINISHED'"
            class="match-window__spectator"
          >
            <AppIcon name="user" :size="12" />
            只读查看 · 公开频道可参与讨论
          </div>

          <GomokuBoard
            :moves="round?.moves ?? []"
            :black-user-id="round?.blackUserId ?? match.player1UserId ?? ''"
            :white-user-id="round?.whiteUserId ?? match.player2UserId ?? ''"
            :self-user-id="selfId"
            :turn-user-id="round?.turnUserId ?? null"
            :interactive="boardInteractive"
            :disabled="match.status !== 'RUNNING' || round?.status !== 'RUNNING'"
            @place="place"
            @expand="openBoardWindow"
          />

          <div class="match-window__footer">
            <span>
              {{ blackName }} 先手 · {{ whiteName }} 后手
            </span>
            <span v-if="tournament">{{ formatLabel(tournament.format) }}</span>
            <span v-if="round">第 {{ round.gameNo }} / {{ maxGames }} 阶段</span>
            <span v-if="match.status === 'RUNNING' && round">
              提交倒计时 {{ formatDuration(moveSeconds) }}
            </span>
            <button type="button" class="match-window__expand" @click="openBoardWindow">
              <AppIcon name="external" :size="10" />
              双击棋盘放大
            </button>
          </div>

          <p v-if="actionError || store.lastError" class="match-window__action-error">
            {{ actionError || store.lastError }}
          </p>
        </section>

        <aside v-if="!isDuel" class="match-window__chat">
          <header class="match-window__chat-head">
            <div class="match-window__tabs">
              <button
                type="button"
                :class="{ 'is-active': channel === 'PUBLIC' }"
                @click="channel = 'PUBLIC'"
              >
                公开频道
              </button>
              <button
                v-if="privateTabVisible"
                type="button"
                :class="{ 'is-active': channel === 'PLAYER_DM' }"
                @click="channel = 'PLAYER_DM'"
              >
                双方私聊
              </button>
            </div>
            <span class="match-window__chat-hint">{{ chatHint }}</span>
          </header>

          <div ref="chatBody" class="match-window__messages">
            <div v-if="chatLoading" class="match-window__chat-empty">正在同步聊天记录…</div>
            <div v-else-if="chatMessages.length === 0" class="match-window__chat-empty">
              {{ channel === 'PLAYER_DM' ? '还没有私聊消息，先和对方打个招呼吧' : '暂时没有消息' }}
            </div>
            <div
              v-for="message in chatMessages"
              :key="message.id"
              class="match-window__message"
              :class="{ 'is-self': message.fromUserId === selfId }"
            >
              <div class="match-window__message-meta">
                <b>{{ message.fromNickname }}</b>
                <span>{{ formatClock(message.createdAt) }}</span>
              </div>
              <p>{{ message.content }}</p>
            </div>
            <p v-if="chatError" class="match-window__chat-error">{{ chatError }}</p>
          </div>

          <form class="match-window__composer" @submit.prevent="sendChat">
            <input
              v-model="chatInput"
              type="text"
              :placeholder="chatPlaceholder"
              :disabled="chatClosed || store.chatSending"
              maxlength="1000"
            />
            <button
              type="submit"
              class="match-window__send"
              :disabled="chatClosed || store.chatSending || !chatInput.trim()"
            >
              发送
            </button>
          </form>
        </aside>
      </div>
    </div>

    <div
      v-if="boardExpanded"
      class="board-window"
      role="dialog"
      aria-modal="true"
      aria-label="放大棋盘"
      @click.self="closeBoardWindow"
    >
      <section class="board-window__panel">
        <header class="board-window__head">
          <div class="board-window__title">
            <span class="board-window__mark">15×15</span>
            <div>
              <div class="board-window__eyebrow">BOARD / FOCUS VIEW</div>
              <b>{{ blackName }} 先手 · {{ whiteName }} 后手</b>
            </div>
          </div>
          <div class="board-window__actions">
            <span class="board-window__status">
              {{ stateLabel }}
              <template v-if="match?.status === 'RUNNING' && round">
                · {{ turnName }} 轮次 · {{ formatDuration(moveSeconds) }}
              </template>
            </span>
            <span class="board-window__hint">
              拖动右下角调整大小 · 双击棋盘或按 Esc 退出
            </span>
            <button
              type="button"
              class="board-window__close"
              title="关闭放大棋盘"
              @click="closeBoardWindow"
            >
              ×
            </button>
          </div>
        </header>
        <div class="board-window__stage">
          <GomokuBoard
            fluid
            :moves="round?.moves ?? []"
            :black-user-id="round?.blackUserId ?? match?.player1UserId ?? ''"
            :white-user-id="round?.whiteUserId ?? match?.player2UserId ?? ''"
            :self-user-id="selfId"
            :turn-user-id="round?.turnUserId ?? null"
            :interactive="boardInteractive"
            :disabled="match?.status !== 'RUNNING' || round?.status !== 'RUNNING'"
            @place="place"
            @expand="closeBoardWindow"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.match-window {
  position: fixed;
  inset: 0;
  z-index: 1150;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(3, 5, 8, 0.74);
  backdrop-filter: blur(5px);
}

.match-window__panel {
  display: flex;
  flex-direction: column;
  width: min(1220px, 100%);
  max-height: 94vh;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 18%, var(--fm-border));
  border-radius: 4px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
}

.match-window__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-bg) 35%, transparent);
}

.match-window__title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.match-window__mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 11px;
  font-weight: 600;
}

.match-window__eyebrow {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  letter-spacing: 0.1em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-window__title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 1px 0 0;
  color: var(--fm-text);
  font-size: 13px;
  font-weight: 600;
}

.match-window__format {
  padding: 1px 6px;
  border: 1px solid var(--fm-border);
  border-radius: 9px;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.match-window__head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.match-window__mode {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  color: var(--fm-text-dim);
  font-size: 9.5px;
}

.match-window__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--fm-text-muted);
}

.match-window__dot.is-live {
  background: var(--fm-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fm-ok) 16%, transparent);
}

.match-window__close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 16px;
  cursor: pointer;
}

.match-window__close:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.match-window__loading,
.match-window__error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 320px;
  color: var(--fm-text-muted);
  font-size: 11px;
}

.match-window__error {
  color: var(--fm-err);
}

.match-window__error button {
  padding: 4px 10px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text);
  font-size: 10px;
  cursor: pointer;
}

.match-window__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  min-height: 0;
  overflow: hidden;
}

.match-window__body.is-duel {
  grid-template-columns: minmax(0, 1fr);
}

.match-window__game {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px 16px 14px;
  overflow-y: auto;
}

.match-window__scoreboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.match-window__player {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 45%, transparent);
}

.match-window__player--right {
  justify-content: flex-end;
  text-align: right;
}

.match-window__player.is-turn {
  border-color: color-mix(in srgb, var(--fm-accent) 34%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-accent) 5%, transparent);
}

.match-window__player.is-winner {
  border-color: color-mix(in srgb, var(--fm-ok) 36%, var(--fm-border));
}

.match-window__player.is-self {
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--fm-accent) 40%, transparent);
}

.match-window__chip {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 21px;
  height: 21px;
  border: 1px solid var(--fm-border);
  border-radius: 50%;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.match-window__chip.is-black {
  border-color: color-mix(in srgb, #6f9fec 45%, var(--fm-border));
  background: color-mix(in srgb, #6f9fec 12%, transparent);
  color: #9dbcf2;
}

.match-window__chip.is-white {
  border-color: color-mix(in srgb, #48bfae 45%, var(--fm-border));
  background: color-mix(in srgb, #48bfae 12%, transparent);
  color: #7ad5c8;
}

.match-window__player-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.match-window__player-main b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-window__player-main span {
  color: var(--fm-text-muted);
  font-size: 8px;
}

.match-window__player strong {
  flex: none;
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 16px;
  font-weight: 600;
}

.match-window__vs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.match-window__vs em {
  color: var(--fm-warn);
  font-size: 11px;
  font-style: normal;
  letter-spacing: 0;
}

.match-window__statusbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 27px;
  padding: 4px 8px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 30%, transparent);
}

.match-window__hint {
  flex: 1;
  color: var(--fm-text-dim);
  font-size: 9px;
}

.match-window__hint b {
  color: var(--fm-ok);
}

.match-window__clock {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 12px;
}

.match-window__clock.is-danger {
  color: var(--fm-err);
  animation: match-clock 1s ease-in-out infinite;
}

@keyframes match-clock {
  50% {
    opacity: 0.45;
  }
}

.match-window__primary,
.match-window__ghost,
.match-window__send {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--fm-accent);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-accent) 12%, transparent);
  color: var(--fm-accent);
  font-size: 9.5px;
  cursor: pointer;
}

.match-window__primary:hover:not(:disabled),
.match-window__send:hover:not(:disabled) {
  background: color-mix(in srgb, var(--fm-accent) 22%, transparent);
}

.match-window__ghost {
  border-color: var(--fm-border);
  background: transparent;
  color: var(--fm-text-muted);
}

.match-window__ghost:hover:not(:disabled) {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.match-window__primary:disabled,
.match-window__ghost:disabled,
.match-window__send:disabled {
  opacity: 0.45;
  cursor: default;
}

.match-window__finished {
  color: var(--fm-ok);
  font-family: var(--fm-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.match-window__result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--fm-ok) 40%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-ok) 6%, transparent);
}

.match-window__result-title {
  color: var(--fm-ok);
  font-size: 11px;
  font-weight: 600;
}

.match-window__result-score {
  color: var(--fm-text);
  font-family: var(--fm-mono);
  font-size: 11px;
}

.match-window__result-note {
  margin-left: auto;
  color: var(--fm-text-muted);
  font-size: 8.5px;
}

.match-window__spectator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px dashed color-mix(in srgb, var(--fm-accent) 32%, transparent);
  border-radius: 3px;
  color: var(--fm-accent);
  font-size: 9px;
}

.match-window__duel-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px dashed color-mix(in srgb, var(--fm-warn) 34%, transparent);
  border-radius: 3px;
  color: var(--fm-warn);
  font-size: 8.5px;
}

.match-window__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.match-window__footer span + span::before {
  margin-right: 10px;
  color: var(--fm-border);
  content: '·';
}

.match-window__expand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  font-family: inherit;
  font-size: 8px;
  cursor: pointer;
}

.match-window__expand:hover {
  border-color: color-mix(in srgb, var(--fm-accent) 32%, var(--fm-border));
  color: var(--fm-accent);
}

.match-window__action-error {
  margin: 0;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--fm-err) 35%, transparent);
  border-radius: 3px;
  color: var(--fm-err);
  font-size: 9.5px;
}

.match-window__chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-bg) 32%, transparent);
}

.match-window__chat-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--fm-border);
}

.match-window__tabs {
  display: flex;
  gap: 4px;
}

.match-window__tabs button {
  padding: 4px 9px;
  border: 1px solid transparent;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  cursor: pointer;
}

.match-window__tabs button.is-active {
  border-color: color-mix(in srgb, var(--fm-accent) 30%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-accent) 7%, transparent);
  color: var(--fm-accent);
}

.match-window__chat-hint {
  color: var(--fm-text-muted);
  font-size: 8px;
}

.match-window__messages {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 220px;
  padding: 10px 12px;
  overflow-y: auto;
}

.match-window__chat-empty {
  padding: 22px 6px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  text-align: center;
}

.match-window__message {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 94%;
}

.match-window__message.is-self {
  align-self: flex-end;
}

.match-window__message-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--fm-text-muted);
  font-size: 8px;
}

.match-window__message-meta b {
  color: var(--fm-text-dim);
  font-weight: 500;
}

.match-window__message p {
  margin: 0;
  padding: 5px 8px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: var(--fm-panel);
  color: var(--fm-text-dim);
  font-size: 10px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.match-window__message.is-self p {
  border-color: color-mix(in srgb, var(--fm-accent) 30%, transparent);
  background: color-mix(in srgb, var(--fm-accent) 7%, transparent);
  color: var(--fm-text);
}

.match-window__chat-error {
  margin: 0;
  color: var(--fm-err);
  font-size: 9px;
}

.match-window__composer {
  display: flex;
  gap: 7px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--fm-border);
}

.match-window__composer input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-bg);
  color: var(--fm-text);
  font-size: 10px;
  outline: none;
}

.match-window__composer input:focus {
  border-color: var(--fm-accent);
}

.match-window__send {
  height: 28px;
}

.board-window {
  position: fixed;
  inset: 0;
  z-index: 1250;
  background: rgba(3, 5, 8, 0.82);
  backdrop-filter: blur(5px);
}

.board-window__panel {
  --board-window-inset: clamp(10px, 3vw, 36px);

  position: absolute;
  top: var(--board-window-inset);
  left: var(--board-window-inset);
  display: flex;
  flex-direction: column;
  width: min(
    1180px,
    calc(100vw - var(--board-window-inset) - var(--board-window-inset))
  );
  height: min(
    900px,
    calc(100vh - var(--board-window-inset) - var(--board-window-inset))
  );
  min-width: 380px;
  min-height: 320px;
  max-width: calc(100vw - var(--board-window-inset) - var(--board-window-inset));
  max-height: calc(100vh - var(--board-window-inset) - var(--board-window-inset));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 24%, var(--fm-border));
  border-radius: 4px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
  resize: both;
}

.board-window__head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--fm-border);
  background: color-mix(in srgb, var(--fm-bg) 38%, transparent);
}

.board-window__title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.board-window__mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 9px;
  font-weight: 600;
}

.board-window__eyebrow {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  letter-spacing: 0.1em;
}

.board-window__title b {
  display: block;
  overflow: hidden;
  margin-top: 1px;
  color: var(--fm-text);
  font-size: 10.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-window__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.board-window__status {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 8px;
  white-space: nowrap;
}

.board-window__hint {
  color: var(--fm-text-muted);
  font-size: 8px;
  white-space: nowrap;
}

.board-window__close {
  width: 27px;
  height: 27px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 16px;
  cursor: pointer;
}

.board-window__close:hover {
  border-color: var(--fm-err);
  color: var(--fm-err);
}

.board-window__stage {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 6px 10px 10px;
}

.board-window__stage :deep(.gomoku) {
  flex: 1;
  min-height: 0;
}

@media (max-width: 980px) {
  .match-window {
    padding: 10px;
  }

  .match-window__body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .match-window__game {
    overflow: visible;
  }

  .match-window__chat {
    min-height: 300px;
    border-top: 1px solid var(--fm-border);
    border-left: 0;
  }

  .match-window__messages {
    min-height: 160px;
  }
}

@media (max-width: 620px) {
  .match-window__scoreboard {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .match-window__vs {
    display: none;
  }

  .match-window__head {
    align-items: flex-start;
  }

  .match-window__mode {
    display: none;
  }
}

@media (max-width: 720px) {
  .board-window__panel {
    --board-window-inset: 8px;

    width: calc(100vw - var(--board-window-inset) - var(--board-window-inset));
    height: calc(100vh - var(--board-window-inset) - var(--board-window-inset));
    min-width: 0;
    min-height: 0;
    max-width: calc(100vw - var(--board-window-inset) - var(--board-window-inset));
    max-height: calc(100vh - var(--board-window-inset) - var(--board-window-inset));
    resize: none;
  }

  .board-window__head {
    padding: 6px 8px;
  }

  .board-window__hint {
    display: none;
  }

  .board-window__stage {
    padding: 4px 6px 6px;
  }
}
</style>
