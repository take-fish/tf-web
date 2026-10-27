<script setup lang="ts">
import { computed } from 'vue'

import { scriptShortLabel } from '../lib/arenaScripts'
import {
  canWatchMatch,
  formatLabel,
  gameLabel,
  groupMatches,
  leagueStandings,
  matchRoundLabel,
  matchStatusLabel,
  playerName,
  tournamentStatusLabel,
} from '../lib/gameFormat'
import type { GameMatch, GameTournament } from '../types'

const props = withDefaults(
  defineProps<{
    tournament: GameTournament
    selfUserId?: string
  }>(),
  { selfUserId: '' },
)

const emit = defineEmits<{ watch: [matchId: string] }>()

const groups = computed(() => groupMatches(props.tournament))
const standings = computed(() => leagueStandings(props.tournament))
const isLeague = computed(() =>
  props.tournament.matches.some((match) => match.stage === 'LEAGUE'),
)
const modeLabel = computed(() => {
  if (props.tournament.bracketType === 'KNOCKOUT') return '随机单败'
  if (props.tournament.bracketType === 'PAGE_PLAYOFF') return '排位 + 页面淘汰'
  if (props.tournament.bracketType === 'LADDER') return '循环计分 + 收尾轮'
  if (props.tournament.bracketType === 'LEAGUE') return '排位计分'
  return '等待开始'
})
const acceptedPlayers = computed(() =>
  props.tournament.players.filter((player) => player.status === 'ACCEPTED'),
)
const qualifierCount = computed(() => Math.min(4, acceptedPlayers.value.length))

function playerStatusLabel(status: string): string {
  if (status === 'ACCEPTED') return '已接受'
  if (status === 'INVITED') return '待响应'
  if (status === 'DECLINED') return '已拒绝'
  if (status === 'EXPIRED') return '已超时'
  return status
}

function isWinner(match: GameMatch, userId: string | null): boolean {
  return Boolean(userId && match.winnerUserId === userId)
}

function isSelf(userId: string | null): boolean {
  return Boolean(userId && userId === props.selfUserId)
}

function stateText(match: GameMatch): string {
  if (match.status === 'RUNNING' && match.currentRound?.status === 'REST') return '间隔中'
  return matchStatusLabel(match.status)
}

function actionText(match: GameMatch): string {
  if (!canWatchMatch(match)) return ''
  if (match.status === 'FINISHED') return '回放'
  if (match.status === 'READY' || match.status === 'PENDING') {
    if (isSelf(match.player1UserId) || isSelf(match.player2UserId)) {
      return ownsDraw(match) ? '选择首局剧本' : '进入准备'
    }
  }
  return '查看执行'
}

function ownsDraw(match: GameMatch): boolean {
  return Boolean(props.selfUserId && match.gameChooserUserId === props.selfUserId)
}

function drawNote(match: GameMatch): string {
  if (!match.firstGameId) return ''
  return `首局 ${scriptShortLabel(match.firstGameId)}`
}

function open(match: GameMatch) {
  if (!canWatchMatch(match)) return
  emit('watch', match.id)
}
</script>

