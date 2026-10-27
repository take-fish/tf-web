<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { formatApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import { useTournamentStore } from '@/stores/tournament'
import {
  countdown,
  formatClock,
  formatLabel,
  modeShortLabel,
  tournamentModeSummary,
  tournamentStatusLabel,
  tournamentTypeLabel,
} from '../lib/gameFormat'
import {
  TOURNAMENT_GAMES,
  defaultSeriesPool,
  defaultTournamentName,
  isTournamentPoolGame,
  toggleSeriesPool,
} from '../lib/tournamentGames'
import type {
  BlindLayout,
  GameFormat,
  GameMatch,
  GameOnlineUser,
  GameTournament,
  SelectableGameId,
  TournamentPoolGameId,
  TournamentType,
} from '../types'
import TournamentBracket from './TournamentBracket.vue'

const emit = defineEmits<{ close: [] }>()

const MAX_PLAYERS = 16
const BLIND_LAYOUTS: Array<{ id: BlindLayout; label: string; hint: string }> = [
  { id: 'STANDARD_SHUFFLE', label: '标准点位', hint: '标准开局点位随机洗牌' },
  { id: 'FULL_RANDOM', label: '全盘随机', hint: '32 枚随机散布全盘' },
  { id: 'HALF_RANDOM', label: '半场随机', hint: '红黑各自半场散布' },
]

const store = useTournamentStore()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const tournamentType = ref<TournamentType>('SERIES')
/** S赛启用池：默认全部 1v1 剧本，创建时可取消勾选，至少保留一个。 */
const seriesPool = ref<TournamentPoolGameId[]>(defaultSeriesPool())
/** 锦标赛固定剧本。 */
const championshipGame = ref<TournamentPoolGameId>('heatmap-gomoku')
const blindLayout = ref<BlindLayout>('STANDARD_SHUFFLE')
const format = ref<GameFormat>('BO1')
const name = ref('')
const selectedIds = ref<string[]>([])
const creating = ref(false)
const createError = ref('')
const actingId = ref('')
const selectedTournamentId = ref('')
const menuOpenId = ref('')
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
/** 约战不进入演练列表，进行中的对局只在“一对一”面板展示。 */
const myActiveMatches = computed(() =>
  store.activeMatches.filter((match) => match.kind !== 'DUEL'),
)
const connectionLabel = computed(() => {
  if (store.status === 'online') return '调度通道已连接'
  if (store.status === 'connecting') return '正在连接调度通道'
  if (store.status === 'reconnecting') return '正在重连调度通道'
  return '调度通道离线 · 可查看与创建，操作需恢复连接'
})
const canCreate = computed(
  () =>
    !creating.value &&
    Boolean(selfId.value) &&
    roster.value.length >= 2 &&
    roster.value.length <= MAX_PLAYERS,
)
const selectedGameId = computed<SelectableGameId>(() =>
  tournamentType.value === 'SERIES' ? 'random' : championshipGame.value,
)
/** 盲棋参与时才需要选择开局摆法。 */
const blindInPlay = computed(() =>
  tournamentType.value === 'SERIES'
    ? seriesPool.value.includes('blind-xiangqi')
    : championshipGame.value === 'blind-xiangqi',
)
const defaultName = computed(() =>
  defaultTournamentName(tournamentType.value, selectedGameId.value),
)

function toggleSeriesGame(gameId: TournamentPoolGameId) {
  seriesPool.value = toggleSeriesPool(seriesPool.value, gameId)
}

/** 游戏卡片/剧本卡片进入时预选锦标赛剧本；顶部调度台按钮保持 S赛。 */
function applyEntryMode() {
  if (store.lobbyMode === 'CHAMPIONSHIP' && isTournamentPoolGame(store.lobbyPreferredGameId)) {
    tournamentType.value = 'CHAMPIONSHIP'
    championshipGame.value = store.lobbyPreferredGameId
    return
  }
  tournamentType.value = 'SERIES'
}

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

watch(
  () => [store.lobbyMode, store.lobbyPreferredGameId] as const,
  () => applyEntryMode(),
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
  // 调度台保持挂载，对局窗口覆盖在其上层；关闭对局后自然回到调度台。
  void router.push({ path: '/games', query: { ...route.query, watch: matchId } })
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
      name: name.value.trim() || defaultName.value,
      format: format.value,
      players: roster.value,
      gameId: selectedGameId.value,
      ...(tournamentType.value === 'SERIES' ? { gamePool: [...seriesPool.value] } : {}),
      ...(blindInPlay.value ? { blindLayout: blindLayout.value } : {}),
    })
    selectedIds.value = []
    name.value = ''
    selectedTournamentId.value = created.id
  } catch (error) {
    createError.value = formatApiError(error, '演练创建失败')
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

function canManage(tournament: GameTournament): boolean {
  return isCreator(tournament) && tournament.status !== 'RUNNING'
}

function canCancel(tournament: GameTournament): boolean {
  return tournament.status === 'INVITING' && isCreator(tournament)
}

function toggleMenu(tournamentId: string) {
  menuOpenId.value = menuOpenId.value === tournamentId ? '' : tournamentId
}

function closeMenu() {
  menuOpenId.value = ''
}

function onDocumentClick() {
  closeMenu()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

async function cancel(tournament: GameTournament) {
  if (actingId.value) return
  menuOpenId.value = ''
  if (!window.confirm(`确认取消演练「${tournament.name}」？取消后邀请立即失效。`)) return
  actingId.value = tournament.id
  createError.value = ''
  try {
    await store.cancel(tournament.id)
  } catch (error) {
    createError.value = formatApiError(error, '取消演练失败')
  } finally {
    actingId.value = ''
  }
}

async function remove(tournament: GameTournament) {
  if (actingId.value) return
  menuOpenId.value = ''
  if (
    !window.confirm(
      `确认删除演练「${tournament.name}」？删除后大厅与邀请中都不再显示，数据仅从列表隐藏。`,
    )
  ) {
    return
  }
  actingId.value = tournament.id
  createError.value = ''
  try {
    await store.remove(tournament.id)
    selectedTournamentId.value = ''
  } catch (error) {
    createError.value = formatApiError(error, '删除演练失败')
  } finally {
    actingId.value = ''
  }
}

function isCreator(tournament: GameTournament): boolean {
  return tournament.creatorUserId === selfId.value
}

onMounted(() => {
  applyEntryMode()
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  void store.refreshLobby()
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="lobby" role="dialog" aria-modal="true" aria-label="演练调度台" @click.self="emit('close')">
    <section class="lobby__panel">
      <header class="lobby__head">
        <div class="lobby__title">
          <span class="lobby__mark">T</span>
          <div>
            <div class="lobby__eyebrow">OPS / DRILL SCHEDULER</div>
            <h2>演练调度台</h2>
            <p>创建演练、邀请在线成员、查看执行记录与回放</p>
          </div>
        </div>
        <div class="lobby__head-actions">
          <button
            type="button"
            class="lobby__button lobby__button--duel"
            title="一对一约战"
            @click="store.openDuelPanel()"
          >
            <AppIcon name="user" :size="12" />
            一对一
            <em v-if="store.duelInviteUnread > 0" class="lobby__badge">
              {{ store.duelInviteUnread }}
            </em>
          </button>
          <span class="lobby__connection" :class="`is-${store.status}`">
            <span class="lobby__dot" />
            {{ connectionLabel }}
          </span>
          <button class="lobby__icon-btn" title="刷新调度台" @click="store.refreshLobby()">
            <AppIcon name="refresh" :size="13" />
          </button>
          <button class="lobby__close" title="关闭调度台" @click="emit('close')">×</button>
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
                  {{ invitation.creatorNickname }} 邀请你 ·
                  {{ modeShortLabel(invitation.gameId, invitation.blindLayout) }} ·
                  {{ formatLabel(invitation.format) }}
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
              <span>进行中的演练</span>
              <em>{{ myActiveMatches.length }} 项</em>
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
                {{ match.status === 'RUNNING' ? '执行中' : '待准备' }}
                · 查看执行
              </em>
            </button>
          </section>

          <section class="lobby__card">
            <div class="lobby__card-head">
              <span>创建演练</span>
              <em>{{ roster.length }}/{{ MAX_PLAYERS }} 人</em>
            </div>

            <label class="lobby__field">
              <span>演练名称</span>
              <input
                v-model="name"
                type="text"
                maxlength="32"
                :placeholder="defaultName"
                :disabled="creating"
              />
            </label>

            <div class="lobby__field">
              <div class="lobby__field-head">
                <span>赛事类型</span>
                <em>S赛多剧本综合抽签 · 锦标赛单一剧本专精</em>
              </div>
              <div class="lobby__games">
                <button
                  type="button"
                  class="lobby__format"
                  :class="{ 'is-active': tournamentType === 'SERIES' }"
                  @click="tournamentType = 'SERIES'"
                >
                  <b>S赛</b>
                  <em>综合赛 · 每场开赛前从启用池随机抽选</em>
                </button>
                <button
                  type="button"
                  class="lobby__format"
                  :class="{ 'is-active': tournamentType === 'CHAMPIONSHIP' }"
                  @click="tournamentType = 'CHAMPIONSHIP'"
                >
                  <b>锦标赛</b>
                  <em>专精赛 · 选定一个剧本贯穿全程</em>
                </button>
              </div>
            </div>

            <div v-if="tournamentType === 'SERIES'" class="lobby__field">
              <div class="lobby__field-head">
                <span>启用剧本</span>
                <em>
                  已启用 {{ seriesPool.length }}/{{ TOURNAMENT_GAMES.length }} · 至少保留 1 个
                </em>
              </div>
              <div class="lobby__pool">
                <button
                  v-for="option in TOURNAMENT_GAMES"
                  :key="option.id"
                  type="button"
                  class="lobby__pool-item"
                  :class="{ 'is-active': seriesPool.includes(option.id) }"
                  :aria-pressed="seriesPool.includes(option.id)"
                  @click="toggleSeriesGame(option.id)"
                >
                  <span class="lobby__pool-check">
                    <AppIcon
                      :name="seriesPool.includes(option.id) ? 'check' : 'plus'"
                      :size="10"
                    />
                  </span>
                  <span class="lobby__pool-main">
                    <b>{{ option.shortName }}</b>
                    <em>{{ option.description }}</em>
                  </span>
                </button>
              </div>
            </div>

            <div v-else class="lobby__field">
              <span>比赛剧本</span>
              <div class="lobby__games">
                <button
                  v-for="option in TOURNAMENT_GAMES"
                  :key="option.id"
                  type="button"
                  class="lobby__format"
                  :class="{ 'is-active': championshipGame === option.id }"
                  @click="championshipGame = option.id"
                >
                  <b>{{ option.shortName }}</b>
                  <em>{{ option.description }}</em>
                </button>
              </div>
            </div>

            <div v-if="blindInPlay" class="lobby__field">
              <span>开局摆法</span>
              <div class="lobby__layouts">
                <button
                  v-for="option in BLIND_LAYOUTS"
                  :key="option.id"
                  type="button"
                  class="lobby__format"
                  :class="{ 'is-active': blindLayout === option.id }"
                  @click="blindLayout = option.id"
                >
                  <b>{{ option.label }}</b>
                  <em>{{ option.hint }}</em>
                </button>
              </div>
            </div>

            <div class="lobby__field">
              <span>轮次策略</span>
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
                        ? '单次执行'
                        : option === 'BO3'
                          ? '三轮两胜 · 间隔 60 秒'
                          : '五轮三胜 · 间隔 60 秒'
                    }}
                  </em>
                </button>
              </div>
            </div>

            <div class="lobby__field">
              <div class="lobby__field-head">
                <span>在线成员</span>
                <em>创建者已自动加入 · 点击选择成员</em>
              </div>
              <div class="lobby__roster">
                <div class="lobby__member is-self">
                  <UserAvatar
                    class="lobby__avatar"
                    :name="store.ownNickname"
                    :src="auth.user?.avatarUrl"
                    :user-id="store.ownUserId"
                  />
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
                  <UserAvatar
                    class="lobby__avatar"
                    :name="member.nickname"
                    :user-id="member.userId"
                  />
                  <span class="lobby__member-main">
                    <b>{{ member.nickname }}</b>
                    <em>@{{ member.userId }}</em>
                  </span>
                  <AppIcon :name="isSelected(member.userId) ? 'check' : 'plus'" :size="12" />
                </button>
                <div v-if="candidates.length === 0" class="lobby__empty">
                  当前没有其他在线成员。让对方登录并打开任意页面后，再刷新调度台。
                </div>
              </div>
            </div>

            <div class="lobby__rules">
              <p>
                <b>S赛</b>：每场对局开赛前从启用池随机抽选剧本；
                <b>锦标赛</b>：全程使用选定剧本。
              </p>
              <p><b>2/4/8/16 人</b>：随机单败淘汰，自动生成执行链路。</p>
              <p><b>3-5 人</b>：循环排位；<b>6 人以上非 2 的幂</b>：瑞士轮排位。</p>
              <p><b>前四</b>进入页面淘汰：三打四、胜者打二、决赛打一。</p>
              <p><b>首局选图</b>：三号、二号、一号各自拥有对应场次的首局选图权；其余小局系统随机。</p>
              <p><b>回放</b>：未参与的成员可从列表进入；执行内保留公开讨论与双方私聊。</p>
              <p v-if="blindInPlay">
                <b>盲棋</b>：翻棋或走子；反面棋可盲吃；将帅见面记和并进下一局。
              </p>
            </div>

            <p v-if="createError || store.lobbyError" class="lobby__error">
              {{ createError || store.lobbyError }}
            </p>

            <div class="lobby__create-foot">
              <span>至少选择 1 名在线成员，最多 {{ MAX_PLAYERS }} 人。</span>
              <button
                type="button"
                class="lobby__button lobby__button--primary lobby__button--lg"
                :disabled="!canCreate"
                @click="create"
              >
                <AppIcon name="plus" :size="12" />
                {{ creating ? '正在创建…' : `创建演练（${roster.length} 人）` }}
              </button>
            </div>
          </section>
        </div>

        <div class="lobby__column lobby__column--wide">
          <section class="lobby__card lobby__card--list">
            <div class="lobby__card-head">
              <span>演练列表</span>
              <em>{{ store.tournaments.length }} 个 · 最近创建在前</em>
            </div>
            <div v-if="store.lobbyLoading && store.tournaments.length === 0" class="lobby__empty">
              正在载入演练…
            </div>
            <div v-else-if="store.tournaments.length === 0" class="lobby__empty">
              暂无演练记录。选择在线成员，创建第一条联调演练。
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
                  <div class="lobby__tournament-head-actions">
                    <span
                      class="lobby__mode-tag"
                      :class="{ 'is-series': tournament.gameId === 'random' }"
                    >
                      {{ tournamentTypeLabel(tournament.gameId) }}
                    </span>
                    <span
                      class="lobby__tournament-status"
                      :class="`is-${tournament.status.toLowerCase()}`"
                    >
                      {{ tournamentStatusLabel(tournament.status) }}
                    </span>
                    <div v-if="canManage(tournament)" class="lobby__tournament-menu">
                      <button
                        type="button"
                        class="lobby__menu-trigger"
                        title="演练操作"
                        aria-label="演练操作"
                        :aria-expanded="menuOpenId === tournament.id"
                        @click.stop="toggleMenu(tournament.id)"
                      >
                        ⋯
                      </button>
                      <div
                        v-if="menuOpenId === tournament.id"
                        class="lobby__menu"
                        role="menu"
                        @click.stop
                      >
                        <button
                          v-if="canCancel(tournament)"
                          type="button"
                          role="menuitem"
                          class="lobby__menu-danger"
                          :disabled="Boolean(actingId)"
                          @click.stop="cancel(tournament)"
                        >
                          取消演练
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          class="lobby__menu-danger"
                          :disabled="Boolean(actingId)"
                          @click.stop="remove(tournament)"
                        >
                          删除记录
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="lobby__tournament-meta">
                  <span>{{ tournamentModeSummary(tournament) }}</span>
                  <span>{{ formatLabel(tournament.format) }}</span>
                  <span>{{ playerCount(tournament) }}/{{ tournament.targetPlayers }} 人</span>
                  <span>{{ formatClock(tournament.createdAt) }}</span>
                </div>
                <div class="lobby__tournament-foot">
                  <span>
                    发起人 {{ tournament.creatorNickname }}
                    <template v-if="tournament.championNickname">
                      · 冠军 <b>{{ tournament.championNickname }}</b>
                    </template>
                    <template v-if="tournament.runnerUpNickname">
                      · 亚军 {{ tournament.runnerUpNickname }}
                    </template>
                  </span>
                  <div class="lobby__tournament-actions">
                    <button
                      v-if="preferredMatch(tournament)"
                      type="button"
                      class="lobby__button lobby__button--primary"
                      @click.stop="openTournament(tournament)"
                    >
                      {{ tournament.status === 'FINISHED' ? '回放' : '查看' }}
                    </button>
                    <button type="button" class="lobby__button" @click.stop="selectTournament(tournament)">
                      执行链路
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
            选择一条演练查看执行链路
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
  border: 1px solid color-mix(in srgb, var(--fm-accent) 18%, var(--fm-border));
  border-radius: 4px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
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
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 13px;
  font-weight: 600;
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
  border-color: color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
  color: var(--fm-accent);
}

.lobby__button--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--fm-accent) 18%, transparent);
  color: var(--fm-accent);
}

