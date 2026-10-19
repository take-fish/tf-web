export type ChatCommand =
  | { type: 'empty' }
  | { type: 'ls' }
  | { type: 'cd'; groupId: string }
  | { type: 'echo'; content: string }
  | { type: 'tail'; follow: boolean; lines: number }
  | { type: 'ps' }
  | { type: 'ssh'; target: string }
  | { type: 'cat'; name: string }
  | { type: 'pwd' }
  | { type: 'clear' }
  | { type: 'help' }
  | { type: 'exit' }
  | { type: 'unknown'; raw: string }

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

  if (input === 'ls' || input.startsWith('ls ')) return { type: 'ls' }

  if (input.startsWith('cd')) {
    const target = input.slice(2).trim()
    if (!target) return { type: 'unknown', raw: input }
    const parts = target.split('/').filter(Boolean)
    return { type: 'cd', groupId: parts[parts.length - 1] ?? target }
  }

  if (input.startsWith('echo ')) {
    let rest = input.slice(5).trim()
    const redirect = />>\s*chat\.log\s*$/.exec(rest)
    if (redirect) {
      rest = rest.slice(0, redirect.index).trim()
    }
    return { type: 'echo', content: unquote(rest) }
  }

  if (input === 'tail' || input.startsWith('tail ')) {
    const match = /^tail(?:\s+(-f))?(?:\s+-n\s+(\d+))?(?:\s+chat\.log)?$/.exec(input)
    if (!match) {
      const follow = /^\s*tail\s+-f\b/.test(input)
      const lineMatch = /-n\s+(\d+)/.exec(input)
      return {
        type: 'tail',
        follow,
        lines: lineMatch ? Math.max(1, Math.min(200, Number(lineMatch[1]))) : 20,
      }
    }
    return {
      type: 'tail',
      follow: match[1] === '-f',
      lines: match[2] ? Math.max(1, Math.min(200, Number(match[2]))) : 20,
    }
  }

  if (input === 'ps' || input.startsWith('ps ')) return { type: 'ps' }

  if (input.startsWith('ssh ')) {
    const target = input.slice(4).trim().split(/\s+/)[0] ?? ''
    if (!target) return { type: 'unknown', raw: input }
    return { type: 'ssh', target }
  }

  if (input.startsWith('cat ')) {
    const name = input.slice(4).trim().split(/\s+/)[0] ?? ''
    if (!name) return { type: 'unknown', raw: input }
    return { type: 'cat', name }
  }

  return { type: 'unknown', raw: input }
}
