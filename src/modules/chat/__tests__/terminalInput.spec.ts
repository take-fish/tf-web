import { describe, expect, it } from 'vitest'

import {
  fitInput,
  graphemeWidth,
  removeLastGrapheme,
  sanitizePastedText,
  textCellWidth,
  visualRows,
} from '../terminalInput'

describe('terminal input graphemes', () => {
  it('按字素删除 CJK、组合字符与 emoji', () => {
    expect(removeLastGrapheme('abc')).toBe('ab')
    expect(removeLastGrapheme('你好')).toBe('你')
    expect(removeLastGrapheme('e\u0301')).toBe('')
    expect(removeLastGrapheme('a👨‍👩‍👧')).toBe('a')
    expect(removeLastGrapheme('🇨🇳')).toBe('')
  })

  it('按终端单元格计算宽度', () => {
    expect(graphemeWidth('a')).toBe(1)
    expect(graphemeWidth('你')).toBe(2)
    expect(graphemeWidth('👨‍👩‍👧')).toBe(2)
    expect(graphemeWidth('\u0301')).toBe(0)
    expect(textCellWidth('a你👨‍👩‍👧e\u0301')).toBe(1 + 2 + 2 + 1)
  })
})

describe('terminal input wrapping', () => {
  it('区分“刚好填满一行”和“需要换行”', () => {
    expect(visualRows('$ ', 'ab', 4)).toBe(1)
    expect(visualRows('$ ', 'abc', 4)).toBe(2)
    expect(visualRows('', 'abc', 3)).toBe(1)
    expect(visualRows('', 'abcd', 3)).toBe(2)
  })

  it('宽字符在行尾放不下时整字换行，并计入被浪费的格子', () => {
    // cols=3：a b 占两格，第一个“中”放不下换行，第二个“中”又要换行。
    expect(visualRows('', 'ab中中', 3)).toBe(3)
  })

  it('按行数和字符数裁剪输入，不拆开 emoji', () => {
    expect(fitInput('abc', '$ ', 4, 1, 10)).toBe('ab')
    expect(fitInput('abcdef', '', 80, 10, 3)).toBe('abc')
    expect(fitInput('😀😀', '', 80, 10, 2)).toBe('😀')
    expect(fitInput('ab中中', '', 3, 2, 10)).toBe('ab中')
  })
})

describe('pasted text sanitizing', () => {
  it('换行转空格并去掉控制字符', () => {
    expect(sanitizePastedText('a\r\nb')).toBe('a b')
    expect(sanitizePastedText('a\nb\n')).toBe('a b')
    expect(sanitizePastedText('a\tb')).toBe('a    b')
    expect(sanitizePastedText('x\u0000y\u0007z')).toBe('xyz')
  })

  it('去掉 ANSI/OSC 转义与 bidi 覆盖字符', () => {
    expect(sanitizePastedText('\x1b[31mred\x1b[0m')).toBe('red')
    expect(sanitizePastedText('\x1b]8;;https://example.com\u0007link\x1b]8;;\u0007')).toBe('link')
    expect(sanitizePastedText('a\u202Eb')).toBe('ab')
  })

  it('按上限截断且不拆 emoji', () => {
    expect(sanitizePastedText('abcdef', 3)).toBe('abc')
    expect(sanitizePastedText('😀😀', 2)).toBe('😀')
  })
})
