<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import SettingsPanel from '@/components/SettingsPanel.vue'
import SkinSwitcher from '@/components/SkinSwitcher.vue'
import GameNotificationCenter from '@/modules/games/components/GameNotificationCenter.vue'
import TournamentLobby from '@/modules/games/components/TournamentLobby.vue'
import { moduleByPath } from '@/modules/registry'
import { documentTitle } from '@/skins/state'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore } from '@/stores/settings'
import { useSkinStore } from '@/stores/skin'
import { useTournamentStore } from '@/stores/tournament'
import BossScreen from '@/shells/BossScreen.vue'
import ChromeSide from '@/shells/chrome/ChromeSide.vue'
import ChromeStatus from '@/shells/chrome/ChromeStatus.vue'
import ChromeTabs from '@/shells/chrome/ChromeTabs.vue'
import ChromeTop from '@/shells/chrome/ChromeTop.vue'

const route = useRoute()
const skinStore = useSkinStore()
const settings = useSettingsStore()
const identity = useIdentityStore()
const tournament = useTournamentStore()

const settingsOpen = ref(false)
const skinsOpen = ref(false)
let leaveTimer: ReturnType<typeof setTimeout> | undefined

const moduleInfo = computed(() => moduleByPath(route.path))
const pageTitle = computed(() =>
  documentTitle(
    {
      skin: skinStore.effectiveSkin,
      moduleTitle: moduleInfo.value.documentTitle,
      host: identity.nodeName,
    },
    skinStore.bossActive,
  ),
)

watchEffect(() => {
  document.title = pageTitle.value
})

watch(
  () => route.fullPath,
  (path) => {
    skinStore.applyRoute(path)
    settingsOpen.value = false
    skinsOpen.value = false
  },
  { immediate: true },
)

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyF') {
    event.preventDefault()
    settingsOpen.value = false
    skinsOpen.value = false
    skinStore.toggleBoss()
    return
  }
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyM') {
    event.preventDefault()
    skinsOpen.value = !skinsOpen.value
    settingsOpen.value = false
    return
  }
  if (event.key === 'Escape') {
    if (settingsOpen.value) settingsOpen.value = false
    else if (skinsOpen.value) skinsOpen.value = false
  }
  if (event.key === 'Escape' && !isEditable(event.target) && skinStore.bossActive) {
    skinStore.exitBoss()
  }
}

function clearLeaveTimer() {
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = undefined
  }
}

function onDocumentPointerLeave() {
  if (!settings.state.autoBossOnMouseLeave || skinStore.bossActive) return
  clearLeaveTimer()
  leaveTimer = setTimeout(() => {
    skinStore.enterBoss('mouse')
  }, settings.state.autoBossDelayMs)
}

function onDocumentPointerEnter() {
  clearLeaveTimer()
  if (skinStore.bossActive && skinStore.bossTrigger === 'mouse') {
    skinStore.exitBoss()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  document.documentElement.addEventListener('pointerleave', onDocumentPointerLeave)
  document.documentElement.addEventListener('pointerenter', onDocumentPointerEnter)
  tournament.start()
})

onBeforeUnmount(() => {
  clearLeaveTimer()
  tournament.stop()
  window.removeEventListener('keydown', onKeydown, true)
  document.documentElement.removeEventListener('pointerleave', onDocumentPointerLeave)
  document.documentElement.removeEventListener('pointerenter', onDocumentPointerEnter)
})

function openSettings() {
  settingsOpen.value = true
  skinsOpen.value = false
}

function openSkins() {
  skinsOpen.value = true
  settingsOpen.value = false
}
</script>

<template>
  <div class="fm-app" :data-skin="skinStore.effectiveSkin">
    <div
      class="fm-shell"
      :inert="skinStore.bossActive"
      :aria-hidden="skinStore.bossActive ? 'true' : undefined"
    >
      <ChromeTop
        @settings="openSettings"
        @skins="openSkins"
        @tournament="tournament.openLobby()"
      />
      <div class="fm-workarea">
        <ChromeSide />
        <section class="fm-main">
          <ChromeTabs />
          <main class="fm-viewport">
            <RouterView />
          </main>
        </section>
      </div>
      <ChromeStatus />
    </div>

    <BossScreen v-if="skinStore.bossActive" />
    <SkinSwitcher v-if="skinsOpen" @close="skinsOpen = false" />
    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
    <TournamentLobby v-if="tournament.lobbyOpen" @close="tournament.closeLobby()" />
    <GameNotificationCenter />
  </div>
</template>
