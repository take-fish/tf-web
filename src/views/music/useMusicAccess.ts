import { ref, type Ref } from 'vue'

import {
  approveAccessRequest,
  cancelAccessRequest,
  fetchMyAccessRequests,
  fetchReceivedAccessRequests,
  previewSharedTrack,
  rejectAccessRequest,
  requestAccess,
  revokeAccessRequest,
} from '@/modules/music/musicApi'
import type { AccessRequest, Track } from '@/modules/music/types'
import { errorText } from './music-helpers'

interface MusicAccessOptions {
  mode: Ref<'public' | 'private' | 'shared'>
  error: Ref<string>
  loadTracks: () => Promise<void>
  showNotice: (message: string) => void
}

export function useMusicAccess({ mode, error, loadTracks, showNotice }: MusicAccessOptions) {
  const shareTokenInput = ref('')
  const sharePreview = ref<Track | null>(null)
  const sharePreviewToken = ref('')
  const applying = ref(false)
  const applyMessage = ref('')
  const applyError = ref('')

  const requestsOpen = ref(false)
  const receivedRequests = ref<AccessRequest[]>([])
  const myRequests = ref<AccessRequest[]>([])

  async function lookupShare() {
    const token = shareTokenInput.value.trim()
    if (!token) return
    error.value = ''
    applyError.value = ''
    try {
      sharePreview.value = await previewSharedTrack(token)
      sharePreviewToken.value = token
    } catch (value) {
      sharePreview.value = null
      error.value = errorText(value)
    }
  }

  async function submitAccessRequest() {
    if (!sharePreview.value || applying.value) return
    applying.value = true
    applyError.value = ''
    try {
      await requestAccess(sharePreview.value.id, sharePreviewToken.value, applyMessage.value)
      sharePreview.value = null
      shareTokenInput.value = ''
      applyMessage.value = ''
      await loadTracks()
      showNotice('申请已提交，等待所有者处理')
    } catch (value) {
      applyError.value = errorText(value)
    } finally {
      applying.value = false
    }
  }

  async function openRequests() {
    requestsOpen.value = true
    await refreshRequests()
  }

  async function refreshRequests() {
    try {
      const [received, mine] = await Promise.all([
        fetchReceivedAccessRequests(),
        fetchMyAccessRequests(),
      ])
      receivedRequests.value = received
      myRequests.value = mine
    } catch (value) {
      error.value = errorText(value)
    }
  }

  async function decideRequest(
    request: AccessRequest,
    action: 'approve' | 'reject' | 'revoke' | 'cancel',
  ) {
    try {
      if (action === 'approve') await approveAccessRequest(request.id)
      else if (action === 'reject') await rejectAccessRequest(request.id)
      else if (action === 'revoke') await revokeAccessRequest(request.id)
      else await cancelAccessRequest(request.id)
      await refreshRequests()
      if (mode.value === 'shared') await loadTracks()
    } catch (value) {
      error.value = errorText(value)
    }
  }

  return {
    shareTokenInput,
    sharePreview,
    sharePreviewToken,
    applying,
    applyMessage,
    applyError,
    requestsOpen,
    receivedRequests,
    myRequests,
    lookupShare,
    submitAccessRequest,
    openRequests,
    refreshRequests,
    decideRequest,
  }
}
