import { describe, expect, it } from 'vitest'

import { buildToolWarning, failedToolNames, toolLabel } from '../toolWarnings'

describe('toolLabel', () => {
  it('把常见工具名翻译成短标签', () => {
    expect(toolLabel('search_logs')).toBe('查日志')
    expect(toolLabel('search_kb')).toBe('查知识库')
    expect(toolLabel('check_health')).toBe('健康检查')
  })

  it('未知工具回退原名', () => {
    expect(toolLabel('unknown_tool')).toBe('unknown_tool')
  })
})

describe('failedToolNames', () => {
  it('包含 error 与 ok=false 的工具，并去重', () => {
    expect(
      failedToolNames([
        { name: 'search_kb', status: 'done', ok: true },
        { name: 'search_logs', status: 'error' },
        { name: 'search_logs', status: 'error' },
        { name: 'check_health', status: 'done', ok: false },
      ]),
    ).toEqual(['search_logs', 'check_health'])
  })

  it('全部成功时返回空数组', () => {
    expect(failedToolNames([{ name: 'search_kb', status: 'done', ok: true }])).toEqual([])
  })
})

describe('buildToolWarning', () => {
  it('没有失败工具时返回 null', () => {
    expect(buildToolWarning([{ name: 'search_kb', status: 'done', ok: true }])).toBeNull()
  })

  it('有失败工具时包含中文标签、英文名和建议动作', () => {
    const warning = buildToolWarning([{ name: 'search_logs', status: 'error' }])
    expect(warning).toContain('查日志（search_logs）')
    expect(warning).toContain('重新提问')
  })
})