<template>
  <section class="bracket">
    <header class="bracket__head">
      <div>
        <div class="bracket__title-row">
          <h3>{{ tournament.name }}</h3>
          <span class="bracket__status" :class="`is-${tournament.status.toLowerCase()}`">
            {{ tournamentStatusLabel(tournament.status) }}
          </span>
        </div>
        <p class="bracket__meta">
          {{ gameLabel(tournament.gameId, tournament.blindLayout) }} ·
          {{ formatLabel(tournament.format) }} · {{ modeLabel }} ·
          {{ acceptedPlayers.length }}/{{ tournament.targetPlayers }} 人
          <template v-if="tournament.currentRound > 0">
            · 第 {{ tournament.currentRound }}/{{ tournament.totalRounds }} 轮
          </template>
        </p>
      </div>
      <div v-if="tournament.championUserId" class="bracket__champion">
        <span>冠军</span>
        <b>{{ tournament.championNickname || tournament.championUserId }}</b>
        <span v-if="tournament.runnerUpUserId" class="bracket__runner-up">
          亚军 {{ tournament.runnerUpNickname || tournament.runnerUpUserId }}
        </span>
      </div>
    </header>

    <div v-if="tournament.status === 'INVITING'" class="bracket__inviting">
      <span class="bracket__pulse" />
      等待成员响应邀请 · 5 分钟未响应视为拒绝
      <div class="bracket__players">
        <span
          v-for="player in tournament.players"
          :key="player.userId"
          class="bracket__player"
          :class="[`is-${player.status.toLowerCase()}`, { 'is-self': isSelf(player.userId) }]"
        >
          {{ player.nickname }}
          <em>{{ playerStatusLabel(player.status) }}</em>
        </span>
      </div>
    </div>

    <div v-else-if="groups.length === 0" class="bracket__empty">
      暂无执行信息
    </div>

    <div v-else class="bracket__content">
      <div v-if="isLeague && standings.length" class="bracket__standings">
        <div class="bracket__section-label">
          排位名次
          <em>前 {{ qualifierCount }} 名进入页面淘汰</em>
        </div>
        <div class="bracket__standing-row is-head">
          <span>#</span>
          <span>成员</span>
          <span>胜场</span>
          <span>已赛</span>
        </div>
        <div
          v-for="(row, index) in standings"
          :key="row.userId"
          class="bracket__standing-row"
          :class="{ 'is-top': index < qualifierCount, 'is-self': isSelf(row.userId) }"
        >
          <span>{{ index + 1 }}</span>
          <span>{{ row.nickname }}</span>
          <span>{{ row.wins }}</span>
          <b>{{ row.played }}</b>
        </div>
      </div>

      <div class="bracket__rounds">
        <div v-for="group in groups" :key="group.key" class="bracket__round">
          <div class="bracket__section-label">
            {{ group.label }}
            <em>{{ group.subtitle }}</em>
          </div>
          <button
            v-for="match in group.matches"
            :key="match.id"
            type="button"
            class="bracket__match"
            :class="{
              'is-live': match.status === 'RUNNING',
              'is-ready': match.status === 'READY',
              'is-finished': match.status === 'FINISHED',
              'is-bye': match.status === 'BYE',
              'is-clickable': canWatchMatch(match),
            }"
            :disabled="!canWatchMatch(match)"
            @click="open(match)"
          >
            <div class="bracket__match-top">
              <span>{{ matchRoundLabel(tournament, match) }}</span>
              <em :class="{ 'is-rest': match.currentRound?.status === 'REST' }">
                {{ stateText(match) }}
              </em>
            </div>
            <div
              class="bracket__player-row"
              :class="{
                'is-winner': isWinner(match, match.player1UserId),
                'is-self': isSelf(match.player1UserId),
              }"
            >
              <span class="bracket__name">
                {{ playerName(match.player1UserId, match.player1Nickname) }}
              </span>
              <b>{{ match.status === 'PENDING' ? '–' : match.player1Score }}</b>
            </div>
            <div
              class="bracket__player-row"
              :class="{
                'is-winner': isWinner(match, match.player2UserId),
                'is-self': isSelf(match.player2UserId),
              }"
            >
              <span class="bracket__name">
                {{ match.status === 'BYE' ? '轮空' : playerName(match.player2UserId, match.player2Nickname) }}
              </span>
              <b>{{ match.status === 'PENDING' ? '–' : match.player2Score }}</b>
            </div>
            <div v-if="drawNote(match)" class="bracket__draw-note">
              {{ drawNote(match) }}
              <em v-if="ownsDraw(match) && !match.startedAt">· 你拥有选图权</em>
            </div>
            <div v-if="actionText(match)" class="bracket__action">
              {{ actionText(match) }} →
            </div>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bracket {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: var(--fm-panel);
}

.bracket__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.bracket__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bracket__title-row h3 {
  margin: 0;
  color: var(--fm-text);
  font-size: 14px;
  font-weight: 600;
}

.bracket__status {
  padding: 2px 6px;
  border: 1px solid var(--fm-border);
  border-radius: 10px;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-family: var(--fm-mono);
  text-transform: uppercase;
}

.bracket__status.is-running {
  border-color: color-mix(in srgb, var(--fm-ok) 45%, transparent);
  color: var(--fm-ok);
}

.bracket__status.is-inviting {
  border-color: color-mix(in srgb, var(--fm-warn) 45%, transparent);
  color: var(--fm-warn);
}

