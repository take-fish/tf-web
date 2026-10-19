<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useIdentityStore } from '@/stores/identity'
import { useSkinStore } from '@/stores/skin'
import { ASCII_ARTS, findAsciiArt } from '@/modules/chat/asciiArt'
import { fetchDirectHistory, fetchGroupHistory, fetchGroups, fetchMembers } from '@/modules/chat/chatApi'
import { ChatSocketClient } from '@/modules/chat/chatSocket'
import { parseCommand } from '@/modules/chat/commands'
import {
  formatBytes,
  formatDmLines,
  formatGroupListing,
  formatHistoryHeader,
  formatMemberTable,
  formatMessageLines,
  helpLines,
} from '@/modules/chat/format'
import type { ChatGroup, ChatMessage, ChatStatus, OnlineMember } from '@/modules/chat/types'
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

const identity = useIdentityStore()
const skinStore = useSkinStore()
const terminalRef = ref<TerminalApi | null>(null)
const groups = ref<ChatGroup[]>([])
const members = ref<OnlineMember[]>([])
const status = ref<ChatStatus>('connecting')
const currentGroupId = ref('dev-group')
const dmPeer = ref<OnlineMember | null>(null)
const follow = ref(false)
const sideOpen = ref(skinStore.effectiveSkin !== 'terminal')
let socket: ChatSocketClient | null = null

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
  '输入 help 查看命令说明。',
]

const sessionLabel = computed(() =>
  dmPeer.value
    ? `ssh ${dmPeer.value.nickname}@${dmPeer.value.node}`
    : `/opt/chat/group/${currentGroupId.value}`,
)

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败'
}

function dmLines(message: ChatMessage): string[] {
  if (message.fromUserId !== identity.state.userId) return formatDmLines(message)
  const time = new Date(message.ts).toLocaleTimeString('zh-CN', { hour12: false })
  const target = dmPeer.value?.nickname ?? message.toUserId ?? 'peer'
  return [`[${time}] [DM] -> ${target}: ${message.content}`]
}

function onStatus(next: ChatStatus) {
  status.value = next
}

function onPresence(groupId: string, list: OnlineMember[]) {
  if (groupId === currentGroupId.value) {
    members.value = list
  }
}

function onMessage(message: ChatMessage) {
  if (dmPeer.value || message.groupId !== currentGroupId.value) return
  const isSelf = message.fromUserId === identity.state.userId
  if (!follow.value && !isSelf) return
  terminalRef.value?.writeLiveLines(formatMessageLines(message), 'message')
}

function onDm(message: ChatMessage) {
  const peerId = message.fromUserId === identity.state.userId
    ? message.toUserId
    : message.fromUserId
  if (dmPeer.value && peerId === dmPeer.value.userId) {
    terminalRef.value?.writeLiveLines(dmLines(message), 'message')
    return
  }
  if (message.fromUserId === identity.state.userId) return
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
  for (const message of messages) lines.push(...dmLines(message))
  terminalRef.value?.writeLiveLines(lines, 'info')
}

function onSocketError(message: string) {
  terminalRef.value?.writeLiveLines([`[ERROR] ${message}`], 'error')
}

async function bootstrap() {
  const term = terminalRef.value
  const lines: string[] = []
  try {
    groups.value = await fetchGroups()
  } catch {
    lines.push('[WARN] 会话索引同步失败，请检查网关连接。')
  }
  const preferred = groups.value.find((group) => group.id === 'dev-group') ?? groups.value[0]
  if (preferred) currentGroupId.value = preferred.id
  socket?.join(currentGroupId.value)
  lines.push(`[INFO] session index loaded: ${groups.value.length} groups`)
  lines.push(`[INFO] joined /opt/chat/group/${currentGroupId.value}`)
  try {
    const history = await fetchGroupHistory(currentGroupId.value, 12)
    members.value = await fetchMembers(currentGroupId.value)
    if (history.length) {
      lines.push(formatHistoryHeader(`/opt/chat/group/${currentGroupId.value}/chat.log`))
      for (const message of history) lines.push(...formatMessageLines(message))
    } else {
      lines.push('[INFO] chat.log is empty')
    }
  } catch {
    lines.push('[WARN] 会话历史暂不可用')
  }
  term?.writeLiveLines(lines, 'info')
}

async function switchGroup(groupId: string, term: TerminalApi) {
  if (!groups.value.some((group) => group.id === groupId)) {
    term.writeLines([`cd: no such file or directory: /opt/chat/group/${groupId}`], 'error')
    return
  }
  dmPeer.value = null
  follow.value = false
  if (groupId === currentGroupId.value) {
    term.writeLines([`[INFO] already in /opt/chat/group/${groupId}`], 'dim')
    return
  }
  currentGroupId.value = groupId
  socket?.join(groupId)
  const lines = [`[INFO] switched to /opt/chat/group/${groupId}`]
  try {
    members.value = await fetchMembers(groupId)
    const history = await fetchGroupHistory(groupId, 10)
    if (history.length) {
      lines.push(formatHistoryHeader(`/opt/chat/group/${groupId}/chat.log`))
      for (const message of history) lines.push(...formatMessageLines(message))
    } else {
      lines.push('[INFO] chat.log is empty')
    }
  } catch {
    lines.push('[WARN] 会话历史加载失败')
  }
  term.writeLines(lines, 'message')
}

