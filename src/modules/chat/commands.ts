import { findAsciiArt } from './asciiArt'

export type ChatCommand =
  | { type: 'empty' }
  | { type: 'ls' }
  | { type: 'cd'; groupId: string }
  | { type: 'echo'; content: string }
  | { type: 'tail'; lines: number }
  | { type: 'ps' }
  | { type: 'who' }
  | { type: 'grep'; keyword: string }
  | { type: 'recall'; messageId: string }
  | { type: 'ssh'; target: string }
  | { type: 'cat'; name: string }
  | { type: 'pwd' }
  | { type: 'clear' }
  | { type: 'help' }
  | { type: 'exit' }
  | { type: 'message'; content: string }
  | { type: 'invalid'; message: string }

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

export function parseCommand(raw: string): ChatCommand {
  const input = raw.trim()
  if (!input) return { type: 'empty' }

  if (input === 'pwd') return { type: 'pwd' }
  if (input === 'clear' || input === 'cls') return { type: 'clear' }
  if (input === 'help' || input === 'man chat') return { type: 'help' }
  if (input === 'exit' || input === 'logout') return { type: 'exit' }

  if (input === 'ls' || input === 'ls /opt/chat/group' || input === 'ls /opt/chat/group/') {
    return { type: 'ls' }
  }

  if (input === 'cd') return { type: 'invalid', message: 'cd: 缺少会话组，例如 cd dev-group' }
  if (input.startsWith('cd ')) {
    const target = input.slice(3).trim()
    const parts = target.split('/').filter(Boolean)
    if (!target || parts.length === 0) {
      return { type: 'invalid', message: 'cd: 缺少会话组，例如 cd dev-group' }
    }
    return { type: 'cd', groupId: parts[parts.length - 1] ?? target }
  }

  // 兼容旧用法：echo "<内容>" >> chat.log；现在普通文本回车就是发送。
  if (input === 'echo') return { type: 'invalid', message: 'echo: 消息内容为空' }
  if (input.startsWith('echo ')) {
    let rest = input.slice(5).trim()
    const redirect = />>\s*chat\.log\s*$/.exec(rest)
    if (redirect) {
      rest = rest.slice(0, redirect.index).trim()
    }
    return { type: 'echo', content: unquote(rest) }
  }

  if (input === 'tail' || input.startsWith('tail ')) {
    const match = /^tail(?:\s+-f)?(?:\s+-n\s+(\d+))?(?:\s+chat\.log)?$/.exec(input)
    if (!match) return { type: 'message', content: input }
    const lines = match[1] ? Math.max(1, Math.min(200, Number(match[1]))) : 20
    return { type: 'tail', lines }
  }

  if (input === 'ps' || /^ps\s+aux\b/.test(input)) return { type: 'ps' }
  if (input === 'who') return { type: 'who' }

  if (input === 'grep') return { type: 'invalid', message: 'grep: 缺少搜索关键字' }
  if (input.startsWith('grep ')) {
    const keyword = unquote(input.slice(5).trim())
    if (!keyword) return { type: 'invalid', message: 'grep: 缺少搜索关键字' }
    return { type: 'grep', keyword }
  }

  if (input === 'recall') return { type: 'invalid', message: 'recall: 缺少消息 ID' }
  if (input.startsWith('recall ')) {
    const messageId = input.slice(7).trim().split(/\s+/)[0] ?? ''
    if (!messageId) return { type: 'invalid', message: 'recall: 缺少消息 ID' }
    return { type: 'recall', messageId }
  }

  if (input === 'ssh') return { type: 'invalid', message: 'ssh: 缺少昵称或用户 ID' }
  if (input.startsWith('ssh ')) {
    const target = input.slice(4).trim().split(/\s+/)[0] ?? ''
    if (!target) return { type: 'invalid', message: 'ssh: 缺少昵称或用户 ID' }
    return { type: 'ssh', target }
  }

  if (input === 'cat') return { type: 'invalid', message: 'cat: 缺少脚本名' }
  if (input.startsWith('cat ')) {
    const name = input.slice(4).trim().split(/\s+/)[0] ?? ''
    if (!name) return { type: 'invalid', message: 'cat: 缺少脚本名' }
    if (!findAsciiArt(name)) return { type: 'message', content: input }
    return { type: 'cat', name }
  }

  // 其余内容一律视为聊天消息，直接回车发送。
  return { type: 'message', content: input }
}
