<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { ApiError } from '@/lib/http'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'
import { ASCII_ARTS, findAsciiArt } from '@/modules/chat/asciiArt'
import {
  fetchDirectHistory,
  fetchGroupHistory,
  fetchGroups,
  fetchMembers,
  fetchOnline,
  fetchUnread,
  markRead,
  recallMessage,
  searchDirect,
  searchGroup,
} from '@/modules/chat/chatApi'
import { ChatSocketClient } from '@/modules/chat/chatSocket'
import { parseCommand } from '@/modules/chat/commands'
import {
  formatDmLines,
  formatGroupListing,
  formatHistoryHeader,
  formatMemberTable,
  formatMessageLines,
  formatOnlineTable,
  formatSearchResults,
  helpLines,
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
import TerminalPane from '@/modules/chat/components/TerminalPane.vue'

type ChatTone = 'info' | 'ok' | 'warn' | 'error' | 'dim' | 'message' | 'ascii' | 'link'

interface TerminalApi {
  writeLines(lines: string[], tone?: ChatTone): void
  writeLiveLines(lines: string[], tone?: ChatTone): void
  endCommand(): void
  clearScreen(): void
  focus(): void
  submitExternal(value: string): boolean
}

const auth = useAuthStore()
const router = useRouter()
const identity = useIdentityStore()
const skinStore = useSkinStore()
const terminalRef = ref<TerminalApi | null>(null)
const groups = ref<ChatGroup[]>([])
const members = ref<OnlineMember[]>([])
const online = ref<OnlineMember[]>([])
const unread = ref<UnreadSummary>({ groups: {}, dms: {}, total: 0 })
const status = ref<ChatStatus>('connecting')
const currentGroupId = ref('dev-group')
const dmPeer = ref<OnlineMember | null>(null)
const sideOpen = ref(skinStore.effectiveSkin !== 'terminal')
const readyUser = ref<ChatUser | null>(null)
const currentSeq = ref(0)
let socket: ChatSocketClient | null = null
let onlineTimer: ReturnType<typeof setInterval> | undefined

const seenIds = new Set<string>()
const recalledNotified = new Set<string>()
const shortIds = new Map<string, string>()
const shortOrder: string[] = []

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

const totalUnread = computed(() =>
  dmUnreadEntries.value.reduce((sum, entry) => sum + entry.count, 0) +
  groups.value.reduce((sum, group) => sum + (group.id === currentGroupId.value && !dmPeer.value ? 0 : group.unread), 0),
)

function nicknameFor(userId: string): string {
  const found = online.value.find((member) => member.userId === userId)
    ?? members.value.find((member) => member.userId === userId)
  return found?.nickname ?? userId
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败'
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

function rememberMessage(message: ChatMessage): boolean {
  if (seenIds.has(message.id)) return false
  seenIds.add(message.id)
  const key = shortId(message.id)
  if (!shortIds.has(key)) {
    shortIds.set(key, message.id)
    shortOrder.push(key)
    if (shortOrder.length > 500) {
      const evicted = shortOrder.shift()
      if (evicted) shortIds.delete(evicted)
    }
  } else {
    shortIds.set(key, message.id)
  }
  return true
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
  if (currentSeq.value <= 0) return
  const peerId = dmPeer.value?.userId
  const groupId = currentGroupId.value
  const seq = currentSeq.value
  const request = peerId
    ? markRead({ peerUserId: peerId, seq })
    : markRead({ groupId, seq })
  void request
    .then(() => {
      if (peerId) {
        delete unread.value.dms[peerId]
      } else {
        unread.value.groups[groupId] = 0
        const group = groups.value.find((item) => item.id === groupId)
        if (group) group.unread = 0
      }
    })
    .catch((error) => {
      handleAuthError(error)
    })
}

function bumpGroupUnread(groupId: string) {
  const group = groups.value.find((item) => item.id === groupId)
  if (group) group.unread += 1
  unread.value.groups[groupId] = (unread.value.groups[groupId] ?? 0) + 1
  unread.value.total += 1
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
  return [`[${time}] [DM] -> ${target}: ${message.content}`]
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
  const fresh = rememberMessage(message)
  const current = isCurrentConversation(message)
  if (current) trackCurrent(message)
  if (!fresh) return

  const isSelf = message.fromUserId === selfUserId.value
  if (!current) {
    if (!isSelf && message.groupId) bumpGroupUnread(message.groupId)
    return
  }
  if (dmPeer.value) return
  terminalRef.value?.writeLiveLines(formatMessageLines(message), 'message')
  if (!isSelf) markCurrentRead()
}

function onDm(message: ChatMessage) {
  const fresh = rememberMessage(message)
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

function onOffline(messages: ChatMessage[]) {
  if (!messages.length) return
  const lines = [`[INFO] 恢复 ${messages.length} 条离线私聊消息`]
  for (const message of messages) {
    if (rememberMessage(message)) {
      lines.push(...dmLines(message))
      const peerId = message.fromUserId === selfUserId.value
        ? message.toUserId
        : message.fromUserId
      if (peerId && !(dmPeer.value?.userId === peerId)) bumpDmUnread(peerId)
    }
  }
  terminalRef.value?.writeLiveLines(lines, 'info')
}

function onRecalled(message: ChatMessage, byUserId: string) {
  rememberMessage(message)
  if (!isCurrentConversation(message)) return
  if (recalledNotified.has(message.id)) return
  recalledNotified.add(message.id)
  terminalRef.value?.writeLiveLines(
    [`[INFO] [#${shortId(message.id)}] 消息已被 ${nicknameFor(byUserId)} 撤回`],
    'warn',
  )
}

function onSocketError(message: string) {
  terminalRef.value?.writeLiveLines([`[ERROR] ${message}`], 'error')
}

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

function renderHistory(messages: ChatMessage[], target: string): string[] {
  const lines: string[] = []
  if (messages.length) {
    lines.push(formatHistoryHeader(target))
    for (const message of messages) {
      if (!rememberMessage(message)) continue
      trackCurrent(message)
      lines.push(...(dmPeer.value ? dmLines(message) : formatMessageLines(message)))
    }
  } else {
    lines.push(`[INFO] ${dmPeer.value ? 'private session has no records' : 'chat.log is empty'}`)
  }
  return lines
}

async function catchUp() {
  if (currentSeq.value <= 0) return
  const afterSeq = currentSeq.value
  try {
    const page = dmPeer.value
      ? await fetchDirectHistory(dmPeer.value.userId, { afterSeq, limit: 200 })
      : await fetchGroupHistory(currentGroupId.value, { afterSeq, limit: 200 })
    const lines: string[] = []
    for (const message of page.messages) {
      if (!rememberMessage(message)) continue
      if (!isCurrentConversation(message)) continue
      trackCurrent(message)
      lines.push(...(dmPeer.value ? dmLines(message) : formatMessageLines(message)))
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
  const preferred = groups.value.find((group) => group.id === 'dev-group') ?? groups.value[0]
  if (preferred) currentGroupId.value = preferred.id
  socket?.join(currentGroupId.value)
  lines.push(`[INFO] session index loaded: ${groups.value.length} groups`)
  lines.push(`[INFO] joined /opt/chat/group/${currentGroupId.value}`)
  try {
    const [history, groupMembers] = await Promise.all([
      fetchGroupHistory(currentGroupId.value, { limit: 12 }),
      fetchMembers(currentGroupId.value),
    ])
    members.value = groupMembers
    lines.push(...renderHistory(history.messages, `/opt/chat/group/${currentGroupId.value}/chat.log`))
    markCurrentRead()
  } catch (error) {
    if (handleAuthError(error)) return
    lines.push('[WARN] 会话历史暂不可用')
  }
  void refreshOnline()
  term?.writeLiveLines(lines, 'info')
}

async function switchGroup(groupId: string, term: TerminalApi) {
  if (!groups.value.some((group) => group.id === groupId)) {
    term.writeLines([`cd: no such file or directory: /opt/chat/group/${groupId}`], 'error')
    return
  }
  if (dmPeer.value) {
    dmPeer.value = null
  } else if (groupId === currentGroupId.value) {
    term.writeLines([`[INFO] already in /opt/chat/group/${groupId}`], 'dim')
    return
  }
  currentGroupId.value = groupId
  currentSeq.value = 0
  socket?.join(groupId)
  const lines = [`[INFO] switched to /opt/chat/group/${groupId}`]
  try {
    const [history, groupMembers] = await Promise.all([
      fetchGroupHistory(groupId, { limit: 10 }),
      fetchMembers(groupId),
    ])
    members.value = groupMembers
    lines.push(...renderHistory(history.messages, `/opt/chat/group/${groupId}/chat.log`))
    markCurrentRead()
  } catch (error) {
    if (handleAuthError(error)) return
    lines.push('[WARN] 会话历史加载失败')
  }
  void refreshUnread()
  term.writeLines(lines, 'message')
}

function sendChat(content: string, kind: 'text' | 'ascii', term: TerminalApi) {
  const sent = dmPeer.value
    ? socket?.sendDirectMessage(dmPeer.value.userId, content, kind)
    : socket?.sendGroupMessage(content, kind)
  if (!sent) {
    term.writeLines(['[ERROR] 消息通道未连接，消息未发送'], 'error')
  }
}

async function tail(lineCount: number, term: TerminalApi) {
  const lines: string[] = []
  try {
    if (dmPeer.value) {
      const page = await fetchDirectHistory(dmPeer.value.userId, { limit: lineCount })
      lines.push(...renderHistory(page.messages, `dm/${dmPeer.value.nickname}`))
    } else {
      currentSeq.value = 0
      const page = await fetchGroupHistory(currentGroupId.value, { limit: lineCount })
      lines.push(...renderHistory(page.messages, `/opt/chat/group/${currentGroupId.value}/chat.log`))
    }
    markCurrentRead()
  } catch (error) {
    if (handleAuthError(error)) return
    lines.push(`[ERROR] ${errorText(error)}`)
  }
  term.writeLines(lines, 'message')
}

async function resyncCurrentGroup() {
  try {
    const page = await fetchGroupHistory(currentGroupId.value, { limit: 1 })
    const last = page.messages[page.messages.length - 1]
    if (last) {
      trackCurrent(last)
      markCurrentRead()
    }
  } catch (error) {
    handleAuthError(error)
  }
}

async function showMembers(term: TerminalApi) {
  term.writeLines(['[INFO] ps aux | grep dev'], 'dim')
  try {
    members.value = await fetchMembers(currentGroupId.value)
    term.writeLines(formatMemberTable(members.value), 'message')
  } catch (error) {
    if (handleAuthError(error)) return
    term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
  }
}

async function showOnline(term: TerminalApi) {
  try {
    online.value = await fetchOnline()
    term.writeLines(formatOnlineTable(online.value, selfUserId.value), 'message')
  } catch (error) {
    if (handleAuthError(error)) return
    term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
  }
}

function resolveMember(target: string): OnlineMember | undefined {
  const [name, node] = target.split('@')
  const matches = (member: OnlineMember) =>
    (member.nickname === name || member.userId === name) && (!node || member.node === node)
  return online.value.find(matches) ?? members.value.find(matches)
}

async function openDm(target: string, term: TerminalApi) {
  let member = resolveMember(target)
  if (!member) {
    try {
      online.value = await fetchOnline()
      members.value = await fetchMembers(currentGroupId.value)
      member = resolveMember(target)
    } catch (error) {
      if (handleAuthError(error)) return
    }
  }
  if (!member) {
    term.writeLines(
      [`ssh: Could not resolve hostname ${target}: Name or service not known`],
      'error',
    )
    return
  }
  if (member.userId === selfUserId.value) {
    term.writeLines(['ssh: cannot open a session to the current node'], 'error')
    return
  }
  dmPeer.value = member
  currentSeq.value = 0
  const lines = [
    `[INFO] opening private session with ${member.nickname}@${member.node} ...`,
  ]
  try {
    const page = await fetchDirectHistory(member.userId, { limit: 20 })
    lines.push(...renderHistory(page.messages, `dm/${member.nickname}`))
    markCurrentRead()
  } catch (error) {
    if (handleAuthError(error)) return
    lines.push('[WARN] 私聊历史暂不可用')
  }
  lines.push('[INFO] 使用 exit 结束私聊会话')
  void refreshUnread()
  term.writeLines(lines, 'link')
}

async function searchMessages(keyword: string, term: TerminalApi) {
  term.writeLines([`[INFO] grep -F "${keyword}"`], 'dim')
  try {
    const messages = dmPeer.value
      ? await searchDirect(dmPeer.value.userId, keyword, 50)
      : await searchGroup(currentGroupId.value, keyword, 50)
    for (const message of messages) rememberMessage(message)
    term.writeLines(formatSearchResults(keyword, messages), 'message')
  } catch (error) {
    if (handleAuthError(error)) return
    term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
  }
}

async function recall(messageId: string, term: TerminalApi) {
  const normalized = messageId.replace(/^#/, '')
  const fullId = shortIds.get(normalized) ?? (normalized.length === 36 ? normalized : null)
  if (!fullId) {
    term.writeLines([`recall: unknown message id: ${messageId}`], 'error')
    return
  }
  const sent = socket?.sendRecall(fullId)
  if (!sent) {
    try {
      await recallMessage(fullId)
    } catch (error) {
      if (handleAuthError(error)) return
      term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
      return
    }
  }
  term.writeLines([`[INFO] recall requested for #${shortId(fullId)}`], 'dim')
}

function sendAscii(name: string, term: TerminalApi) {
  const art = findAsciiArt(name)
  if (!art) {
    term.writeLines([`cat: ${name}: No such file or directory`], 'error')
    return
  }
  sendChat(art.content, 'ascii', term)
}

async function onCommand(raw: string) {
  const term = terminalRef.value
  if (!term) return
  const command = parseCommand(raw)
  try {
    switch (command.type) {
      case 'empty':
        break
      case 'ls':
        if (groups.value.length === 0) {
          try {
            groups.value = await fetchGroups()
          } catch {
            // ignore
          }
        }
        term.writeLines(formatGroupListing(groups.value), 'message')
        break
      case 'cd':
        await switchGroup(command.groupId, term)
        break
      case 'echo':
        if (!command.content) {
          term.writeLines(['echo: 消息内容为空'], 'error')
        } else {
          sendChat(command.content, 'text', term)
        }
        break
      case 'tail':
        await tail(command.lines, term)
        break
      case 'ps':
        await showMembers(term)
        break
      case 'who':
        await showOnline(term)
        break
      case 'grep':
        await searchMessages(command.keyword, term)
        break
      case 'recall':
        await recall(command.messageId, term)
        break
      case 'ssh':
        await openDm(command.target, term)
        break
      case 'cat':
        sendAscii(command.name, term)
        break
      case 'pwd':
        term.writeLines([dmPeer.value ? '/home/dev' : `/opt/chat/group/${currentGroupId.value}`])
        break
      case 'clear':
        term.clearScreen()
        break
      case 'help':
        term.writeLines(helpLines(), 'info')
        break
      case 'exit':
        if (dmPeer.value) {
          dmPeer.value = null
          currentSeq.value = 0
          void resyncCurrentGroup()
          void refreshUnread()
          term.writeLines(['[INFO] closed private session'], 'info')
        } else {
          term.writeLines(['[INFO] active group session is persistent'], 'dim')
        }
        break
      case 'message':
        sendChat(command.content, 'text', term)
        break
      case 'invalid':
        term.writeLines([command.message], 'error')
        break
    }
  } catch (error) {
    if (!handleAuthError(error)) {
      term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
    }
  } finally {
    term.endCommand()
  }
}

function submitSide(value: string) {
  terminalRef.value?.submitExternal(value)
}

function toggleSide() {
  sideOpen.value = !sideOpen.value
}

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
})
</script>

<template>
  <div class="chat-view">
    <div class="chat-main">
      <div class="chat-toolbar">
        <span class="chat-toolbar__session">session: {{ sessionLabel }}</span>
        <span class="chat-conn" :class="`chat-conn--${status}`">
          <i class="dot" />
          {{ statusLabel }}
        </span>
        <span v-if="totalUnread > 0" class="chat-unread">UNREAD {{ totalUnread }}</span>
        <span class="chat-toolbar__spacer" />
        <button class="chat-tool" @click="toggleSide">
          <AppIcon name="menu" :size="12" />
          会话
        </button>
        <button class="chat-tool" @click="submitSide('clear')">
          <AppIcon name="refresh" :size="12" />
          清屏
        </button>
      </div>
      <div class="chat-terminal">
        <TerminalPane
          ref="terminalRef"
          :prompt="prompt"
          :banner="banner"
          @command="onCommand"
        />
      </div>
    </div>

    <aside v-if="sideOpen" class="chat-side">
      <div class="chat-side__head">
        <span>会话组</span>
        <span>{{ groups.length }}</span>
      </div>
      <button
        v-for="group in groups"
        :key="group.id"
        class="chat-side__row"
        :class="{ 'is-active': !dmPeer && group.id === currentGroupId }"
        @click="submitSide(`cd ${group.id}`)"
      >
        <AppIcon name="folder" :size="13" />
        <span>{{ group.id }}</span>
        <em>{{ group.onlineCount }} online</em>
        <b v-if="group.unread" class="chat-badge">{{ group.unread > 99 ? '99+' : group.unread }}</b>
      </button>
      <div v-if="groups.length === 0" class="chat-side__empty">索引暂不可用</div>

      <div class="chat-side__head">
        <span>在线节点</span>
        <span>{{ online.length }}</span>
      </div>
      <button
        v-for="member in online"
        :key="member.userId"
        class="chat-side__row"
        :class="{ 'is-active': dmPeer?.userId === member.userId }"
        @click="submitSide(`ssh ${member.nickname}`)"
      >
        <i class="dot dot--ok" />
        <span>{{ member.nickname }}<template v-if="member.userId === selfUserId"> (you)</template></span>
        <em>{{ member.node }}</em>
      </button>
      <div v-if="online.length === 0" class="chat-side__empty">没有在线节点</div>

      <template v-if="dmUnreadEntries.length">
        <div class="chat-side__head">
          <span>私聊未读</span>
          <span>{{ dmUnreadEntries.length }}</span>
        </div>
        <button
          v-for="entry in dmUnreadEntries"
          :key="entry.userId"
          class="chat-side__row chat-side__row--unread"
          @click="submitSide(`ssh ${entry.nickname}`)"
        >
          <AppIcon name="file" :size="13" />
          <span>{{ entry.nickname }}</span>
          <b class="chat-badge">{{ entry.count > 99 ? '99+' : entry.count }}</b>
        </button>
      </template>

      <div class="chat-side__head">
        <span>脚本</span>
        <span>{{ ASCII_ARTS.length }}</span>
      </div>
      <button
        v-for="art in ASCII_ARTS"
        :key="art.path"
        class="chat-side__row"
        @click="submitSide(`cat ${art.path}`)"
      >
        <AppIcon name="file" :size="13" />
        <span>{{ art.name }}</span>
      </button>

      <div class="chat-side__head">
        <span>快捷命令</span>
      </div>
      <div class="chat-side__hints">
        <button @click="submitSide('tail -n 50 chat.log')">最近 50 条</button>
        <button @click="submitSide('ps aux | grep dev')">ps</button>
        <button @click="submitSide('who')">who</button>
        <button @click="submitSide('help')">help</button>
      </div>

      <div class="chat-side__foot">
        {{ identity.state.nickname }}@{{ identity.nodeName }}<br />
        uid={{ selfUserId.slice(0, 8) }} · sshd 8.9
        <template v-if="readyUser"><br />ticket session · {{ readyUser.node }}</template>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  height: 100%;
  min-height: 0;
  background: #0c0c0c;
}

.chat-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  height: 30px;
  padding: 0 12px;
  border-bottom: 1px solid var(--fm-border);
  background: var(--fm-panel);
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 10.5px;
}

.chat-toolbar__session {
  overflow: hidden;
  color: var(--fm-accent);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-toolbar__spacer {
  flex: 1;
}

.chat-conn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chat-conn i {
  background: currentColor;
}

.chat-conn--online {
  color: var(--fm-ok);
}

.chat-conn--connecting,
.chat-conn--reconnecting {
  color: var(--fm-warn);
}

.chat-conn--offline {
  color: var(--fm-err);
}

.chat-unread {
  padding: 1px 6px;
  border: 1px solid var(--fm-warn);
  border-radius: 2px;
  color: var(--fm-warn);
  font-size: 8.5px;
  letter-spacing: 0.08em;
}

.chat-tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 10px;
  cursor: pointer;
}

.chat-tool:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.chat-terminal {
  flex: 1;
  min-height: 0;
}

.chat-side {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 244px;
  padding: 6px 10px 10px;
  border-left: 1px solid var(--fm-border);
  background: var(--fm-panel);
  overflow-y: auto;
}

.chat-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 4px 5px;
  color: var(--fm-text-muted);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.chat-side__row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.chat-side__row:hover {
  background: var(--fm-hover);
  color: var(--fm-text);
}

.chat-side__row.is-active {
  background: var(--fm-active);
  color: var(--fm-text);
}

.chat-side__row--unread {
  color: var(--fm-text);
}

.chat-side__row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-side__row em {
  flex: none;
  margin-left: auto;
  color: var(--fm-text-muted);
  font-size: 8.5px;
  font-style: normal;
}

.chat-badge {
  flex: none;
  min-width: 16px;
  margin-left: auto;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--fm-warn);
  color: #0c0c0c;
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}

.chat-side__row em + .chat-badge {
  margin-left: 4px;
}

.chat-side__empty {
  padding: 5px 8px;
  color: var(--fm-text-muted);
  font-size: 10px;
}

.chat-side__hints {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 4px;
}

.chat-side__hints button {
  padding: 3px 7px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-family: var(--fm-mono);
  font-size: 9px;
  cursor: pointer;
}

.chat-side__hints button:hover {
  border-color: var(--fm-accent);
  color: var(--fm-accent);
}

.chat-side__foot {
  margin-top: auto;
  padding: 12px 4px 2px;
  border-top: 1px solid var(--fm-border);
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 9px;
  line-height: 1.7;
}

@media (max-width: 900px) {
  .chat-side {
    width: 200px;
  }
}
</style>
