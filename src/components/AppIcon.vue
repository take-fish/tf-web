<script setup lang="ts">
export type IconName =
  | 'overview'
  | 'terminal'
  | 'file'
  | 'activity'
  | 'build'
  | 'settings'
  | 'search'
  | 'user'
  | 'close'
  | 'play'
  | 'pause'
  | 'folder'
  | 'chevron'
  | 'bookmark'
  | 'comment'
  | 'refresh'
  | 'import'
  | 'power'
  | 'menu'
  | 'check'
  | 'warning'
  | 'plus'
  | 'external'
  | 'shield'
  | 'spark'

const ICONS: Record<IconName, readonly string[]> = {
  overview: ['M2.5 8.5 8 3l5.5 5.5', 'M4 7.5V13h8V7.5', 'M6.5 13V9.5h3V13'],
  terminal: ['M2.5 3.5h11v9h-11z', 'M5 6l2 2-2 2', 'M8.5 10.5H11'],
  file: ['M4 1.5h5l3 3v10H4z', 'M9 1.5v3h3', 'M6 8h4', 'M6 10.5h4'],
  activity: ['M1.5 8h3l1.5-4 2.5 8 1.5-4h4'],
  build: ['M2 4.5h12v9H2z', 'M2 7.5h12', 'M5 4.5V2.5h6v2', 'M5 10h2'],
  settings: [
    'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    'M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9',
  ],
  search: ['M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z', 'M10.4 10.4 14 14'],
  user: ['M8 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'M3 14c.6-2.7 2.5-4 5-4s4.4 1.3 5 4'],
  close: ['M3.5 3.5l9 9', 'M12.5 3.5l-9 9'],
  play: ['M5 3l7 5-7 5z'],
  pause: ['M5 3v10', 'M11 3v10'],
  folder: ['M1.5 3.5h4l1.5 2h7.5v8h-13z', 'M1.5 5.5h13'],
  chevron: ['M6 4l4 4-4 4'],
  bookmark: ['M4 2.5h8v11l-4-2.5-4 2.5z'],
  comment: ['M2 3h12v8H8l-3 2.5V11H2z'],
  refresh: ['M13 8a5 5 0 1 1-1.5-3.5', 'M13 2.5V6h-3.5'],
  import: ['M8 2v8', 'M5 7l3 3 3-3', 'M2.5 12.5h11'],
  power: ['M8 2v5', 'M4.2 4.2a5.5 5.5 0 1 0 7.6 0'],
  menu: ['M2.5 4h11', 'M2.5 8h11', 'M2.5 12h11'],
  check: ['M3 8.5l3 3 7-7'],
  warning: ['M8 2l6 11H2z', 'M8 6v3.5', 'M8 11.5v.1'],
  plus: ['M8 3v10', 'M3 8h10'],
  external: ['M6 3H3v10h10V10', 'M9 2h5v5', 'M14 2 7.5 8.5'],
  shield: ['M8 1.5 13 3.5v4.5c0 3-2.2 5.3-5 6.5-2.8-1.2-5-3.5-5-6.5V3.5z', 'M5.5 8l1.8 1.8 3.5-3.6'],
  // Agent 入口：四角星芒，弱化成线性图标风格
  spark: ['M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6z'],
}

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 16 })
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.3"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, index) in ICONS[name]" :key="index" :d="d" />
  </svg>
</template>
