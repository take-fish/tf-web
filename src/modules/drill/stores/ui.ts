import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 纯界面状态：抽屉、弹窗、会议模式、当前选中的注解。不放任何玩法数据。 */
export const useDrillUiStore = defineStore('drillUi', () => {
  const drawerUnitId = ref<string | null>(null)
  const meetingMode = ref(false)
  const reportOpen = ref(false)
  const arenaOpen = ref(false)
  const promptOpen = ref(false)
  const namingOpen = ref(false)
  const lineupOpen = ref(false)
  const lineupTab = ref<'mine' | 'recommended'>('mine')
  const selectedAnnotationId = ref<string | null>(null)
  const toast = ref<string | null>(null)

  function openDrawer(unitId: string) {
    drawerUnitId.value = unitId
  }

  function closeDrawer() {
    drawerUnitId.value = null
  }

  function toggleMeeting() {
    meetingMode.value = !meetingMode.value
  }

  function openReport() {
    reportOpen.value = true
  }

  function closeReport() {
    reportOpen.value = false
  }

  function openArena() {
    arenaOpen.value = true
  }

  function openPrompt() {
    promptOpen.value = true
  }

  function closePrompt() {
    promptOpen.value = false
  }

  function closeArena() {
    arenaOpen.value = false
  }

  function openLineup(tab: 'mine' | 'recommended' = 'mine') {
    lineupTab.value = tab
    lineupOpen.value = true
  }

  function closeLineup() {
    lineupOpen.value = false
  }

  function openNaming() {
    namingOpen.value = true
  }

  function closeNaming() {
    namingOpen.value = false
  }

  function selectAnnotation(id: string | null) {
    selectedAnnotationId.value = id
  }

  function notify(message: string) {
    toast.value = message
    window.setTimeout(() => {
      if (toast.value === message) toast.value = null
    }, 2400)
  }

  return {
    drawerUnitId,
    meetingMode,
    reportOpen,
    arenaOpen,
    promptOpen,
    namingOpen,
    lineupOpen,
    lineupTab,
    selectedAnnotationId,
    toast,
    openDrawer,
    closeDrawer,
    toggleMeeting,
    openReport,
    closeReport,
    openArena,
    closeArena,
    openPrompt,
    closePrompt,
    openNaming,
    closeNaming,
    openLineup,
    closeLineup,
    selectAnnotation,
    notify,
  }
})
