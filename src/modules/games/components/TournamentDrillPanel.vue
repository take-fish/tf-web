<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { formatApiError } from '@/lib/http'
import {
  fetchTournamentRoom,
  type DrillRoomPlayer,
  type DrillRoomView,
} from '@/modules/drill/api/rooms'
import { useTournamentStore } from '@/stores/tournament'
import { tournamentFormatLabel, tournamentStatusLabel } from '../lib/gameFormat'
import type { GameTournament } from '@/types/games'

const props = withDefaults(
  defineProps<{
    tournament: GameTournament
    selfUserId?: string
  }>(),
  { selfUserId: '' },
)

const store = useTournamentStore()
const router = useRouter()

const room = ref<DrillRoomView | null>(null)
const loading = ref(false)
const error = ref('')

let refreshTimer: ReturnType<typeof setInterval> | undefined

const acceptedPlayers = computed(() =>
  props.tournament.players.filter((player) => player.status === 'ACCEPTED'),
)
/** 只有参赛真人能进排位赛房间；其他人只看赛制说明。 */
const participant = computed(() =>
  Boolean(
    props.selfUserId &&
      acceptedPlayers.value.some((player) => player.userId === props.selfUserId),
  ),
)
const roomStatusLabel = computed(() => {
  if (!room.value) return ''
  if (room.value.status === 'WAITING') return '等待参赛者准备'
  if (room.value.status === 'RUNNING') return '排位赛进行中'
  return '排位赛结束 · 淘汰赛进行中'
})
const stageLabel = computed(() => {
  if (props.tournament.status === 'FINISHED') return '赛事已结束'
  if (!room.value) return '邀请齐备后自动开赛'
  if (room.value.status === 'FINISHED') return '八强 BO3 → 四强 BO5 → 决赛 BO5'
  return `排位赛第 ${room.value.round}/${room.value.totalRounds} 轮`
})

async function load() {
  if (!participant.value || props.tournament.status === 'INVITING') {
    room.value = null
    error.value = ''
    return
  }
  loading.value = true
  try {
    room.value = await fetchTournamentRoom(props.tournament.id)
    error.value = ''
  } catch (cause) {
    room.value = null
    error.value = formatApiError(cause, '排位赛房间暂时不可用')
  } finally {
    loading.value = false
  }
}

function enterRoom() {
  if (!room.value) return
  store.closeLobby()
  void router.push({ path: '/games/autochess', query: { room: room.value.id } })
}

function playerName(player: DrillRoomPlayer): string {
  return player.userId === props.selfUserId ? `${player.nickname}（你）` : player.nickname
}

watch(
  () => [props.tournament.id, props.tournament.status, props.selfUserId] as const,
  () => void load(),
  { immediate: true },
)