.lobby__button--duel {
  height: 27px;
  border-color: color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  color: var(--fm-accent);
}

.lobby__button--duel:hover:not(:disabled) {
  background: color-mix(in srgb, var(--fm-accent) 12%, transparent);
  color: var(--fm-accent);
}

.lobby__badge {
  min-width: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--fm-err);
  color: #fff;
  font-size: 7.5px;
  font-style: normal;
  line-height: 13px;
  text-align: center;
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

.lobby__draw {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 32%, var(--fm-border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-accent) 6%, transparent);
}

.lobby__draw > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lobby__draw b {
  color: var(--fm-accent);
  font-size: 9.5px;
  font-weight: 500;
}

.lobby__draw em {
  color: var(--fm-text-muted);
  font-size: 7.5px;
  font-style: normal;
  line-height: 1.45;
}

.lobby__scripts {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.lobby__script {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  text-align: left;
  cursor: pointer;
}

.lobby__script:hover {
  border-color: color-mix(in srgb, var(--fm-accent) 45%, transparent);
}

.lobby__script b {
  color: var(--fm-text-dim);
  font-size: 9.5px;
  font-weight: 500;
}

.lobby__script em {
  color: var(--fm-text-muted);
  font-size: 7.5px;
  font-style: normal;
  line-height: 1.4;
}

.lobby__script-tag {
  align-self: flex-start;
  padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 26%, transparent);
  border-radius: 2px;
  color: color-mix(in srgb, var(--fm-accent) 72%, var(--fm-text-muted));
  font-family: var(--fm-mono);
  font-size: 7px;
  letter-spacing: 0.08em;
}

