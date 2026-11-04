import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, formatApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import { fetchKnockout, latestKnockout, reportKnockoutGame, startKnockout } from '../api/knockout'
import type { KnockoutGameReport, KnockoutMatch, KnockoutView } from '../api/knockout'

/** 淘汰赛看板：轮询对阵、定位自己的场次、上报单局战绩。 */
export const useDrillKnockoutStore = defineStore('drillKnockout', () => {
  const auth = useAuthStore()

  const bracket = ref<KnockoutView | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const selfId = computed(() => (auth.user ? `u${auth.user.id}` : ''))
  const active = computed(() => bracket.value !== null)
  const matches = computed<KnockoutMatch[]>(() => bracket.value?.rounds.flat() ?? [])
  const champion = computed(() => bracket.value?.champion ?? null)

  function isMine(match: KnockoutMatch): boolean {
    return match.playerA?.userId === selfId.value || match.playerB?.userId === selfId.value
  }

  /** 当前还没打完、且自己参与的那一场 */
  const selfMatch = computed(
    () => matches.value.find((match) => !match.winner && isMine(match)) ?? null,
  )

  const hasLost = computed(
    () =>
      bracket.value?.status === 'RUNNING' &&
      matches.value.some((match) => match.winner && isMine(match) && match.winner !== selfId.value) &&
      !selfMatch.value,
  )

  function apply(view: KnockoutView) {
    bracket.value = view
    error.value = null
  }

  async function load(roomId: string): Promise<boolean> {
    if (!roomId) return false
    loading.value = true
    try {
      apply(await latestKnockout(roomId))
      return true
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        bracket.value = null
        return false
      }
      error.value = formatApiError(caught, '读取对阵失败')
      return false
    } finally {
      loading.value = false
    }
  }

  async function refresh(): Promise<boolean> {
    if (!bracket.value) return false
    try {
      apply(await fetchKnockout(bracket.value.id))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '刷新对阵失败')
      return false
    }
  }

  async function start(roomId: string): Promise<boolean> {
    loading.value = true
    try {
      apply(await startKnockout(roomId))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '开启淘汰赛失败')
      return false
    } finally {
      loading.value = false
    }
  }

  async function report(match: KnockoutMatch, report: KnockoutGameReport): Promise<boolean> {
    if (!bracket.value) return false
    try {
      apply(await reportKnockoutGame(bracket.value.id, match.id, report))
      return true
    } catch (caught) {
      error.value = formatApiError(caught, '上报对局失败')
      return false
    }
  }

  function leave() {
    bracket.value = null
    loading.value = false
    error.value = null
  }

  return {
    bracket,
    loading,
    error,
    selfId,
    active,
    matches,
    champion,
    selfMatch,
    hasLost,
    isMine,
    load,
    refresh,
    start,
    report,
    leave,
  }
})
