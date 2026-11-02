import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createFixtureSnapshot, formatElapsed } from '../fixtures'
import type { DrillSnapshot, ShopSlot } from '../types'

/**
 * 演练状态。
 *
 * 现在由夹具驱动；接真实模拟时，只需把 dispatch 换成
 * `session.command(...)` + 快照订阅，视图层不需要改动。
 */
export const useDrillStore = defineStore('drill', () => {
  const snapshot = ref<DrillSnapshot>(createFixtureSnapshot())
  const paused = ref(false)

  const elapsedLabel = computed(() => formatElapsed(snapshot.value.elapsed))
  const isPrep = computed(() => snapshot.value.phase === 'PREP')
  const rerollCost = 2
  const levelUpCost = 4

  function patch(next: Partial<DrillSnapshot>) {
    snapshot.value = { ...snapshot.value, ...next }
  }

  function tick(seconds = 1) {
    if (paused.value || snapshot.value.phase !== 'PREP') return
    patch({ elapsed: snapshot.value.elapsed + seconds })
  }

  function togglePause() {
    paused.value = !paused.value
  }

  function reroll(): boolean {
    if (snapshot.value.quotas < rerollCost) return false
    const rotated: ShopSlot[] = snapshot.value.shop.map((slot) => ({
      ...slot,
      soldOut: false,
    }))
    rotated.push(rotated.shift() as ShopSlot)
    patch({ quotas: snapshot.value.quotas - rerollCost, shop: rotated })
    return true
  }

  function toggleLock(slotIndex: number) {
    const shop = snapshot.value.shop.map((slot, index) =>
      index === slotIndex ? { ...slot, locked: !slot.locked } : slot,
    )
    patch({ shop })
  }

  function purchase(slotIndex: number): boolean {
    const slot = snapshot.value.shop[slotIndex]
    if (!slot || slot.soldOut) return false
    if (snapshot.value.quotas < slot.cost) return false
    const shop = snapshot.value.shop.map((item, index) =>
      index === slotIndex ? { ...item, soldOut: true } : item,
    )
    patch({
      quotas: snapshot.value.quotas - slot.cost,
      benchCount: snapshot.value.benchCount + 1,
      shop,
    })
    return true
  }

  function levelUp(): boolean {
    if (snapshot.value.level >= 9) return false
    if (snapshot.value.quotas < levelUpCost) return false
    patch({
      quotas: snapshot.value.quotas - levelUpCost,
      level: snapshot.value.level + 1,
    })
    return true
  }

  function startBattle() {
    patch({ phase: 'BATTLE' })
  }

  function settle(sliLoss: number) {
    const nextSli = Math.max(0, snapshot.value.sli - sliLoss)
    patch({
      phase: nextSli === 0 ? 'TERMINATED' : 'PREP',
      sli: nextSli,
      round: Math.min(snapshot.value.round + 1, snapshot.value.totalRounds),
    })
  }

  function reset() {
    snapshot.value = createFixtureSnapshot()
    paused.value = false
  }

  return {
    snapshot,
    paused,
    elapsedLabel,
    isPrep,
    rerollCost,
    levelUpCost,
    tick,
    togglePause,
    reroll,
    toggleLock,
    purchase,
    levelUp,
    startBattle,
    settle,
    reset,
  }
})
