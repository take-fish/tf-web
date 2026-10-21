// 终端行编辑的纯函数：按字素（grapheme）删除、按显示单元格宽度计算换行。
// 把这类逻辑独立出来，方便单元测试，也避免 xterm 的 \b \b 在 CJK/emoji 下留下残影。

const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u
const REGIONAL_INDICATOR_RE = /[\u{1F1E6}-\u{1F1FF}]/u
const KEYCAP_RE = /\u20E3/u
const ZERO_WIDTH_RE = /^[\p{Cc}\p{Cf}\p{Mn}\p{Me}]$/u

// 近似 xterm 的 East Asian Wide 判定；emoji 由 Extended_Pictographic 单独处理。
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
]

 
 
// oxlint-disable-next-line no-control-regex -- 需要匹配 OSC 转义序列
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
 
 
// oxlint-disable-next-line no-control-regex -- 需要匹配 ANSI 转义序列
const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
 
 
// oxlint-disable-next-line no-control-regex -- 需要过滤 C0/C1 控制字符
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g

export function splitGraphemes(text: string): string[] {
  if (!text) return []
  if (!segmenter) return Array.from(text)
  return Array.from(segmenter.segment(text), (part) => part.segment)
}

export function removeLastGrapheme(text: string): string {
  if (!text) return ''
  const parts = splitGraphemes(text)
  parts.pop()
  return parts.join('')
}

function isWideCodePoint(codePoint: number): boolean {
  return WIDE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)
}

export function graphemeWidth(grapheme: string): number {
  if (!grapheme) return 0
  // 一个 emoji 字素簇（含 ZWJ 组合、国旗、keycap）在终端里通常占 2 列。
  if (PICTOGRAPHIC_RE.test(grapheme) || REGIONAL_INDICATOR_RE.test(grapheme) || KEYCAP_RE.test(grapheme)) {
    return 2
  }
  let hasBase = false
  for (const char of grapheme) {
    const codePoint = char.codePointAt(0) ?? 0
    if (codePoint === 0 || ZERO_WIDTH_RE.test(char)) continue
    hasBase = true
    if (isWideCodePoint(codePoint)) return 2
  }
  return hasBase ? 1 : 0
}

export function textCellWidth(text: string): number {
  let width = 0
  for (const grapheme of splitGraphemes(text)) width += graphemeWidth(grapheme)
  return width
}

interface WrapState {
  rows: number
  col: number
}

// 模拟 xterm 的自动换行：宽字符在行尾放不下时会整字换行，留下空格子。
// 不能用 totalWidth / cols 直接四舍五入，否则 CJK/emoji 输入的重绘行数会算少。
function advanceWrap(state: WrapState, width: number, cols: number) {
  if (width <= 0) return
  if (state.col + width > cols) {
    state.rows += 1
    state.col = 0
  }
  state.col += width
}

export function visualRows(prompt: string, input: string, cols: number): number {
  if (cols <= 0) return 1
  const state: WrapState = { rows: 1, col: 0 }
  for (const grapheme of splitGraphemes(prompt + input)) {
    advanceWrap(state, graphemeWidth(grapheme), cols)
  }
  return state.rows
}

function truncateGraphemes(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  let result = ''
  for (const grapheme of splitGraphemes(text)) {
    if (result.length + grapheme.length > maxChars) break
    result += grapheme
  }
  return result
}

// 把输入裁剪到“不超过 maxRows 行 / maxChars 个 UTF-16 单元”，避免输入区高过终端视口后无法重绘。
export function fitInput(
  text: string,
  prompt: string,
  cols: number,
  maxRows: number,
  maxChars: number,
): string {
  const rowLimit = Math.max(1, maxRows)
  const charLimit = Math.max(0, maxChars)
  const state: WrapState = { rows: 1, col: 0 }
  if (cols > 0) {
    for (const grapheme of splitGraphemes(prompt)) {
      advanceWrap(state, graphemeWidth(grapheme), cols)
    }
  }
  let result = ''
  for (const grapheme of splitGraphemes(text)) {
    if (result.length + grapheme.length > charLimit) break
    if (cols > 0) {
      const nextState: WrapState = { ...state }
      advanceWrap(nextState, graphemeWidth(grapheme), cols)
      if (nextState.rows > rowLimit) break
      state.rows = nextState.rows
      state.col = nextState.col
    }
    result += grapheme
  }
  return result
}

// 粘贴文本不自动发送：换行转空格、去掉 ANSI/控制字符与 bidi 覆盖字符，避免终端注入。
export function sanitizePastedText(text: string, maxChars = 2000): string {
  const cleaned = text
    .replace(OSC_RE, '')
    .replace(ANSI_RE, '')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\t/g, '    ')
    .replace(CONTROL_RE, '')
    .replace(BIDI_RE, '')
    .trimEnd()
  return truncateGraphemes(cleaned, Math.max(0, maxChars))
}