function sendChat(content: string, kind: 'text' | 'ascii', term: TerminalApi) {
  const sent = dmPeer.value
    ? socket?.sendDirectMessage(dmPeer.value.userId, content, kind)
    : socket?.sendGroupMessage(content, kind)
  if (!sent) {
    term.writeLines(['[ERROR] 消息通道未连接，消息未发送'], 'error')
    return
  }
  if (kind === 'text') {
    term.writeLines(
      [`[INFO] appended ${formatBytes(content)} bytes to ${dmPeer.value ? 'dm session' : 'chat.log'}`],
      'dim',
    )
  }
}

async function tail(followMode: boolean, lineCount: number, term: TerminalApi) {
  follow.value = followMode
  const lines: string[] = []
  try {
    if (dmPeer.value) {
      const history = await fetchDirectHistory(identity.state.userId, dmPeer.value.userId, lineCount)
      lines.push(formatHistoryHeader(`dm/${dmPeer.value.nickname}`))
      if (history.length) history.forEach((message) => lines.push(...dmLines(message)))
      else lines.push('[INFO] private session has no records')
    } else {
      const history = await fetchGroupHistory(currentGroupId.value, lineCount)
      lines.push(formatHistoryHeader(`/opt/chat/group/${currentGroupId.value}/chat.log`))
      if (history.length) history.forEach((message) => lines.push(...formatMessageLines(message)))
      else lines.push('[INFO] chat.log is empty')
    }
    if (followMode) {
      lines.push(`[INFO] following ${dmPeer.value ? 'dm session' : 'chat.log'} (Ctrl+C to stop)`)
    }
  } catch (error) {
    lines.push(`[ERROR] ${errorText(error)}`)
  }
  term.writeLines(lines, followMode ? 'ok' : 'message')
}

async function showMembers(term: TerminalApi) {
  term.writeLines(['[INFO] ps aux | grep dev'], 'dim')
  try {
    members.value = await fetchMembers(currentGroupId.value)
    term.writeLines(formatMemberTable(members.value), 'message')
  } catch (error) {
    term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
  }
}

async function openDm(target: string, term: TerminalApi) {
  const [name, node] = target.split('@')
  const find = () =>
    members.value.find(
      (member) =>
        (member.nickname === name || member.userId === name) &&
        (!node || member.node === node),
    )
  let member = find()
  if (!member) {
    try {
      members.value = await fetchMembers(currentGroupId.value)
      member = find()
    } catch {
      // ignore
    }
  }
  if (!member) {
    term.writeLines(
      [`ssh: Could not resolve hostname ${target}: Name or service not known`],
      'error',
    )
    return
  }
  if (member.userId === identity.state.userId) {
    term.writeLines(['ssh: cannot open a session to the current node'], 'error')
    return
  }
  dmPeer.value = member
  follow.value = false
  const lines = [
    `[INFO] opening private session with ${member.nickname}@${member.node} ...`,
  ]
  try {
    const history = await fetchDirectHistory(identity.state.userId, member.userId, 20)
    if (history.length) {
      lines.push(formatHistoryHeader(`dm/${member.nickname}`))
      for (const message of history) lines.push(...dmLines(message))
    } else {
      lines.push('[INFO] no previous private messages')
    }
  } catch {
    lines.push('[WARN] 私聊历史暂不可用')
  }
  lines.push('[INFO] 使用 exit 结束私聊会话')
  term.writeLines(lines, 'link')
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
        await tail(command.follow, command.lines, term)
        break
      case 'ps':
        await showMembers(term)
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
          term.writeLines(['[INFO] closed private session'], 'info')
        } else {
          term.writeLines(['[INFO] active group session is persistent'], 'dim')
        }
        break
      case 'unknown':
        term.writeLines([`-bash: ${command.raw}: command not found`], 'error')
        break
    }
  } catch (error) {
    term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
  } finally {
    term.endCommand()
  }
}

function onInterrupt() {
  follow.value = false
}

function submitSide(value: string) {
  terminalRef.value?.submitExternal(value)
}

function toggleSide() {
  sideOpen.value = !sideOpen.value
}

onMounted(() => {
  socket = new ChatSocketClient(identity.state.userId, identity.state.nickname, {
    onStatus,
    onPresence,
    onMessage,
    onDm,
    onOffline,
    onError: onSocketError,
  })
  socket.connect()
  void bootstrap()
})

onBeforeUnmount(() => {
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
        <span v-if="follow" class="chat-follow">FOLLOW</span>
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
          @interrupt="onInterrupt"
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
      </button>
      <div v-if="groups.length === 0" class="chat-side__empty">索引暂不可用</div>

      <div class="chat-side__head">
        <span>在线进程</span>
        <span>{{ members.length }}</span>
      </div>
      <button
        v-for="member in members"
        :key="member.userId"
        class="chat-side__row"
        :class="{ 'is-active': dmPeer?.userId === member.userId }"
        @click="submitSide(`ssh ${member.nickname}`)"
      >
        <i class="dot dot--ok" />
        <span>{{ member.nickname }}</span>
        <em>{{ member.node }}</em>
      </button>
      <div v-if="members.length === 0" class="chat-side__empty">没有在线进程</div>

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
        <button @click="submitSide('tail -f chat.log')">tail -f</button>
        <button @click="submitSide('ps aux | grep dev')">ps</button>
        <button @click="submitSide('help')">help</button>
      </div>

      <div class="chat-side__foot">
        {{ identity.state.nickname }}@{{ identity.nodeName }}<br />
        uid={{ identity.state.userId.slice(0, 8) }} · sshd 8.9
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

.chat-follow {
  padding: 1px 6px;
  border: 1px solid var(--fm-accent);
  border-radius: 2px;
  color: var(--fm-accent);
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
