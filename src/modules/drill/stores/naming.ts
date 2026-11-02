import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/**
 * 命名覆盖层（管理员专用）。
 *
 * 只影响展示，不参与任何计算：引擎、战斗、掉落全部仍按 defId 走。
 * 覆盖写 localStorage，刷新后生效；清空输入即回到出厂名。
 */

const STORAGE_KEY = 'fm.drill.naming.v1'

interface NamingOverrides {
  units: Record<string, string>
  traits: Record<string, string>
}

function load(): NamingOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { units: {}, traits: {} }
    const parsed = JSON.parse(raw) as Partial<NamingOverrides>
    return { units: parsed.units ?? {}, traits: parsed.traits ?? {} }
  } catch {
    return { units: {}, traits: {} }
  }
}

export const useDrillNamingStore = defineStore('drillNaming', () => {
  const initial = load()
  const unitNames = ref<Record<string, string>>({ ...initial.units })
  const traitNames = ref<Record<string, string>>({ ...initial.traits })

  const changedCount = computed(
    () => Object.keys(unitNames.value).length + Object.keys(traitNames.value).length,
  )

  const unitMap = computed<Record<string, string>>(() => ({ ...unitNames.value }))
  const traitMap = computed<Record<string, string>>(() => ({ ...traitNames.value }))

  function renameUnit(id: string, name: string) {
    const next = { ...unitNames.value }
    const trimmed = name.trim()
    if (trimmed === '') delete next[id]
    else next[id] = trimmed
    unitNames.value = next
  }

  function renameTrait(id: string, name: string) {
    const next = { ...traitNames.value }
    const trimmed = name.trim()
    if (trimmed === '') delete next[id]
    else next[id] = trimmed
    traitNames.value = next
  }

  function resetUnit(id: string) {
    const next = { ...unitNames.value }
    delete next[id]
    unitNames.value = next
  }

  function resetTrait(id: string) {
    const next = { ...traitNames.value }
    delete next[id]
    traitNames.value = next
  }

  function resetAll() {
    unitNames.value = {}
    traitNames.value = {}
  }

  watch(
    [unitNames, traitNames],
    () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ units: unitNames.value, traits: traitNames.value }),
        )
      } catch {
        // 存不下不影响展示
      }
    },
    { deep: true },
  )

  return {
    unitNames,
    traitNames,
    unitMap,
    traitMap,
    changedCount,
    renameUnit,
    renameTrait,
    resetUnit,
    resetTrait,
    resetAll,
  }
})
