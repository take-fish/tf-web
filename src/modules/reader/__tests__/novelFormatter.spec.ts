import { describe, expect, it } from 'vitest'

import {
  READER_TEMPLATES,
  formatNovel,
  paragraphAtLine,
  paragraphStartLine,
  splitParagraphs,
  wrapDisplay,
} from '../lib/novelFormatter'

const CONTENT = [
  '晋太元中，武陵人捕鱼为业。缘溪行，忘路之远近。',
  '见渔人，乃大惊。渔人答曰：“不足为外人道也。”',
  '突然，远处传来一阵脚步声，众人皆惊。',
].join('\n\n')

function paragraphTextFromResult(
  result: ReturnType<typeof formatNovel>,
  paragraphIndex: number,
): string {
  let line = paragraphStartLine(result, paragraphIndex)
  let collected = ''
  while (line < result.lines.length && paragraphAtLine(result, line) === paragraphIndex) {
    const source = result.lines[line] ?? ''
    collected += source.replace(/^\s*(?:\/\/|#)\s*(?:\[[a-z]+\]\s*)?/, '')
    line += 1
  }
  return collected.replace(/\s+/g, '')
}

describe('splitParagraphs', () => {
  it('优先按空行分段', () => {
    expect(splitParagraphs('第一段\n\n第二段\n\n第三段')).toEqual(['第一段', '第二段', '第三段'])
  })

  it('没有空行时按行分段', () => {
    expect(splitParagraphs('第一段\n第二段')).toEqual(['第一段', '第二段'])
  })

  it('处理 BOM 与空内容', () => {
    expect(splitParagraphs('﻿第一段')).toEqual(['第一段'])
    expect(splitParagraphs('  ')).toEqual([])
  })
})

describe('wrapDisplay', () => {
  it('按显示宽度折行且不丢字符', () => {
    const text = '中文内容'.repeat(20)
    const lines = wrapDisplay(text, 20)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe(text)
    for (const line of lines) {
      expect(Array.from(line).length).toBeGreaterThan(0)
    }
  })
})

describe('formatNovel', () => {
  it.each(READER_TEMPLATES)('$id 模板保留全部正文且行映射有效', (template) => {
    const result = formatNovel('古文精选', '桃花源记', CONTENT, template.id)
    const paragraphs = splitParagraphs(CONTENT)

    expect(result.language).toBe(template.language)
    expect(result.paragraphStartLines).toHaveLength(paragraphs.length)
    expect(result.lineToParagraph).toHaveLength(result.lines.length)
    paragraphs.forEach((paragraph, index) => {
      expect(paragraphTextFromResult(result, index)).toBe(paragraph.replace(/\s+/g, ''))
      expect(paragraphStartLine(result, index)).toBeGreaterThanOrEqual(0)
    })
  })

  it('对话与转折段落带伪装标签', () => {
    const result = formatNovel('测试', '一章', CONTENT, 'springboot')
    const joined = result.lines.join('\n')
    expect(joined).toContain('[dialogue]')
    expect(joined).toContain('[branch]')
  })

  it('空内容只生成代码骨架', () => {
    const result = formatNovel('空书', '空章', '', 'python')
    expect(result.paragraphStartLines).toHaveLength(0)
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.lineToParagraph.every((value) => value === -1)).toBe(true)
  })

  it('特殊字符不会破坏生成结果', () => {
    const result = formatNovel('测试', '一章', '路径 // 不是注释\n引号 “测试”', 'go')
    expect(result.paragraphStartLines).toHaveLength(2)
    expect(paragraphAtLine(result, paragraphStartLine(result, 0))).toBe(0)
  })
})
