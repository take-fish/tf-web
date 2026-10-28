<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { formatApiError } from '@/lib/http'
import { useTournamentStore } from '@/stores/tournament'
import { ARENA_SCRIPTS } from '../lib/arenaScripts'
import {
  countdown,
  formatClock,
  formatLabel,
  matchStatusLabel,
  modeShortLabel,
  playerName,
} from '../lib/gameFormat'
import type {
  ArenaGameId,
  BlindLayout,
  GameFormat,
  GameMatch,
  GamePlayer,
  GameTournament,
} from '../types'

const emit = defineEmits<{ close: [] }>()

/** 约战可选全部实时剧本，并保留盲棋固定玩法。 */
const DUEL_GAMES: Array<{
  id: ArenaGameId | 'blind-xiangqi'
  label: string
  hint: string
  tag: string
}> = [
  ...ARENA_SCRIPTS.map((script) => ({
    id: script.id,
    label: script.shortName,
    hint: script.duration,
    tag: script.tag,
  })),
  { id: 'blind-xiangqi', label: '盲棋', hint: '翻棋 / 盲吃', tag: 'BLIND' },
]
const BLIND_LAYOUTS: Array<{ id: BlindLayout; label: string; hint: string }> = [
  { id: 'STANDARD_SHUFFLE', label: '标准点位', hint: '标准开局点位随机洗牌' },
  { id: 'FULL_RANDOM', label: '全盘随机', hint: '32 枚随机散布全盘' },
  { id: 'HALF_RANDOM', label: '半场随机', hint: '红黑各自半场散布' },
]

const store = useTournamentStore()
const router = useRouter()
const route = useRoute()

const selectedOpponentId = ref('')
const gameId = ref<ArenaGameId | 'blind-xiangqi'>('heatmap-gomoku')
const blindLayout = ref<BlindLayout>('STANDARD_SHUFFLE')
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

function busyWith(userId: string, game: string): boolean {
  return store.activeDuels.some(
    (duel) =>
      (duel.gameId ?? 'heatmap-gomoku') === game &&
      opponentOf(duel)?.userId === userId,
  )
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
    await store.createDuelFor(
      selectedOpponent.value,
      format.value,
      gameId.value,
      gameId.value === 'blind-xiangqi' ? blindLayout.value : undefined,
    )
    feedback.value =
      `已向 ${selectedOpponent.value.nickname} 发出 ` +
      `${modeShortLabel(gameId.value)} ${format.value} 约战邀请`
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
                  :disabled="busyWith(member.userId, gameId) || creating"
                  @click="selectOpponent(member.userId)"
                >
                  <UserAvatar
                    class="duel__avatar"
                    :name="member.nickname"
                    :user-id="member.userId"
                  />
                  <span class="duel__member-main">
                    <b>{{ member.nickname }}</b>
                    <em>ID {{ member.userId }}</em>
                  </span>
                  <span v-if="busyWith(member.userId, gameId)" class="duel__member-tag">
                    该游戏约战中
                  </span>
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
              <span>演练剧本</span>
              <div class="duel__scripts">
                <button
                  v-for="option in DUEL_GAMES"
                  :key="option.id"
                  type="button"
                  class="duel__script"
                  :class="{ 'is-active': gameId === option.id }"
                  @click="gameId = option.id"
                >
                  <span class="duel__script-tag">{{ option.tag }}</span>
                  <b>{{ option.label }}</b>
                  <em>{{ option.hint }}</em>
                </button>
              </div>
            </div>

            <div v-if="gameId === 'blind-xiangqi'" class="duel__field">
              <span>开局摆法</span>
              <div class="duel__layouts">
                <button
                  v-for="option in BLIND_LAYOUTS"
                  :key="option.id"
                  type="button"
                  class="duel__format"
                  :class="{ 'is-active': blindLayout === option.id }"
                  @click="blindLayout = option.id"
                >
                  <b>{{ option.label }}</b>
                  <em>{{ option.hint }}</em>
                </button>
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
                    ? `向 ${selectedOpponent.nickname} 发起 ${modeShortLabel(gameId)} ${format}`
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
                <b>
                  {{ opponentLabel(duel) }} 向你发起
                  {{ modeShortLabel(duel.gameId, duel.blindLayout) }} {{ duel.format }} 约战
                </b>
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
                  <span>{{ modeShortLabel(duel.gameId, duel.blindLayout) }}</span>
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

<style scoped src="./duel-panel.css"></style>
