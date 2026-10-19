import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { defaultSkinForPath, nextSkin, type SkinId } from '@/skins/registry'
import { useSettingsStore } from './settings'

export type BossTrigger = 'manual' | 'mouse'

export const useSkinStore = defineStore('skin', () => {
  const settings = useSettingsStore()
  const bossActive = ref(false)
  const bossTrigger = ref<BossTrigger>('manual')

  const activeSkin = computed<SkinId>(() => settings.state.activeSkin)
  const manualSkin = computed(() => settings.state.manualSkin)
  const effectiveSkin = computed<SkinId>(() => (bossActive.value ? 'ide' : activeSkin.value))

  /**
   * 路由变化时套用模块默认皮肤；同一路由刷新则保留用户手动选择。
   */
  function applyRoute(path: string) {
    const keepManual = settings.state.manualSkin && settings.state.lastRoute === path
    if (!keepManual) {
      settings.update({
        activeSkin: defaultSkinForPath(path),
        manualSkin: false,
      })
    }
    settings.update({ lastRoute: path })
  }

  function selectSkin(id: SkinId) {
    settings.update({ activeSkin: id, manualSkin: true })
    if (bossActive.value) exitBoss()
  }

  function cycleSkin() {
    selectSkin(nextSkin(effectiveSkin.value))
  }

  function enterBoss(trigger: BossTrigger = 'manual') {
    if (bossActive.value) return
    bossTrigger.value = trigger
    bossActive.value = true
  }

  function exitBoss() {
    bossActive.value = false
  }

  function toggleBoss(trigger: BossTrigger = 'manual') {
    if (bossActive.value) exitBoss()
    else enterBoss(trigger)
  }

  return {
    bossActive,
    bossTrigger,
    activeSkin,
    manualSkin,
    effectiveSkin,
    applyRoute,
    selectSkin,
    cycleSkin,
    enterBoss,
    exitBoss,
    toggleBoss,
  }
})
