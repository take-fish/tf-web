import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, formatApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import {
  chatRoom,
  createRoom,
  fetchRoom,
  joinRoom,
  readyRoom,
  reportRoom,
  skipRoom,
} from '../api/rooms'
import type { DrillRoomMode, DrillRoomReport, DrillRoomView } from '../api/rooms'

const POLL_MS = 1500
const CLOCK_MS = 500

/**
 * 联机演练房间：轮询服务端权威视图，本地引擎只负责按 seed 演算。
 *
 * 备战倒计时、直接开始、轮次推进、战绩榜都以服务端为准；
 * 组件只读这里的 computed，不再自己维护一份计时器。
 */
export const useDrillRoomStore = defineStore('drillRoom', () => {
  const auth = useAuthStore()

  const room = ref<DrillRoomView | null>(null)
  const roomId = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  const connected = ref(false)
  /** 服务端时间与本地时钟的偏移，用于倒计时 */
  const serverOffset = ref(0)
  const nowMs = ref(Date.now())

  let pollTimer: number | undefined
  let clockTimer: number | undefined
  let polling = false

  const active = computed(() => room.value !== null)
  const selfId = computed(() => (auth.user ? `u${auth.user.id}` : ''))
  const self = computed(
    () => room.value?.players.find((player) => player.userId === selfId.value) ?? null,
  )
  const isTournament = computed(() => room.value?.mode === 'TOURNAMENT')
  const status = computed(() => room.value?.status ?? '')
  const phase = computed(() => room.value?.phase ?? '')
  const isHost = computed(
    () => room.value?.players.find((player) => player.seat === 0)?.userId === selfId.value,
  )
  const readyCount = computed(
    () => room.value?.players.filter((player) => player.ready).length ?? 0,
  )
  const playerCount = computed(() => room.value?.players.length ?? 0)
  const canReady = computed(
    () => room.value?.status === 'WAITING' && !!self.value && !self.value.ready,
  )

  const prepRemaining = computed(() => {
    const view = room.value
    if (!view || view.phase !== 'PREP' || view.prepEndsAt <= 0) return null
    return Math.max(0, Math.ceil((view.prepEndsAt - nowMs.value) / 1000))
  })

  const selfSkipped = computed(
    () => room.value?.skipVotes.includes(selfId.value) ?? false,
  )
  const skipCount = computed(() => room.value?.skipVotes.length ?? 0)

  /** 本轮是否已经上报（服务端把 reportedRound 记为刚打完的轮次） */
  const selfReported = computed(() => {
    const view = room.value
    if (!view || !self.value) return false
    return self.value.reportedRound >= view.round
  })

  const canFight = computed(() => {
    const view = room.value
    if (!view || view.status !== 'RUNNING' || view.phase !== 'BATTLE') return false
    if (view.round !== localRound.value) return false
    if (selfReported.value) return false
    if (self.value && self.value.alive === false) return false
    return true
  })

  /** 由 DrillView 注入：本地引擎当前轮次，用来判断服务端是否已经放行 */
  const localRound = ref(0)
  function setLocalRound(round: number) {
    localRound.value = round
  }

  const gateMessage = computed(() => {
    const view = room.value
    if (!view) return '未连接房间'
    if (view.status === 'WAITING') {
      return `等待选手准备（${readyCount.value}/${playerCount.value}）`
    }
    if (view.status === 'FINISHED') return '本局已结束'
    if (view.phase === 'PREP') {
      return prepRemaining.value !== null ? `备战中，还剩 ${prepRemaining.value}s` : '备战中'
    }
    if (view.round !== localRound.value) return '等待其他选手同步轮次'
    if (selfReported.value) return '已上报，等待其他选手'
    return '当前不可发起'
  })

  function apply(view: DrillRoomView) {
    room.value = view
    roomId.value = view.id
    serverOffset.value = view.serverTime - Date.now()
    nowMs.value = view.serverTime
    connected.value = true
    error.value = null
  }

  function tick() {
    nowMs.value = Date.now() + serverOffset.value
  }

  function stopTimers() {
    if (pollTimer) window.clearInterval(pollTimer)
    if (clockTimer) window.clearInterval(clockTimer)
    pollTimer = undefined
    clockTimer = undefined
  }

  function startTimers() {
    stopTimers()
    pollTimer = window.setInterval(() => void refresh(), POLL_MS)
    clockTimer = window.setInterval(tick, CLOCK_MS)
  }

  async function refresh(): Promise<boolean> {
    if (!roomId.value || polling) return false
    polling = true
    try {
      const view = await fetchRoom(roomId.value)
      apply(view)
      // 锦标赛结束后还要靠房间轮询接收淘汰赛播报，等离开页面再停
      if (view.status === 'FINISHED' && view.mode !== 'TOURNAMENT') stopTimers()
      return true
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        // 房间已被服务端清理：停表并清掉视图，否则倒计时会冻结在最后一个数值上。
        stopTimers()
        room.value = null
        roomId.value = ''
        connected.value = false
        localRound.value = 0
        error.value = '演练房间不存在或已过期'
      } else {
        error.value = formatApiError(caught, '同步房间失败')
      }
      return false
    } finally {
      polling = false
    }
  }

  /** 直接连接已有房间；未加入时在候场阶段自动加入。 */
  async function connect(id: string): Promise<boolean> {
    if (!id) return false
    roomId.value = id
    loading.value = true
    try {
      let view = await fetchRoom(id)
      const member = view.players.some((player) => player.userId === selfId.value)
      if (!member) {
        if (view.status !== 'WAITING') {
          error.value = '本局已开始，无法中途加入'
          return false
        }
        view = await joinRoom(id)
      }
      apply(view)
      startTimers()
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '进入房间失败')
      return false
    } finally {
      loading.value = false
    }
  }

  async function create(mode: DrillRoomMode): Promise<DrillRoomView | null> {
    loading.value = true
    try {
      const view = await createRoom(mode)
      apply(view)
      startTimers()
      return view
    } catch (caught) {
      error.value = formatApiError(caught, '创建房间失败')
      return null
    } finally {
      loading.value = false
    }
  }

  async function join(id: string): Promise<DrillRoomView | null> {
    loading.value = true
    try {
      const view = await joinRoom(id.trim())
      apply(view)
      startTimers()
      return view
    } catch (caught) {
      error.value = formatApiError(caught, '加入房间失败')
      return null
    } finally {
      loading.value = false
    }
  }

  async function ready(): Promise<boolean> {
    if (!roomId.value) return false
    try {
      apply(await readyRoom(roomId.value))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '准备失败')
      return false
    }
  }

  async function skip(): Promise<boolean> {
    if (!roomId.value) return false
    try {
      apply(await skipRoom(roomId.value))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '直接开始失败')
      return false
    }
  }

  async function report(payload: DrillRoomReport): Promise<boolean> {
    if (!roomId.value) return false
    try {
      apply(await reportRoom(roomId.value, payload))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '上报战绩失败')
      return false
    }
  }

  async function chat(text: string): Promise<boolean> {
    if (!roomId.value) return false
    try {
      apply(await chatRoom(roomId.value, text))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '发送消息失败')
      return false
    }
  }

  function leave() {
    stopTimers()
    room.value = null
    roomId.value = ''
    connected.value = false
    loading.value = false
    error.value = null
    localRound.value = 0
    nowMs.value = Date.now()
  }

  return {
    room,
    roomId,
    loading,
    error,
    connected,
    active,
    self,
    selfId,
    isTournament,
    status,
    phase,
    isHost,
    readyCount,
    playerCount,
    canReady,
    prepRemaining,
    selfSkipped,
    skipCount,
    selfReported,
    canFight,
    gateMessage,
    localRound,
    setLocalRound,
    nowMs,
    connect,
    create,
    join,
    ready,
    skip,
    report,
    chat,
    refresh,
    tick,
    leave,
  }
})