.bracket__meta {
  margin: 4px 0 0;
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.bracket__champion {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--fm-warn) 50%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-warn) 9%, transparent);
}

.bracket__champion span {
  color: var(--fm-text-muted);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.bracket__champion b {
  color: var(--fm-warn);
  font-size: 12px;
}

.bracket__runner-up {
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 9px;
  letter-spacing: normal;
}

.bracket__inviting {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed color-mix(in srgb, var(--fm-warn) 42%, transparent);
  border-radius: 3px;
  color: var(--fm-warn);
  font-size: 10px;
}

.bracket__pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fm-warn);
  animation: bracket-pulse 1.4s ease-in-out infinite;
}

@keyframes bracket-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

.bracket__players {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

.bracket__player {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid var(--fm-border);
  border-radius: 10px;
  color: var(--fm-text-dim);
  font-size: 9px;
}

.bracket__player em {
  color: var(--fm-text-muted);
  font-size: 8px;
  font-style: normal;
}

.bracket__player.is-accepted {
  border-color: color-mix(in srgb, var(--fm-ok) 40%, transparent);
}

.bracket__player.is-declined,
.bracket__player.is-expired {
  opacity: 0.55;
}

.bracket__player.is-self {
  color: var(--fm-accent);
}

.bracket__empty {
  padding: 18px 4px;
  color: var(--fm-text-muted);
  font-size: 10.5px;
}

.bracket__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bracket__standings {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 45%, transparent);
}

.bracket__section-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  font-weight: 600;
}

.bracket__section-label em {
  color: var(--fm-text-muted);
  font-size: 8px;
  font-style: normal;
  font-weight: 400;
}

.bracket__standing-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 54px 40px;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: 2px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.bracket__standing-row b {
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-weight: 600;
  text-align: right;
}

.bracket__standing-row.is-head {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
  opacity: 0.72;
}

.bracket__standing-row.is-top {
  color: var(--fm-text);
  background: color-mix(in srgb, var(--fm-warn) 6%, transparent);
}

.bracket__standing-row.is-self span:nth-child(2) {
  color: var(--fm-accent);
}

.bracket__rounds {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.bracket__round {
  display: flex;
  flex: 0 0 214px;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.bracket__match {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: color-mix(in srgb, var(--fm-bg) 38%, transparent);
  color: var(--fm-text-dim);
  font: inherit;
  text-align: left;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease;
}

.bracket__match.is-clickable {
  cursor: pointer;
}

.bracket__match.is-clickable:hover {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 7%, transparent);
  transform: translateY(-1px);
}

.bracket__match.is-live {
  border-color: color-mix(in srgb, var(--fm-ok) 36%, var(--fm-border));
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--fm-ok) 72%, transparent);
}

.bracket__match.is-ready {
  border-color: color-mix(in srgb, var(--fm-accent) 30%, var(--fm-border));
}

.bracket__match.is-bye {
  opacity: 0.62;
}

.bracket__match-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
}

.bracket__match-top em {
  padding: 1px 4px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--fm-text-muted) 12%, transparent);
  font-size: 7px;
  font-style: normal;
}

.bracket__match-top em.is-rest {
  background: color-mix(in srgb, var(--fm-warn) 14%, transparent);
  color: var(--fm-warn);
}

.bracket__player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 17px;
  padding: 1px 3px;
  border-radius: 2px;
  font-size: 10px;
}

.bracket__player-row b {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9.5px;
}

.bracket__player-row.is-winner {
  color: var(--fm-ok);
}

.bracket__player-row.is-winner b {
  color: var(--fm-ok);
}

.bracket__player-row.is-self .bracket__name {
  color: var(--fm-accent);
  font-weight: 600;
}

.bracket__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bracket__draw-note {
  margin-top: 2px;
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 8px;
}

.bracket__draw-note em {
  color: var(--fm-accent);
  font-style: normal;
}

.bracket__action {
  margin-top: 3px;
  padding-top: 4px;
  border-top: 1px solid var(--fm-border);
  color: var(--fm-accent);
  font-size: 8px;
  text-align: right;
}

@media (max-width: 760px) {
  .bracket__head {
    flex-direction: column;
  }

  .bracket__champion {
    align-items: flex-start;
  }
}
</style>
