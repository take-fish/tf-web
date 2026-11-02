import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ProposalCard } from '../types'

const REVIEW_WINDOW_MS = 6000
const TICK_MS = 100

/**
 * 技术方案评审。
 *
 * 规则与内容设计一致：三选一、同影响面、6 秒未采纳按 A 处理。
 * 候选来自夹具；接真实专项系统后改成按 seed 抽取即可。
 */
export const useProposalStore = defineStore('proposal', () => {
  const open = ref(false)
  const round = ref(0)
  const cards = ref<readonly ProposalCard[]>([])
  const picks = ref<readonly ProposalCard[]>([])
  const remaining = ref(REVIEW_WINDOW_MS)

  let timer: ReturnType<typeof setInterval> | undefined

  const remainingSeconds = computed(() => Math.max(0, Math.ceil(remaining.value / 1000)))
  const progress = computed(() => Math.max(0, Math.min(1, remaining.value / REVIEW_WINDOW_MS)))

  function clearTimer() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  function close() {
    open.value = false
    clearTimer()
  }

  function pick(cardId: string) {
    const card = cards.value.find((item) => item.id === cardId)
    if (card) picks.value = [...picks.value, card]
    close()
  }

  function openReview(nextRound: number, candidates: readonly ProposalCard[]) {
    clearTimer()
    round.value = nextRound
    cards.value = candidates.slice(0, 3)
    remaining.value = REVIEW_WINDOW_MS
    open.value = true
    timer = setInterval(() => {
      remaining.value -= TICK_MS
      if (remaining.value > 0) return
      const first = cards.value[0]
      if (first) pick(first.id)
      else close()
    }, TICK_MS)
  }

  function dispose() {
    clearTimer()
  }

  return {
    open,
    round,
    cards,
    picks,
    remaining,
    remainingSeconds,
    progress,
    openReview,
    pick,
    close,
    dispose,
  }
})
