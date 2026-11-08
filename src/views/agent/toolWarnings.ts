/**
 * 工具卡片文案与失败汇总：与后端 tool 事件（status / ok）保持一致。
 *
 * 工具失败（参数非法、服务不可达、无数据）时，正文仍可能给出看似完整的回答，
 * 因此需要在回答下方明确提示“部分工具未成功”，并允许用户重新提问。
 */

export interface ToolStateLike {
  name: string
  status: 'running' | 'done' | 'error'
  ok?: boolean
}

const TOOL_LABELS: Record<string, string> = {
  search_logs: '查日志',
  search_kb: '查知识库',
  check_health: '健康检查',
  query_view: '查数据库',
  query_pipeline: '查流水线',
  read_image: '读图片',
  restart_service: '重启服务',
  trigger_release: '触发发布',
}

/** 工具英文名转成用户能看懂的短标签；未知工具回退原名。 */
export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

/** 失败工具名，按首次出现顺序去重。 */
export function failedToolNames(tools: ToolStateLike[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const tool of tools) {
    if (tool.status !== 'error' && tool.ok !== false) continue
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    names.push(tool.name)
  }
  return names
}

/** 生成回答下方的失败提示；没有失败工具时返回 null。 */
export function buildToolWarning(tools: ToolStateLike[]): string | null {
  const names = failedToolNames(tools)
  if (!names.length) return null
  const detail = names.map((name) => `${toolLabel(name)}（${name}）`).join('、')
  return `本次有工具未成功：${detail}。上面的回答可能不完整，建议重新提问。`
}
