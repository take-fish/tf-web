import { computed, ref, type Ref } from 'vue'

import { formatApiError } from '@/lib/http'
import {
  acceptDuel,
  cancelDuel,
  createDuel,
  declineDuel,
} from '@/modules/games/gameApi'
import type {
  BlindLayout,
  GameFormat,
  GameOnlineUser,
  GameTournament,
  SelectableGameId,
} from '@/types/games'

export interface DuelModuleDeps {
  ownUserId: Ref<string>
  refreshLobby: () => Promise<void>
  syncCurrentTournament: (duel: GameTournament) => void
}

/** 一对一约战：面板、邀请未读与约战开局跳转。 */
export function createDuelModule(deps: DuelModuleDeps) {
  const { ownUserId } = deps

  const duels = ref<GameTournament[]>([])
  const duelPanelOpen = ref(false)
  const duelInviteUnread = ref(0)
  const duelError = ref('')
  const duelStartedMatchId = ref<string | null>(null)

  function isDuelInvitation(duel: GameTournament): boolean {
    return (
      duel.status === 'INVITING' &&
      duel.players.some(
        (player) => player.userId === ownUserId.value && player.status === 'INVITED',
      )
    )
  }

  const pendingDuelInvitations = computed(() =>
    duels.value.filter((duel) => isDuelInvitation(duel)),
  )
  const pendingDuelInvitationCount = computed(() => pendingDuelInvitations.value.length)
  const activeDuels = computed(() =>
    duels.value.filter((duel) => duel.status === 'INVITING' || duel.status === 'RUNNING'),
  )

  /** 约战只出现在一对一面板，不进入演练大厅。 */
  function upsertDuel(duel: GameTournament) {
    const index = duels.value.findIndex((entry) => entry.id === duel.id)
    const isNew = index < 0
    if (isNew) duels.value.unshift(duel)
    else duels.value[index] = duel

    deps.syncCurrentTournament(duel)

    const invited = isDuelInvitation(duel)
    if (invited && isNew && !duelPanelOpen.value) {
      duelInviteUnread.value += 1
    }
  }

  function markDuelStarted(matchId: string | null) {
    if (matchId) duelStartedMatchId.value = matchId
  }

  async function createDuelFor(
    opponent: GameOnlineUser,
    format: GameFormat,
    gameId: SelectableGameId = 'heatmap-gomoku',
    blindLayout?: BlindLayout,
  ): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await createDuel({
        opponentUserId: opponent.userId,
        opponentNickname: opponent.nickname,
        format,
        ...(gameId ? { gameId } : {}),
        ...(blindLayout ? { blindLayout } : {}),
      })
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '约战发起失败')
      throw error
    }
  }

  async function acceptDuelInvitation(id: string): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await acceptDuel(id)
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '接受约战失败')
      throw error
    }
  }

  async function declineDuelInvitation(id: string): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await declineDuel(id)
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '拒绝约战失败')
      throw error
    }
  }

  async function cancelDuelById(id: string): Promise<GameTournament> {
    duelError.value = ''
    try {
      const duel = await cancelDuel(id)
      upsertDuel(duel)
      return duel
    } catch (error) {
      duelError.value = formatApiError(error, '取消约战失败')
      throw error
    }
  }

  function openDuelPanel() {
    duelPanelOpen.value = true
    duelInviteUnread.value = 0
    duelError.value = ''
    void deps.refreshLobby()
  }

  function closeDuelPanel() {
    duelPanelOpen.value = false
    duelError.value = ''
  }

  function consumeDuelStartedMatch(): string | null {
    const id = duelStartedMatchId.value
    duelStartedMatchId.value = null
    return id
  }

  return {
    duels,
    duelPanelOpen,
    duelInviteUnread,
    duelError,
    duelStartedMatchId,
    pendingDuelInvitations,
    pendingDuelInvitationCount,
    activeDuels,
    upsertDuel,
    markDuelStarted,
    createDuelFor,
    acceptDuelInvitation,
    declineDuelInvitation,
    cancelDuelById,
    openDuelPanel,
    closeDuelPanel,
    consumeDuelStartedMatch,
  }
}
