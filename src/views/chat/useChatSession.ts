import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, formatApiError } from '@/lib/http'
import {
  fetchDirectHistory,
  fetchGroups,
  fetchMembers,
  fetchOnline,
  fetchUnread,
  markRead,
} from '@/modules/chat/chatApi'
import { ChatSocketClient } from '@/modules/chat/chatSocket'
import {
  formatDmLines,
  formatHistoryHeader,
  formatMessageLines,
  shortId,
} from '@/modules/chat/format'
import type {
  ChatGroup,
  ChatMessage,
  ChatStatus,
  ChatUser,
  OnlineMember,
  UnreadSummary,
} from '@/modules/chat/types'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'

import { useChatCommands } from './useChatCommands'
import { useChatImages } from './useChatImages'
import { useChatMessages } from './useChatMessages'
import type { GalleryEntry, TerminalApi } from './types'

export function useChatSession() {
  const auth = useAuthStore()
  const chatStore = useChatStore()
  const { selectedGroupId: currentGroupId } = storeToRefs(chatStore)
  const router = useRouter()
  const identity = useIdentityStore()
  const skinStore = useSkinStore()
  const terminalRef = ref<TerminalApi | null>(null)
  const groups = ref<ChatGroup[]>([])
  const members = ref<OnlineMember[]>([])
  const online = ref<OnlineMember[]>([])
  const unread = ref<UnreadSummary>({ groups: {}, dms: {}, total: 0 })
  const status = ref<ChatStatus>('connecting')
  const dmPeer = ref<OnlineMember | null>(null)
  const sideOpen = ref(skinStore.effectiveSkin !== 'terminal')
  const readyUser = ref<ChatUser | null>(null)
  const currentSeq = ref(0)
  const fileInput = ref<HTMLInputElement | null>(null)
  let socket: ChatSocketClient | null = null
  let onlineTimer: ReturnType<typeof setInterval> | undefined

  const recalledNotified = new Set<string>()

  if (auth.user) {
    identity.setAccount(`u${auth.user.id}`, auth.user.nickname || auth.user.username)
  }

  const selfUserId = computed(() => identity.state.userId)

  const statusLabel = computed(() => {
    const labels: Record<ChatStatus, string> = {
      connecting: '连接中',
      online: '已连接',
      reconnecting: '重连中',
      offline: '已断开',
    }
    return labels[status.value]
  })

  const prompt = computed(() => {
    if (dmPeer.value) {
      return `[${identity.state.nickname}@${identity.nodeName} ~]$`
    }
    return `[${identity.state.nickname}@${identity.nodeName} /opt/chat/group/${currentGroupId.value}]$`
  })

  const banner = [
    'FishMatrix Shell 4.2.1 (build 128)',
    `Last login: ${new Date().toLocaleString('zh-CN')} from 10.28.25.34`,
    `Connected to ${identity.nodeName}.`,
    '直接输入内容并回车发送；cd 切换群组，ssh 发起私聊。',
    'Ctrl+V 粘贴文本/图片；Ctrl+C 复制选中文本（无选区时中断）。',
  ]

  const sessionLabel = computed(() =>
    dmPeer.value
      ? `ssh ${dmPeer.value.nickname}@${dmPeer.value.node}`
      : `/opt/chat/group/${currentGroupId.value}`,
  )

  const dmUnreadEntries = computed(() =>
    Object.entries(unread.value.dms)
      .filter(([, count]) => count > 0)
      .map(([userId, count]) => ({
        userId,
        count,
        nickname: nicknameFor(userId),
      })),
  )

  // 群聊是临时会话，不存在跨会话未读；只统计私聊。
  const totalUnread = computed(() =>
    dmUnreadEntries.value.reduce((sum, entry) => sum + entry.count, 0),
  )

  function nicknameFor(userId: string): string {
    const found = online.value.find((member) => member.userId === userId)
      ?? members.value.find((member) => member.userId === userId)
    return found?.nickname ?? userId
  }

  function errorText(error: unknown): string {
    return formatApiError(error)
  }

  function handleAuthError(error: unknown): boolean {
    if (error instanceof ApiError && error.status === 401) {
      onAuthFailure()
      return true
    }
    return false
  }

  function onAuthFailure() {
    auth.clear()
    identity.reset()
    void router.replace({ name: 'login', query: { redirect: '/chat' } })
  }

  function isCurrentConversation(message: ChatMessage): boolean {
    if (dmPeer.value) {
      return message.groupId === null
        && (message.fromUserId === dmPeer.value.userId || message.toUserId === dmPeer.value.userId)
    }
    return message.groupId === currentGroupId.value
  }

  function trackCurrent(message: ChatMessage) {
    if (!isCurrentConversation(message)) return
    if (message.seq > currentSeq.value) currentSeq.value = message.seq
  }

  function markCurrentRead() {
    // 群聊不保存历史，也没有已读位点。
    const peerId = dmPeer.value?.userId
    if (!peerId || currentSeq.value <= 0) return
    const seq = currentSeq.value
    void markRead({ peerUserId: peerId, seq })
      .then(() => {
        delete unread.value.dms[peerId]
      })
      .catch((error) => {
        handleAuthError(error)
      })
  }

  function bumpDmUnread(peerUserId: string) {
    unread.value.dms[peerUserId] = (unread.value.dms[peerUserId] ?? 0) + 1
    unread.value.total += 1
  }

  function dmLines(message: ChatMessage): string[] {
    if (message.fromUserId !== selfUserId.value) return formatDmLines(message)
    const time = new Date(message.ts).toLocaleTimeString('zh-CN', { hour12: false })
    const target = dmPeer.value?.nickname ?? message.toUserId ?? 'peer'
    if (message.recalled) {
      return [`[${time}] [DM] -> ${target}: 该消息已撤回`]
    }
    if (message.kind === 'image') {
      return [`[${time}] [DM] -> ${target}: [图片] #${shortId(message.id)}`]
    }
    return [`[${time}] [DM] -> ${target}: ${message.content}`]
  }

  function focusTerminal() {
    terminalRef.value?.focus()
  }

  function pickImage() {
    const input = fileInput.value
    if (!input) return
    // 文件选择框关闭后浏览器会把焦点留在隐藏 input 上，导致退格/输入无响应。
    window.addEventListener('focus', focusTerminal, { once: true })
    input.click()
  }

  function submitSide(value: string) {
    terminalRef.value?.submitExternal(value)
  }

  function toggleSide() {
    sideOpen.value = !sideOpen.value
  }

  const messages = useChatMessages({
    terminalRef,
    onAuthFailure,
  })

  function openPreview(entry: GalleryEntry) {
    messages.preview.value = entry
  }

  function closePreview() {
    messages.preview.value = null
    focusTerminal()
  }

  const images = useChatImages({
    terminalRef,
    getDmPeer: () => dmPeer.value,
    getGroupId: () => currentGroupId.value,
    getSocket: () => socket,
    onAuthFailure,
    focusTerminal,
  })

  async function refreshOnline() {
    try {
      online.value = await fetchOnline()
    } catch (error) {
      handleAuthError(error)
    }
  }

  async function refreshUnread() {
    try {
      unread.value = await fetchUnread()
      for (const group of groups.value) {
        group.unread = unread.value.groups[group.id] ?? 0
      }
    } catch (error) {
      handleAuthError(error)
    }
  }

  function renderHistory(messagesPage: ChatMessage[], target: string): string[] {
    const lines: string[] = []
    if (messagesPage.length) {
      lines.push(formatHistoryHeader(target))
      for (const message of messagesPage) {
        if (!messages.rememberMessage(message)) continue
        trackCurrent(message)
        messages.addGallery(message)
        lines.push(...(dmPeer.value ? dmLines(message) : formatMessageLines(message)))
      }
    } else {
      lines.push(`[INFO] ${dmPeer.value ? 'private session has no records' : 'chat.log is empty'}`)
    }
    return lines
  }

  async function catchUp() {
    // 只有私聊有历史，断线后需要补拉；群聊消息在离线期间本就不存在。
    const peer = dmPeer.value
    if (!peer || currentSeq.value <= 0) return
    const afterSeq = currentSeq.value
    try {
      const page = await fetchDirectHistory(peer.userId, { afterSeq, limit: 200 })
      const lines: string[] = []
      for (const message of page.messages) {
        if (!messages.rememberMessage(message)) continue
        if (!isCurrentConversation(message)) continue
        trackCurrent(message)
        messages.addGallery(message)
        lines.push(...dmLines(message))
      }
      if (lines.length) {
        terminalRef.value?.writeLiveLines(['[INFO] 重连补拉完成'], 'info')
        terminalRef.value?.writeLiveLines(lines, 'message')
        markCurrentRead()
      }
    } catch (error) {
      if (!handleAuthError(error)) {
        terminalRef.value?.writeLiveLines(['[WARN] 断线补拉失败，可在 tail 中重试'], 'warn')
      }
    }
  }

  async function bootstrap() {
    const term = terminalRef.value
    const lines: string[] = []
    try {
      groups.value = await fetchGroups()
    } catch (error) {
      if (handleAuthError(error)) return
      lines.push('[WARN] 会话索引同步失败，请检查网关连接。')
    }
    await refreshUnread()
    chatStore.restoreGroup(groups.value.map((group) => group.id))
    socket?.join(currentGroupId.value)
    lines.push(`[INFO] session index loaded: ${groups.value.length} groups`)
    lines.push(`[INFO] joined /opt/chat/group/${currentGroupId.value}`)
    lines.push('[INFO] 群聊为临时会话，消息与图片不保存；私聊支持历史与图片持久化')
    lines.push('[INFO] 使用 ssh <昵称> 打开私聊；工具栏“图片”或 Ctrl+V 可发送图片')
    try {
      members.value = await fetchMembers(currentGroupId.value)
    } catch (error) {
      if (handleAuthError(error)) return
      lines.push('[WARN] 会话成员暂不可用')
    }
    void refreshOnline()
    term?.writeLiveLines(lines, 'info')
  }

  function onStatus(next: ChatStatus) {
    const wasDisconnected = status.value === 'reconnecting' || status.value === 'offline'
    status.value = next
    if (next === 'online') {
      void refreshOnline()
      if (wasDisconnected) void catchUp()
    }
  }

  function onReady(user: ChatUser) {
    readyUser.value = user
    if (user.nickname && user.nickname !== identity.state.nickname) {
      identity.setAccount(user.id, user.nickname)
    }
  }

  function onPresence(groupId: string, list: OnlineMember[]) {
    if (!dmPeer.value && groupId === currentGroupId.value) {
      members.value = list
    }
  }

  function onMessage(message: ChatMessage) {
    const fresh = messages.rememberMessage(message)
    const current = isCurrentConversation(message)
    // 群聊消息仅在群会话打开时实时显示；不在其他群积攒未读。
    if (!current || dmPeer.value) return
    if (!fresh) return
    terminalRef.value?.writeLiveLines(formatMessageLines(message), 'message')
    messages.addGallery(message)
  }

  function onDm(message: ChatMessage) {
    const fresh = messages.rememberMessage(message)
    const peerId = message.fromUserId === selfUserId.value
      ? message.toUserId
      : message.fromUserId
    const current = Boolean(
      dmPeer.value && peerId === dmPeer.value.userId && message.groupId === null,
    )
    if (current) trackCurrent(message)
    if (!fresh) return
    if (!peerId) return

    if (current) {
      terminalRef.value?.writeLiveLines(dmLines(message), 'message')
      messages.addGallery(message)
      if (message.fromUserId !== selfUserId.value) markCurrentRead()
      return
    }
    if (message.fromUserId === selfUserId.value) return
    bumpDmUnread(peerId)
    terminalRef.value?.writeLiveLines(
      [
        `[INFO] ${message.fromNickname}@${message.fromNode} 发来私聊，输入 ssh ${message.fromNickname} 打开会话`,
        ...formatDmLines(message),
      ],
      'link',
    )
  }

  function onOffline(offlineMessages: ChatMessage[]) {
    if (!offlineMessages.length) return
    const lines = [`[INFO] 恢复 ${offlineMessages.length} 条离线私聊消息`]
    for (const message of offlineMessages) {
      if (messages.rememberMessage(message)) {
        lines.push(...dmLines(message))
        const peerId = message.fromUserId === selfUserId.value
          ? message.toUserId
          : message.fromUserId
        if (peerId && dmPeer.value?.userId === peerId) {
          trackCurrent(message)
          messages.addGallery(message)
        } else if (peerId) {
          bumpDmUnread(peerId)
        }
      }
    }
    terminalRef.value?.writeLiveLines(lines, 'info')
  }

  function onRecalled(message: ChatMessage, byUserId: string) {
    messages.rememberMessage(message)
    if (!isCurrentConversation(message)) return
    if (recalledNotified.has(message.id)) return
    recalledNotified.add(message.id)
    terminalRef.value?.writeLiveLines(
      [`[INFO] [#${shortId(message.id)}] 消息已被 ${nicknameFor(byUserId)} 撤回`],
      'warn',
    )
  }

  function onSocketError(message: string, _code?: string, traceId?: string) {
    const reference = traceId ? `（编号 ${traceId}）` : ''
    terminalRef.value?.writeLiveLines([`[ERROR] ${message}${reference}`], 'error')
  }

  const commands = useChatCommands({
    terminalRef,
    groups,
    members,
    online,
    dmPeer,
    currentGroupId,
    currentSeq,
    selfUserId,
    chatStore,
    getSocket: () => socket,
    refreshUnread,
    renderHistory,
    markCurrentRead,
    clearGallery: messages.clearGallery,
    rememberMessage: messages.rememberMessage,
    shortIds: messages.shortIds,
    handleAuthError,
    errorText,
  })

  onMounted(() => {
    if (!auth.user) {
      onAuthFailure()
      return
    }
    socket = new ChatSocketClient({
      onStatus,
      onReady,
      onPresence,
      onMessage,
      onDm,
      onOffline,
      onRecalled,
      onError: onSocketError,
      onAuthError: onAuthFailure,
    })
    void socket.connect()
    void bootstrap()
    onlineTimer = setInterval(() => {
      void refreshOnline()
    }, 30_000)
  })

  onBeforeUnmount(() => {
    if (onlineTimer) clearInterval(onlineTimer)
    socket?.close()
    socket = null
    messages.clearGallery()
  })

  return {
    banner,
    closePreview,
    currentGroupId,
    dismissGallery: messages.dismissGallery,
    dmPeer,
    dmUnreadEntries,
    fileInput,
    focusTerminal,
    gallery: messages.gallery,
    groups,
    identity,
    onCommand: commands.onCommand,
    onImagePicked: images.onImagePicked,
    onPasteImages: images.onPasteImages,
    online,
    openPreview,
    pickImage,
    preview: messages.preview,
    previewImageByShortId: messages.previewImageByShortId,
    prompt,
    readyUser,
    selfUserId,
    sessionLabel,
    sideOpen,
    status,
    statusLabel,
    submitSide,
    terminalRef,
    toggleSide,
    totalUnread,
  }
}
