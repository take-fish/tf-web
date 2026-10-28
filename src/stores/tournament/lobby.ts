import type { Ref } from 'vue'

import { formatApiError } from '@/lib/http'
import {
  acceptTournament,
  cancelTournament,
  createTournament,
  declineTournament,
  deleteTournament,
} from '@/modules/games/gameApi'
import type {
  ArenaGameId,
  BlindLayout,
  GameFormat,
  GameOnlineUser,
  GameTournament,
  SelectableGameId,
  TournamentPoolGameId,
  TournamentType,
} from '@/modules/games/types'

export interface LobbyModuleDeps {
  lobbyError: Ref<string>
  lobbyOpen: Ref<boolean>
  lobbyMode: Ref<TournamentType>
  lobbyPreferredGameId: Ref<TournamentPoolGameId | ''>
  lobbyScript: Ref<ArenaGameId>
  inviteUnread: Ref<number>
  tournaments: Ref<GameTournament[]>
  upsertTournament: (tournament: GameTournament) => void
  removeTournamentLocally: (tournamentId: string) => void
  refreshLobby: () => Promise<void>
}

/** 演练调度台：创建、邀请应答、取消/删除与入口开合。 */
export function createLobbyModule(deps: LobbyModuleDeps) {
  const { lobbyError } = deps

  async function create(payload: {
    name: string
    format: GameFormat
    players: GameOnlineUser[]
    gameId?: SelectableGameId
    blindLayout?: BlindLayout
    gamePool?: TournamentPoolGameId[]
  }): Promise<GameTournament> {
    lobbyError.value = ''
    try {
      const tournament = await createTournament(payload)
      deps.upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '演练创建失败')
      throw error
    }
  }

  async function acceptInvitation(id: string) {
    lobbyError.value = ''
    try {
      const tournament = await acceptTournament(id)
      deps.upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '接受邀请失败')
      throw error
    }
  }

  async function declineInvitation(id: string) {
    lobbyError.value = ''
    try {
      const tournament = await declineTournament(id)
      deps.upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '拒绝邀请失败')
      throw error
    }
  }

  async function cancel(id: string) {
    lobbyError.value = ''
    try {
      const tournament = await cancelTournament(id)
      deps.upsertTournament(tournament)
      return tournament
    } catch (error) {
      lobbyError.value = formatApiError(error, '取消演练失败')
      throw error
    }
  }

  async function remove(id: string) {
    lobbyError.value = ''
    try {
      await deleteTournament(id)
      deps.removeTournamentLocally(id)
    } catch (error) {
      lobbyError.value = formatApiError(error, '删除演练失败')
      throw error
    }
  }

  /** 指定剧本进入 = 锦标赛专精；不指定 = 顶部入口的 S赛综合抽签。 */
  function openLobby(gameId?: TournamentPoolGameId) {
    if (gameId) {
      deps.lobbyMode.value = 'CHAMPIONSHIP'
      deps.lobbyPreferredGameId.value = gameId
      if (gameId !== 'blind-xiangqi') deps.lobbyScript.value = gameId
    } else {
      deps.lobbyMode.value = 'SERIES'
      deps.lobbyPreferredGameId.value = ''
    }
    deps.lobbyOpen.value = true
    deps.inviteUnread.value = 0
    void deps.refreshLobby()
  }

  function closeLobby() {
    deps.lobbyOpen.value = false
    deps.lobbyMode.value = 'SERIES'
    deps.lobbyPreferredGameId.value = ''
  }

  function findTournament(id: string): GameTournament | undefined {
    return deps.tournaments.value.find((tournament) => tournament.id === id)
  }

  return {
    create,
    acceptInvitation,
    declineInvitation,
    cancel,
    remove,
    openLobby,
    closeLobby,
    findTournament,
  }
}
