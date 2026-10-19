import type { ChatGroup, ChatMessage, OnlineMember } from './types'

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function scopeOf(message: ChatMessage): string {
  return message.groupId ?? 'dm'
}

export function formatMessageLines(message: ChatMessage): string[] {
  const header =
    `[${clock(message.ts)}] [INFO] [${scopeOf(message)}] ` +
    `${message.fromNickname}@${message.fromNode}:`
  if (message.kind === 'ascii') {
    const artLines = message.content.split('\n')
    return [header + ' broadcast ascii payload', ...artLines.map((line) => `    ${line}`)]
  }
  return [`${header} ${message.content}`]
}

export function formatDmLines(message: ChatMessage): string[] {
  const header =
    `[${clock(message.ts)}] [DM] ${message.fromNickname}@${message.fromNode} -> ` +
    `${message.toUserId ?? 'node'}:`
  if (message.kind === 'ascii') {
    return [header, ...message.content.split('\n').map((line) => `    ${line}`)]
  }
  return [`${header} ${message.content}`]
}

export function formatGroupListing(groups: ChatGroup[]): string[] {
  const lines = [`total ${groups.length}`]
  for (const group of groups) {
    lines.push(
      `drwxr-xr-x  3 dev dev 4096 Oct 18 16:02 ${group.id.padEnd(14)}` +
        ` ${group.name} (${group.onlineCount} online)`,
    )
  }
  return lines
}

export function formatMemberTable(members: OnlineMember[]): string[] {
  const lines = [
    'USER       PID   %CPU %MEM  ELAPSED  COMMAND',
  ]
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
    '  ls /opt/chat/group               列出可用会话组',
    '  cd <group>                       切换会话组',
    '  echo "<message>" >> chat.log     追加日志（发送消息）',
    '  tail -n 20 chat.log              读取最近日志',
    '  tail -f chat.log                 跟随实时日志（Ctrl+C 停止）',
    '  ps aux | grep dev                查看在线进程',
    '  ssh <nickname>[@node-xx]         建立私聊会话',
    '  cat ascii/funny.cat              广播 ASCII 脚本输出',
    '  pwd / clear / exit               路径 / 清屏 / 退出当前会话',
  ]
}

export function formatBytes(content: string): number {
  return new TextEncoder().encode(content).length
}
