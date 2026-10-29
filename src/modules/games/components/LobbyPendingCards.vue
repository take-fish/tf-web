<script setup lang="ts">
import { countdown, formatLabel, modeShortLabel } from '../lib/gameFormat'
import type { GameMatch, GameTournament } from '@/types/games'

const props = defineProps<{
  invitations: GameTournament[]
  activeMatches: GameMatch[]
  actingId: string
  now: number
}>()

const emit = defineEmits<{
  respond: [tournament: GameTournament, accept: boolean]
  watch: [matchId: string]
}>()

function invitationRemaining(tournament: GameTournament): string {
  return countdown(tournament.inviteDeadline, props.now)
}

function isInvitationExpired(tournament: GameTournament): boolean {
  return tournament.inviteDeadline <= props.now
}
</script>

<template>
  <section v-if="invitations.length" class="lobby__card lobby__card--invite">
    <div class="lobby__card-head">
      <span>收到的邀请</span>
      <em>{{ invitations.length }} 个待响应</em>
    </div>
    <article v-for="invitation in invitations" :key="invitation.id" class="lobby__invite">
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
          @click="emit('respond', invitation, true)"
        >
          接受
        </button>
        <button
          type="button"
          class="lobby__button"
          :disabled="Boolean(actingId)"
          @click="emit('respond', invitation, false)"
        >
          拒绝
        </button>
      </div>
    </article>
  </section>

  <section v-if="activeMatches.length" class="lobby__card lobby__card--active">
    <div class="lobby__card-head">
      <span>进行中的演练</span>
      <em>{{ activeMatches.length }} 项</em>
    </div>
    <button
      v-for="match in activeMatches"
      :key="match.id"
      type="button"
      class="lobby__active-match"
      @click="emit('watch', match.id)"
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
</template>

<style scoped src="./lobby-pending-cards.css"></style>
