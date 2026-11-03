import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { LINEUP_DEFS } from '../core/lineups'
import type { LineupDef } from '../core/lineups'

/**
 * 阵容收藏与「本局使用中」的阵容。
 *
 * - favorites：收藏的阵容 id，落 localStorage；
 * - activeId：本局正在用的阵容，商城/选秀靠它点亮红点。
 */

const FAVORITES_KEY = 'fm.drill.lineups.v1'
const ACTIVE_KEY = 'fm.drill.lineup.active.v1'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const known = new Set(LINEUP_DEFS.map((lineup) => lineup.id))
    return parsed.filter((id): id is string => typeof id === 'string' && known.has(id))
  } catch {
    return []
  }
}

function loadActive(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    return raw && LINEUP_DEFS.some((lineup) => lineup.id === raw) ? raw : null
  } catch {
    return null
  }
}

export const useLineupStore = defineStore('drillLineup', () => {
  const favorites = ref<string[]>(loadFavorites())
  const activeId = ref<string | null>(loadActive())

  const mine = computed<LineupDef[]>(() =>
    favorites.value
      .map((id) => LINEUP_DEFS.find((lineup) => lineup.id === id))
      .filter((lineup): lineup is LineupDef => lineup !== undefined),
  )

  const active = computed<LineupDef | null>(
    () => LINEUP_DEFS.find((lineup) => lineup.id === activeId.value) ?? null,
  )

  const wantedIds = computed(() => new Set((active.value?.units ?? []).map((unit) => unit.defId)))

  /** 商城/选秀里这张卡是不是当前阵容要的实例 */
  function isWanted(defId: string | null | undefined): boolean {
    return defId !== null && defId !== undefined && wantedIds.value.has(defId)
  }

  function isFavorite(id: string): boolean {
    return favorites.value.includes(id)
  }

  function toggleFavorite(id: string) {
    favorites.value = isFavorite(id)
      ? favorites.value.filter((entry) => entry !== id)
      : [...favorites.value, id]
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.value))
    } catch {
      // 本地存储不可用时只影响持久化
    }
  }

  function useLineup(id: string | null) {
    activeId.value = id !== null && activeId.value === id ? null : id
    try {
      if (activeId.value) localStorage.setItem(ACTIVE_KEY, activeId.value)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {
      // 同上
    }
  }

  function clearActive() {
    useLineup(null)
  }

  return { favorites, mine, active, activeId, wantedIds, isWanted, isFavorite, toggleFavorite, useLineup, clearActive }
})
