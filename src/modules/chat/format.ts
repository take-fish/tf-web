import type { ChatGroup, ChatMessage, OnlineMember } from '@/types/chat'

// 这里必须匹配控制字符本身（终端注入防护），规则按设计豁免。
// 用转义写法而不是裸控制字符：后者会让 git/编辑器把整个文件当成二进制。
const UNSAFE_CONTROL =
  // oxlint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g

/**
 * 双重防护：后端已清理控制字符，前端写入 xterm 前再清理一次，避免 ANSI 注入。
 */
export function sanitizeTerminalText(value: string): string {
  return value.replace(UNSAFE_CONTROL, '')
}

export function shortId(value: string): string {
  return value.slice(0, 6)
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function scopeOf(message: ChatMessage): string {
  return message.groupId ?? 'dm'
}

function bodyLines(message: ChatMessage, prefix: string): string[] {
  if (message.recalled) return [`${prefix} 该消息已撤回`]
  // 群聊图片内容是 data URL，私聊图片内容是 imageId，都不能直接写进终端。
  if (message.kind === 'image') {
    return [`${prefix} [图片] #${shortId(message.id)}`]
  }
  const content = sanitizeTerminalText(message.content)
  if (message.kind === 'ascii') {
    return [prefix, ...content.split('\n').map((line) => `    ${line}`)]
  }
  return [`${prefix} ${content}`]
}

export function formatMessageLines(message: ChatMessage, continued = false): string[] {
  // 智能助手的流式回答：后续片段不再重复消息头，直接缩进接在上一条下面。
  if (continued && !message.recalled && message.kind === 'text') {
    return bodyLines(message, ' ')
  }
  const header =
    `[${clock(message.ts)}] [INFO] [${scopeOf(message)}] [#${shortId(message.id)}] ` +
    `${sanitizeTerminalText(message.fromNickname)}@${message.fromNode}:`
  if (message.kind === 'ascii' && !message.recalled) {
    return [header + ' broadcast ascii payload', ...bodyLines(message, '    ')]
  }
  return bodyLines(message, header)
}

export function formatDmLines(message: ChatMessage, continued = false): string[] {
  if (continued && !message.recalled && message.kind === 'text') {
    return bodyLines(message, ' ')
  }
  const header =
    `[${clock(message.ts)}] [DM] [#${shortId(message.id)}] ` +
    `${sanitizeTerminalText(message.fromNickname)}@${message.fromNode} -> ` +
    `${message.toUserId ?? 'node'}:`
  if (message.kind === 'ascii' && !message.recalled) {
    return [header, ...bodyLines(message, '    ')]
  }
  return bodyLines(message, header)
}

export function formatGroupListing(groups: ChatGroup[]): string[] {
  const lines = [`total ${groups.length}`]
  for (const group of groups) {
    const unread = group.unread > 0 ? `, ${group.unread} unread` : ''
    lines.push(
      `drwxr-xr-x  3 dev dev 4096 Oct 18 16:02 ${group.id.padEnd(14)}` +
        ` ${group.name} (${group.onlineCount} online${unread})`,
    )
  }
  return lines
}

export function formatSearchResults(keyword: string, messages: ChatMessage[]): string[] {
  const lines = [
    `[INFO] grep -F "${sanitizeTerminalText(keyword)}" => ${messages.length} match(es)`,
  ]
  for (const message of messages) {
    lines.push(...formatMessageLines(message).map((line) => `  ${line}`))
  }
  if (messages.length === 0) lines.push('  （没有匹配的消息）')
  return lines
}

export function formatOnlineTable(members: OnlineMember[], selfUserId?: string): string[] {
  const lines = [`[INFO] who: ${members.length} node(s) online`]
  if (members.length === 0) {
    lines.push('（当前没有在线节点）')
    return lines
  }
  lines.push('USER       NODE          UID       STATUS')
  for (const member of members) {
    lines.push(
      `${sanitizeTerminalText(member.nickname).slice(0, 9).padEnd(10)} ` +
        `${member.node.padEnd(13)} ${member.userId.padEnd(9)} ` +
        `${member.userId === selfUserId ? 'online (you)' : 'online'}`,
    )
  }
  return lines
}

export function formatMemberTable(members: OnlineMember[]): string[] {
  const lines = ['USER       PID   %CPU %MEM  ELAPSED  COMMAND']
  members.forEach((member, index) => {
    lines.push(
      `${member.nickname.slice(0, 9).padEnd(10)} ` +
        `${String(3001 + index).padEnd(5)} ` +
        `0.${(index + 3) % 9} 1.${(index + 2) % 9}   ` +
        `00:${String(12 + index).padStart(2, '0')}    ` +
        `dev-agent --node=${member.node}`,
    )
  })
  if (members.length === 0) {
    lines.push('（当前会话组没有在线进程）')
  }
  return lines
}

export function formatHistoryHeader(target: string): string {
  return `==> ${target} <==`
}

export function helpLines(): string[] {
  return [
    'FishMatrix Shell 命令说明：',
    '  直接输入内容并回车                 发送消息到当前群组 / 私聊',
    '  @<助手名> <问题>                  呼叫智能助手（名字见 Agent 试衣间）',
    '  先发图再 @<助手名>                 助手识别图中文字（约 2 分钟内有效）',
    '  cd <group>                        切换 / 连接群组',
    '  ssh <昵称>[@节点]                  连接私聊，exit 退出',
    '  ls                                查看群组与未读',
    '  tail -n 50 chat.log               查看私聊历史（群聊不保存）',
    '  grep "<keyword>"                  搜索私聊历史（群聊不保存）',
    '  recall <#short-id>                撤回私聊中自己 2 分钟内的消息',
    '  ps / who                          群内在线 / 全局在线',
    '  cat ascii/funny.cat               广播 ASCII 脚本',
    '  工具栏“图片”                       发送图片（私聊持久化，群聊仅实时）',
    '  pwd / clear / help                路径 / 清屏 / 帮助',
  ]
}
