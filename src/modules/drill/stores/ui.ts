import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 纯界面状态：抽屉、弹窗、会议模式。不放任何玩法数据。 */
export const useDrillUiStore = defineStore('drillUi', () => {
  const drawerUnitId = ref<string | null>(null)
  const meetingMode = ref(false)
  const reportOpen = ref(false)

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

  return {
    drawerUnitId,
    meetingMode,
    reportOpen,
    openDrawer,
    closeDrawer,
    toggleMeeting,
    openReport,
    closeReport,
  }
})
