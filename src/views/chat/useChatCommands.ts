import type { Ref } from 'vue'

import { findAsciiArt } from '@/modules/chat/asciiArt'
import {
  fetchDirectHistory,
  fetchGroups,
  fetchMembers,
  fetchOnline,
  recallMessage,
  searchDirect,
} from '@/modules/chat/chatApi'
import type { ChatSocketClient } from '@/modules/chat/chatSocket'
import { parseCommand } from '@/modules/chat/commands'
import {
  formatGroupListing,
  formatMemberTable,
  formatOnlineTable,
  formatSearchResults,
  helpLines,
  shortId,
} from '@/modules/chat/format'
import type { ChatGroup, ChatMessage, OnlineMember } from '@/types/chat'

import type { TerminalApi } from './types'

interface ChatStoreLike {
  setGroup(groupId: string): void
}

interface ChatCommandsOptions {
  terminalRef: Ref<TerminalApi | null>
  groups: Ref<ChatGroup[]>
  members: Ref<OnlineMember[]>
  online: Ref<OnlineMember[]>
  dmPeer: Ref<OnlineMember | null>
  currentGroupId: Ref<string>
  currentSeq: Ref<number>
  selfUserId: Ref<string>
  chatStore: ChatStoreLike
  getSocket: () => ChatSocketClient | null
  refreshUnread: () => Promise<void>
  renderHistory: (messages: ChatMessage[], target: string) => string[]
  markCurrentRead: () => void
  clearGallery: () => void
  rememberMessage: (message: ChatMessage) => boolean
  shortIds: Map<string, string>
  handleAuthError: (error: unknown) => boolean
  errorText: (error: unknown) => string
}

export function useChatCommands(options: ChatCommandsOptions) {
  const {
    terminalRef,
    groups,
    members,
    online,
    dmPeer,
    currentGroupId,
    currentSeq,
    selfUserId,
    chatStore,
    getSocket,
    refreshUnread,
    renderHistory,
    markCurrentRead,
    clearGallery,
    rememberMessage,
    shortIds,
    handleAuthError,
    errorText,
  } = options

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
    chatStore.setGroup(groupId)
    currentSeq.value = 0
    clearGallery()
    getSocket()?.join(groupId)
    const lines = [
      `[INFO] switched to /opt/chat/group/${groupId}`,
      '[INFO] 群聊为临时会话，不保留历史消息',
    ]
    try {
      members.value = await fetchMembers(groupId)
    } catch (error) {
      if (handleAuthError(error)) return
      lines.push('[WARN] 会话成员加载失败')
    }
    void refreshUnread()
    term.writeLines(lines, 'message')
  }

  function sendChat(content: string, kind: 'text' | 'ascii', term: TerminalApi) {
    const sent = dmPeer.value
      ? getSocket()?.sendDirectMessage(dmPeer.value.userId, content, kind)
      : getSocket()?.sendGroupMessage(content, kind)
    if (!sent) {
      term.writeLines(['[ERROR] 消息通道未连接，消息未发送'], 'error')
    }
  }

  async function tail(lineCount: number, term: TerminalApi) {
    if (!dmPeer.value) {
      term.writeLines(
        ['[INFO] 群聊为临时会话，不保存历史；私聊会话中可使用 tail 查看历史'],
        'warn',
      )
      return
    }
    const lines: string[] = []
    try {
      const page = await fetchDirectHistory(dmPeer.value.userId, { limit: lineCount })
      lines.push(...renderHistory(page.messages, `dm/${dmPeer.value.nickname}`))
      markCurrentRead()
    } catch (error) {
      if (handleAuthError(error)) return
      lines.push(`[ERROR] ${errorText(error)}`)
    }
    term.writeLines(lines, 'message')
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
    clearGallery()
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
    if (!dmPeer.value) {
      term.writeLines(
        ['[INFO] 群聊为临时会话，不保存消息，无法搜索；请在私聊会话中使用 grep'],
        'warn',
      )
      return
    }
    term.writeLines([`[INFO] grep -F "${keyword}"`], 'dim')
    try {
      const messages = await searchDirect(dmPeer.value.userId, keyword, 50)
      for (const message of messages) rememberMessage(message)
      term.writeLines(formatSearchResults(keyword, messages), 'message')
    } catch (error) {
      if (handleAuthError(error)) return
      term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
    }
  }

  async function recall(messageId: string, term: TerminalApi) {
    if (!dmPeer.value) {
      term.writeLines(['[INFO] 群聊为临时会话，不支持撤回'], 'warn')
      return
    }
    const normalized = messageId.replace(/^#/, '')
    const fullId = shortIds.get(normalized) ?? (normalized.length === 36 ? normalized : null)
    if (!fullId) {
      term.writeLines([`recall: unknown message id: ${messageId}`], 'error')
      return
    }
    const sent = getSocket()?.sendRecall(fullId)
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
            clearGallery()
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

  return {
    onCommand,
  }
}