.lobby__script.is-active {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
}

.lobby__script.is-active b {
  color: var(--fm-accent);
}

.lobby__formats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.lobby__games {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.lobby__pool {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.lobby__pool-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  text-align: left;
  cursor: pointer;
}

.lobby__pool-item:hover {
  border-color: color-mix(in srgb, var(--fm-accent) 45%, transparent);
}

.lobby__pool-item.is-active {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 8%, transparent);
}

.lobby__pool-check {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  border: 1px solid var(--fm-border);
  border-radius: 2px;
  color: var(--fm-text-muted);
}

.lobby__pool-item.is-active .lobby__pool-check {
  border-color: color-mix(in srgb, var(--fm-accent) 55%, transparent);
  color: var(--fm-accent);
}

.lobby__pool-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lobby__pool-main b {
  color: var(--fm-text-dim);
  font-size: 9.5px;
  font-weight: 500;
}

.lobby__pool-item.is-active .lobby__pool-main b {
  color: var(--fm-accent);
}

.lobby__pool-main em {
  overflow: hidden;
  color: var(--fm-text-muted);
  font-size: 7.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__mode-tag {
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 32%, transparent);
  border-radius: 8px;
  color: color-mix(in srgb, var(--fm-accent) 78%, var(--fm-text-muted));
  font-family: var(--fm-mono);
  font-size: 7px;
  white-space: nowrap;
}