onMounted(() => {
  refreshTimer = setInterval(() => {
    if (room.value && props.tournament.status === 'RUNNING') void load()
  }, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <section class="drill-bracket">
    <header class="drill-bracket__head">
      <div>
        <div class="drill-bracket__title-row">
          <h3>{{ tournament.name }}</h3>
          <span
            class="drill-bracket__status"
            :class="`is-${tournament.status.toLowerCase()}`"
          >
            {{ tournamentStatusLabel(tournament.status) }}
          </span>
        </div>
        <p class="drill-bracket__meta">
          容量编排专项 · {{ tournamentFormatLabel(tournament) }} ·
          {{ acceptedPlayers.length }}/8 名真人（不足由机器人教练补满）
        </p>
      </div>
      <div v-if="tournament.championUserId" class="drill-bracket__champion">
        <span>冠军</span>
        <b>{{ tournament.championNickname || tournament.championUserId }}</b>
        <span v-if="tournament.runnerUpUserId" class="drill-bracket__runner-up">
          亚军 {{ tournament.runnerUpNickname || tournament.runnerUpUserId }}
        </span>
      </div>
    </header>

    <ol class="drill-bracket__stages">
      <li class="is-active">
        <b>排位赛</b>
        <em>15 轮 · 战绩 3/1/0 · 不淘汰</em>
      </li>
      <li :class="{ 'is-active': room?.status === 'FINISHED' }">
        <b>八强 BO3</b>
        <em>排位 1–8 名，机器人补位</em>
      </li>
      <li :class="{ 'is-active': room?.status === 'FINISHED' }">
        <b>四强 / 决赛 BO5</b>
        <em>每场仍是 8 人同局</em>
      </li>
    </ol>

    <div v-if="tournament.status === 'INVITING'" class="drill-bracket__empty">
      等待成员响应邀请 · 齐备后自动创建排位赛房间
    </div>

    <div v-else-if="!participant" class="drill-bracket__empty">
      只有参赛选手可以进入排位赛房间。
    </div>

    <div v-else-if="loading && !room" class="drill-bracket__empty">
      正在读取排位赛房间…
    </div>

    <div v-else-if="error" class="drill-bracket__empty is-error">
      {{ error }}
      <em>旧赛事可能没有排位赛房间，请重新创建一场。</em>
    </div>

    <div v-else-if="room" class="drill-bracket__content">
      <div class="drill-bracket__progress">
        <span>{{ stageLabel }}</span>
        <em>{{ roomStatusLabel }}</em>
      </div>

      <div class="drill-bracket__standings">
        <div class="drill-bracket__row is-head">
          <span>#</span>
          <span>成员</span>
          <span>胜</span>
          <span>平</span>
          <span>负</span>
          <span>积分</span>
        </div>
        <div
          v-for="(player, index) in room.players"
          :key="player.userId"
          class="drill-bracket__row"
          :class="{ 'is-self': player.userId === selfUserId }"
        >
          <span>{{ player.placement ?? index + 1 }}</span>
          <span class="drill-bracket__name">{{ playerName(player) }}</span>
          <span>{{ player.wins }}</span>
          <span>{{ player.draws }}</span>
          <span>{{ player.losses }}</span>
          <b>{{ player.score }}</b>
        </div>
      </div>

      <div class="drill-bracket__actions">
        <button type="button" class="drill-bracket__primary" @click="enterRoom">
          {{ room.status === 'WAITING' ? '进入房间准备' : '进入房间' }}
        </button>
        <span class="drill-bracket__hint">
          {{
            room.status === 'FINISHED'
              ? '淘汰赛对阵在房间内自动展开'
              : '所有轮次与淘汰赛都在演练房间内进行'
          }}
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.drill-bracket {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: var(--fm-panel);
}

.drill-bracket__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.drill-bracket__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drill-bracket__title-row h3 {
  margin: 0;
  color: var(--fm-text);
  font-size: 14px;
  font-weight: 600;
}

.drill-bracket__status {
  padding: 2px 6px;
  border: 1px solid var(--fm-border);
  border-radius: 10px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8.5px;
  text-transform: uppercase;
}

.drill-bracket__status.is-running {
  border-color: color-mix(in srgb, var(--fm-ok) 45%, transparent);
  color: var(--fm-ok);
}

.drill-bracket__status.is-inviting {
  border-color: color-mix(in srgb, var(--fm-warn) 45%, transparent);
  color: var(--fm-warn);
}

.drill-bracket__meta {
  margin: 4px 0 0;
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.drill-bracket__champion {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--fm-warn) 50%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-warn) 9%, transparent);
}

.drill-bracket__champion span {
  color: var(--fm-text-muted);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.drill-bracket__champion b {
  color: var(--fm-warn);
  font-size: 12px;
}

.drill-bracket__runner-up {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 9px;
  letter-spacing: normal;
}

.drill-bracket__stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.drill-bracket__stages li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 38%, transparent);
  color: var(--fm-text-muted);
}

.drill-bracket__stages li.is-active {
  border-color: color-mix(in srgb, var(--fm-accent) 34%, var(--fm-border));
  color: var(--fm-text-dim);
}

.drill-bracket__stages b {
  color: var(--fm-text);
  font-size: 10px;
}

.drill-bracket__stages em {
  font-size: 8px;
  font-style: normal;
}

.drill-bracket__empty {
  padding: 18px 4px;
  color: var(--fm-text-muted);
  font-size: 10.5px;
}

.drill-bracket__empty.is-error {
  color: var(--fm-warn);
}

.drill-bracket__empty em {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  font-style: normal;
}

.drill-bracket__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drill-bracket__progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 45%, transparent);
  color: var(--fm-text-dim);
  font-size: 10px;
}

.drill-bracket__progress em {
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.drill-bracket__standings {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 45%, transparent);
}

.drill-bracket__row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 28px 28px 28px 44px;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 2px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.drill-bracket__row b {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-weight: 600;
  text-align: right;
}

.drill-bracket__row.is-head {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  opacity: 0.72;
}

.drill-bracket__row.is-self span:nth-child(2) {
  color: var(--fm-accent);
  font-weight: 600;
}

.drill-bracket__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drill-bracket__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.drill-bracket__primary {
  height: 29px;
  padding: 0 16px;
  border: 1px solid var(--fm-accent);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-accent) 12%, var(--fm-panel-2));
  color: var(--fm-accent);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
}

.drill-bracket__primary:hover {
  background: color-mix(in srgb, var(--fm-accent) 20%, var(--fm-panel-2));
}

.drill-bracket__hint {
  color: var(--fm-text-muted);
  font-size: 9px;
}

@media (max-width: 760px) {
  .drill-bracket__head {
    flex-direction: column;
  }

  .drill-bracket__stages {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
