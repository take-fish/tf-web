import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/cpp/register.js'
import 'monaco-editor/languages/definitions/go/register.js'
import 'monaco-editor/languages/definitions/java/register.js'
import 'monaco-editor/languages/definitions/javascript/register.js'
import 'monaco-editor/languages/definitions/python/register.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

const workerScope = self as unknown as {
  MonacoEnvironment?: { getWorker: () => Worker }
}

workerScope.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

let themesDefined = false

export function ensureReaderThemes() {
  if (themesDefined) return
  themesDefined = true

  monaco.editor.defineTheme('fm-reader-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a9955' },
      { token: 'keyword', foreground: 'c586c0' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#cccccc',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editor.selectionBackground': '#264f78',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editorGutter.background': '#1e1e1e',
      'editorIndentGuide.background1': '#333333',
      'scrollbarSlider.background': '#79797933',
      'scrollbarSlider.hoverBackground': '#79797955',
    },
  })

  monaco.editor.defineTheme('fm-reader-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5b6472' },
      { token: 'keyword', foreground: 'af00db' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#1f2937',
      'editor.lineHighlightBackground': '#00000008',
      'editor.selectionBackground': '#add6ff',
      'editorLineNumber.foreground': '#8a94a6',
      'editorLineNumber.activeForeground': '#1f2937',
      'editorGutter.background': '#fafafa',
    },
  })
}

export { monaco }
