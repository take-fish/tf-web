import { computed, ref, type Ref } from 'vue'

import { formatApiError } from '@/lib/http'
import {
  createExerciseRoom,
  fetchExerciseResults,
  fetchExerciseRooms,
  joinExerciseRoom,
  leaveExerciseRoom,
  readyExerciseRoom,
} from '@/modules/games/gameApi'
import type { GameSocketClient } from '@/modules/games/gameSocket'
import type {
  ExerciseInput,
  ExerciseMode,
  ExerciseResult,
  ExerciseRoom,
  ExerciseState,
  GameExerciseFinishedEvent,
  GameExerciseStateEvent,
  GameMatch,
} from '@/modules/games/types'

export interface ExerciseModuleDeps {
  hasToken: () => boolean
  socket: () => GameSocketClient | null
  ownUserId: Ref<string>
  currentMatch: Ref<GameMatch | null>
  lastError: Ref<string>
  refreshCurrentMatch: () => Promise<void>
}

/**
 * 集群巡检对抗（2D 轻 FPS）：休闲房间大厅、当前房间与赛事小局的状态合并。
 * 由 pinia store 组装为单一对外 API，模块本身不持有跨域状态。
 */
export function createExerciseModule(deps: ExerciseModuleDeps) {
  const { hasToken, socket, ownUserId, currentMatch, lastError } = deps

  const exerciseOpen = ref(false)
  const exerciseRooms = ref<ExerciseRoom[]>([])
  const exerciseRoom = ref<ExerciseRoom | null>(null)
  const exerciseRoomId = ref<string | null>(null)
  const exerciseState = ref<ExerciseState | null>(null)
  const exerciseFinished = ref<GameExerciseFinishedEvent | null>(null)
  const exerciseResults = ref<ExerciseResult[]>([])
  const exerciseLoading = ref(false)
  const exerciseBusy = ref(false)
  const exerciseError = ref('')

  const exerciseSelfActor = computed(
    () =>
      exerciseState.value?.actors.find((actor) => actor.userId === ownUserId.value) ??
      null,
  )
  const exerciseInRoom = computed(() => Boolean(exerciseRoomId.value))
  const exerciseRunning = computed(
    () =>
      exerciseRoom.value?.status === 'RUNNING' ||
      Boolean(exerciseState.value && !exerciseState.value.finished),
  )

  /** 赛事房间的巡检状态直接落在当前小局上，休闲房间则落在本地房间快照。 */
  function applyExerciseState(event: GameExerciseStateEvent) {
    const round = currentMatch.value?.currentRound
    if (round && round.id === event.roomId) {
      if (event.seq >= round.seq) {
        round.gameId = 'cluster-patrol-arena'
        round.seq = event.seq
        round.state = event.state
        round.endsAt = event.state.endsAt
        round.lastMoveAt = event.serverTime
        if (event.state.finished) {
          round.winnerUserId = event.state.winnerUserId ?? null
        }
      }
    }
    if (exerciseRoomId.value && event.roomId === exerciseRoomId.value) {
      exerciseState.value = { ...event.state, you: event.you ?? ownUserId.value }
    }
  }

  function applyExerciseFinished(event: GameExerciseFinishedEvent) {
    const round = currentMatch.value?.currentRound
    if (event.state) {
      applyExerciseState({
        type: 'exercise_state',
        roomId: event.roomId,
        roomCode: event.roomCode,
        mode: event.mode,
        matchId: event.matchId,
        seq: event.state.seq,
        serverTime: event.state.serverTime,
        you: event.state.you ?? null,
        state: event.state,
      })
    }
    if (round && round.id === event.roomId) {
      // 服务端随后走 BO 计分与晋级流程，稍后补拉一次比赛详情。
      setTimeout(() => {
        void deps.refreshCurrentMatch()
      }, 400)
    }
    if (exerciseRoomId.value === event.roomId) {
      exerciseFinished.value = event
      if (exerciseRoom.value) {
        exerciseRoom.value = { ...exerciseRoom.value, status: 'FINISHED' }
      }
      void refreshExerciseResults()
    }
  }

  function applyExerciseRoom(room: ExerciseRoom) {
    const index = exerciseRooms.value.findIndex((entry) => entry.roomId === room.roomId)
    if (index >= 0) exerciseRooms.value[index] = room
    else if (room.status === 'WAITING' || exerciseRoomId.value === room.roomId) {
      exerciseRooms.value.unshift(room)
    }
    if (exerciseRoomId.value !== room.roomId) return
    exerciseRoom.value = room
    if (room.status === 'RUNNING') exerciseFinished.value = null
    if (room.state) {
      exerciseState.value = { ...room.state, you: ownUserId.value }
    }
  }

  function resetExerciseRoom() {
    exerciseRoomId.value = null
    exerciseRoom.value = null
    exerciseState.value = null
    exerciseFinished.value = null
    exerciseError.value = ''
  }

  function enterExerciseRoom(room: ExerciseRoom) {
    exerciseRoomId.value = room.roomId
    exerciseRoom.value = room
    exerciseFinished.value = null
    exerciseError.value = ''
    exerciseState.value = room.state
      ? { ...room.state, you: ownUserId.value }
      : null
    const index = exerciseRooms.value.findIndex((entry) => entry.roomId === room.roomId)
    if (index >= 0) exerciseRooms.value[index] = room
    else exerciseRooms.value.unshift(room)
    // 单人训练在创建时已开局，服务端不接受“加入训练房”；其余房间用于登记重连。
    if (room.mode !== 'TRAINING') socket()?.joinExercise(room.roomId)
  }

  async function refreshExerciseRooms() {
    if (!hasToken()) return
    exerciseLoading.value = true
    exerciseError.value = ''
    try {
      const [rooms, results] = await Promise.all([
        fetchExerciseRooms(),
        fetchExerciseResults(10),
      ])
      exerciseRooms.value = rooms
      exerciseResults.value = results
      const current = exerciseRoomId.value
        ? rooms.find((room) => room.roomId === exerciseRoomId.value)
        : null
      if (current) applyExerciseRoom(current)
    } catch (error) {
      exerciseError.value = formatApiError(error, '巡检房间加载失败')
    } finally {
      exerciseLoading.value = false
    }
  }

  async function refreshExerciseResults() {
    try {
      exerciseResults.value = await fetchExerciseResults(10)
    } catch {
      // 战绩为增强能力，失败不影响房间
    }
  }

  async function createExercise(
    mode: ExerciseMode,
    maxPlayers?: number,
  ): Promise<ExerciseRoom | null> {
    if (exerciseBusy.value) return null
    exerciseBusy.value = true
    exerciseError.value = ''
    try {
      const room = await createExerciseRoom(mode, maxPlayers)
      enterExerciseRoom(room)
      if (room.status === 'RUNNING') {
        socket()?.refreshExerciseRooms()
      }
      return room
    } catch (error) {
      exerciseError.value = formatApiError(error, '巡检房间创建失败')
      return null
    } finally {
      exerciseBusy.value = false
    }
  }

  async function joinExercise(key: string): Promise<ExerciseRoom | null> {
    if (exerciseBusy.value) return null
    exerciseBusy.value = true
    exerciseError.value = ''
    try {
      const room = await joinExerciseRoom(key)
      enterExerciseRoom(room)
      return room
    } catch (error) {
      exerciseError.value = formatApiError(error, '加入巡检房间失败')
      return null
    } finally {
      exerciseBusy.value = false
    }
  }

  async function readyExercise(): Promise<ExerciseRoom | null> {
    const id = exerciseRoomId.value
    if (!id || exerciseBusy.value) return null
    exerciseBusy.value = true
    exerciseError.value = ''
    try {
      const room = await readyExerciseRoom(id)
      enterExerciseRoom(room)
      return room
    } catch (error) {
      exerciseError.value = formatApiError(error, '准备失败')
      return null
    } finally {
      exerciseBusy.value = false
    }
  }

  async function leaveExercise(id?: string): Promise<void> {
    const key = id ?? exerciseRoomId.value
    if (!key) return
    socket()?.leaveExercise(key)
    try {
      await leaveExerciseRoom(key)
    } catch (error) {
      exerciseError.value = formatApiError(error, '离开房间失败')
    } finally {
      if (exerciseRoomId.value === key) resetExerciseRoom()
      const index = exerciseRooms.value.findIndex((entry) => entry.roomId === key)
      if (index >= 0) exerciseRooms.value.splice(index, 1)
    }
  }

  function currentExerciseRoomKey(): string | null {
    const round = currentMatch.value?.currentRound
    if (
      round &&
      (round.gameId === 'cluster-patrol-arena' ||
        round.state?.gameId === 'cluster-patrol-arena')
    ) {
      return round.id
    }
    return exerciseRoomId.value
  }

  function sendExerciseInput(input: ExerciseInput): boolean {
    const id = currentExerciseRoomKey()
    if (!id) return false
    if (!socket()?.sendExerciseInput(id, input)) {
      lastError.value = '巡检通道未连接，请稍后重试'
      return false
    }
    lastError.value = ''
    return true
  }

  function openExerciseLobby() {
    exerciseOpen.value = true
    exerciseError.value = ''
    void refreshExerciseRooms()
  }

  function closeExerciseLobby() {
    if (exerciseRoomId.value) void leaveExercise()
    exerciseOpen.value = false
  }

  return {
    exerciseOpen,
    exerciseRooms,
    exerciseRoom,
    exerciseRoomId,
    exerciseState,
    exerciseFinished,
    exerciseResults,
    exerciseLoading,
    exerciseBusy,
    exerciseError,
    exerciseSelfActor,
    exerciseInRoom,
    exerciseRunning,
    applyExerciseState,
    applyExerciseFinished,
    applyExerciseRoom,
    refreshExerciseRooms,
    refreshExerciseResults,
    createExercise,
    joinExercise,
    readyExercise,
    leaveExercise,
    sendExerciseInput,
    openExerciseLobby,
    closeExerciseLobby,
  }
}