.lobby__mode-tag.is-series {
  border-color: color-mix(in srgb, var(--fm-ok) 32%, transparent);
  color: color-mix(in srgb, var(--fm-ok) 82%, var(--fm-text-muted));
}

.lobby__layouts {
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

.lobby__tournament-head-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.lobby__tournament-status {
  padding: 1px 5px;
  border: 1px solid var(--fm-border);
  border-radius: 8px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7px;
  white-space: nowrap;
}

.lobby__tournament-status.is-running {
  border-color: color-mix(in srgb, var(--fm-ok) 32%, transparent);
  color: color-mix(in srgb, var(--fm-ok) 82%, var(--fm-text-muted));
}

.lobby__tournament-status.is-inviting {
  border-color: color-mix(in srgb, var(--fm-warn) 30%, transparent);
  color: color-mix(in srgb, var(--fm-warn) 82%, var(--fm-text-muted));
}

.lobby__tournament-menu {
  position: relative;
}

.lobby__menu-trigger {
  display: grid;
  place-items: center;
  width: 18px;
  height: 16px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.lobby__menu-trigger:hover,
.lobby__menu-trigger[aria-expanded='true'] {
  border-color: var(--fm-border);
  background: var(--fm-hover);
  color: var(--fm-text);
}

.lobby__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 12;
  min-width: 84px;
  padding: 3px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: var(--fm-panel-2);
  box-shadow: var(--fm-shadow);
}

.lobby__menu-danger {
  display: block;
  width: 100%;
  padding: 5px 7px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: color-mix(in srgb, var(--fm-err) 84%, var(--fm-text));
  font-family: var(--fm-mono);
  font-size: 8.5px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.lobby__menu-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--fm-err) 12%, transparent);
}

.lobby__menu-danger:disabled {
  opacity: 0.5;
  cursor: default;
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

  .lobby__formats,
  .lobby__games,
  .lobby__layouts,
  .lobby__pool {
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
