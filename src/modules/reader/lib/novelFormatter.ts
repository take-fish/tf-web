export type ReaderTemplateId = 'springboot' | 'react' | 'python' | 'go' | 'cpp'

export interface FormatResult {
  lines: string[]
  paragraphStartLines: number[]
  lineToParagraph: number[]
  language: string
}

export const READER_TEMPLATES: ReadonlyArray<{
  id: ReaderTemplateId
  label: string
  language: string
}> = [
  { id: 'springboot', label: 'SpringBoot 业务层', language: 'java' },
  { id: 'react', label: 'React 组件', language: 'javascript' },
  { id: 'python', label: 'Python 脚本', language: 'python' },
  { id: 'go', label: 'Go 接口', language: 'go' },
  { id: 'cpp', label: 'C++ 算法', language: 'cpp' },
]

const DIALOGUE_PATTERN = /[“”「」『』]|：/
const TWIST_PATTERN = /突然|忽然|但是|然而|却|不料/

export function splitParagraphs(content: string): string[] {
  const normalized = content
    .replace(/\r\n?/g, '\n')
    .replace(/^﻿/, '')
    .trim()
  if (!normalized) return []

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  if (blocks.length > 1) return blocks

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function displayWidth(codePoint: number): number {
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) {
    return 2
  }
  return 1
}

export function wrapDisplay(text: string, width = 72): string[] {
  const normalized = text.replace(/\t/g, '  ')
  const lines: string[] = []
  let current = ''
  let used = 0
  for (const char of Array.from(normalized)) {
    const codePoint = char.codePointAt(0) ?? 0
    const charWidth = displayWidth(codePoint)
    if (used + charWidth > width && current) {
      lines.push(current)
      current = ''
      used = 0
    }
    current += char
    used += charWidth
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function hashSuffix(value: string): string {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return String((hash % 900) + 100)
}

function paragraphTag(paragraph: string): string {
  if (DIALOGUE_PATTERN.test(paragraph)) return '[dialogue]'
  if (TWIST_PATTERN.test(paragraph)) return '[branch]'
  return ''
}

interface TemplateSpec {
  language: string
  comment: string
  head: (title: string, chapterTitle: string, suffix: string, count: number) => string[]
  paragraphIndent: string
  marker: (index: number, indent: string) => string
  tail: (count: number) => string[]
}

const TEMPLATE_SPECS: Record<ReaderTemplateId, TemplateSpec> = {
  springboot: {
    language: 'java',
    comment: '//',
    paragraphIndent: '        ',
    head: (title, chapterTitle, suffix, count) => [
      'package com.fishmatrix.review;',
      '',
      `// ${chapterTitle}`,
      `// Dataset: ${title}`,
      `public final class ReviewService${suffix} {`,
      '',
      `    private static final int PARAGRAPH_COUNT = ${count};`,
      '',
      '    public static void main(String[] args) {',
      '        System.out.println("loading review dataset...");',
    ],
    marker: (index) => `        checkParagraph(${index + 1});`,
    tail: (count) => [
      `        System.out.printf("review complete: %d paragraphs%n", PARAGRAPH_COUNT);`,
      '    }',
      '',
      '    private static void checkParagraph(int index) {',
      '        // metrics hook for paragraph index',
      '    }',
      '}',
      '',
      `// generated paragraphs: ${count}`,
    ],
  },
  react: {
    language: 'javascript',
    comment: '//',
    paragraphIndent: '  ',
    head: (title, chapterTitle) => [
      "import { useEffect } from 'react'",
      '',
      `// ${chapterTitle}`,
      `// Dataset: ${title}`,
      'const PARAGRAPHS = [',
    ],
    marker: (index) => `  // checkpoint ${index + 1}`,
    tail: () => [
      ']',
      '',
      'export default function ReviewPanel() {',
      '  useEffect(() => {',
      '    console.info(`review dataset: ${PARAGRAPHS.length} blocks`)',
      '  }, [])',
      '',
      '  return null',
      '}',
    ],
  },
  python: {
    language: 'python',
    comment: '#',
    paragraphIndent: '    ',
    head: (title, chapterTitle) => [
      `# ${chapterTitle}`,
      `# Dataset: ${title}`,
      'PARAGRAPHS = [',
    ],
    marker: (index) => `    # segment ${index + 1}`,
    tail: () => [
      ']',
      '',
      '',
      'def load_dataset():',
      '    for index, block in enumerate(PARAGRAPHS):',
      '        yield index, block',
      '',
      '',
      'if __name__ == "__main__":',
      '    print("review dataset loaded")',
    ],
  },
  go: {
    language: 'go',
    comment: '//',
    paragraphIndent: '    ',
    head: (title, chapterTitle) => [
      'package main',
      '',
      `// ${chapterTitle}`,
      `// Dataset: ${title}`,
      '',
      'func main() {',
    ],
    marker: (index) => `    checkParagraph(${index + 1})`,
    tail: () => [
      '    println("review complete")',
      '}',
      '',
      'func checkParagraph(index int) {',
      '    _ = index',
      '}',
    ],
  },
  cpp: {
    language: 'cpp',
    comment: '//',
    paragraphIndent: '    ',
    head: (title, chapterTitle) => [
      '#include <iostream>',
      '#include <vector>',
      '',
      `// ${chapterTitle}`,
      `// Dataset: ${title}`,
      '',
      'int main() {',
    ],
    marker: (index) => `    checkParagraph(${index + 1});`,
    tail: () => [
      '    std::cout << "review complete" << std::endl;',
      '    return 0;',
      '}',
    ],
  },
}

export function formatNovel(
  title: string,
  chapterTitle: string,
  content: string,
  template: ReaderTemplateId,
): FormatResult {
  const paragraphs = splitParagraphs(content)
  const spec = TEMPLATE_SPECS[template]
  const suffix = hashSuffix(`${title}|${chapterTitle}`)
  const lines = spec.head(title, chapterTitle, suffix, paragraphs.length)
  const lineToParagraph: number[] = lines.map(() => -1)
  const paragraphStartLines: number[] = []

  paragraphs.forEach((paragraph, index) => {
    const wrapped = wrapDisplay(paragraph)
    const tag = paragraphTag(paragraph)
    paragraphStartLines.push(lines.length)
    wrapped.forEach((text, lineIndex) => {
      const prefix = lineIndex === 0 && tag ? `${spec.comment} ${tag} ` : `${spec.comment} `
      lines.push(`${spec.paragraphIndent}${prefix}${text}`)
      lineToParagraph.push(index)
    })
    lines.push(spec.marker(index, spec.paragraphIndent))
    lineToParagraph.push(-1)
  })

  const tail = spec.tail(paragraphs.length)
  lines.push(...tail)
  lineToParagraph.push(...tail.map(() => -1))

  return {
    lines,
    paragraphStartLines,
    lineToParagraph,
    language: spec.language,
  }
}

export function paragraphAtLine(result: FormatResult, line: number): number {
  const value = result.lineToParagraph[line]
  return value === undefined ? -1 : value
}

export function paragraphStartLine(result: FormatResult, paragraphIndex: number): number {
  return result.paragraphStartLines[paragraphIndex] ?? 0
}
