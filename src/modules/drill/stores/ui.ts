import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 纯界面状态：抽屉、弹窗、会议模式、当前选中的注解。不放任何玩法数据。 */
export const useDrillUiStore = defineStore('drillUi', () => {
  const drawerUnitId = ref<string | null>(null)
  const meetingMode = ref(false)
  const reportOpen = ref(false)
  const replayOpen = ref(false)
  const namingOpen = ref(false)
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

  function openReplay() {
    replayOpen.value = true
  }

  function closeReplay() {
    replayOpen.value = false
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
    replayOpen,
    namingOpen,
    selectedAnnotationId,
    toast,
    openDrawer,
    closeDrawer,
    toggleMeeting,
    openReport,
    closeReport,
    openReplay,
    closeReplay,
    openNaming,
    closeNaming,
    selectAnnotation,
    notify,
  }
})
