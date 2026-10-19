import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

import { isSkinId, type SkinId } from '@/skins/registry'

export const SETTINGS_STORAGE_KEY = 'fm.settings.v1'

export type ReaderTemplateId = 'springboot' | 'react' | 'python' | 'go' | 'cpp'

export interface SettingsState {
  version: 1
  activeSkin: SkinId
  manualSkin: boolean
  lastRoute: string
  autoBossOnMouseLeave: boolean
  autoBossDelayMs: number
  readerTemplate: ReaderTemplateId
  readerFontSize: number
  autoScrollSeconds: number
  volume: number
}

const READER_TEMPLATES: readonly ReaderTemplateId[] = [
  'springboot',
  'react',
  'python',
  'go',
  'cpp',
]

export const DEFAULT_SETTINGS: SettingsState = {
  version: 1,
  activeSkin: 'ide',
  manualSkin: false,
  lastRoute: '/',
  autoBossOnMouseLeave: false,
  autoBossDelayMs: 2000,
  readerTemplate: 'springboot',
  readerFontSize: 14,
  autoScrollSeconds: 45,
  volume: 0.6,
}

function isReaderTemplate(value: unknown): value is ReaderTemplateId {
  return typeof value === 'string' && (READER_TEMPLATES as readonly string[]).includes(value)
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function sanitizeSettings(input: unknown): SettingsState {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SETTINGS }
  const raw = input as Partial<SettingsState>

  return {
    version: 1,
    activeSkin: isSkinId(raw.activeSkin) ? raw.activeSkin : DEFAULT_SETTINGS.activeSkin,
    manualSkin: typeof raw.manualSkin === 'boolean' ? raw.manualSkin : DEFAULT_SETTINGS.manualSkin,
    lastRoute:
      typeof raw.lastRoute === 'string' && raw.lastRoute.startsWith('/')
        ? raw.lastRoute
        : DEFAULT_SETTINGS.lastRoute,
    autoBossOnMouseLeave:
      typeof raw.autoBossOnMouseLeave === 'boolean'
        ? raw.autoBossOnMouseLeave
        : DEFAULT_SETTINGS.autoBossOnMouseLeave,
    autoBossDelayMs: clamp(
      Number(raw.autoBossDelayMs),
      500,
      10000,
      DEFAULT_SETTINGS.autoBossDelayMs,
    ),
    readerTemplate: isReaderTemplate(raw.readerTemplate)
      ? raw.readerTemplate
      : DEFAULT_SETTINGS.readerTemplate,
    readerFontSize: clamp(
      Number(raw.readerFontSize),
      10,
      24,
      DEFAULT_SETTINGS.readerFontSize,
    ),
    autoScrollSeconds: clamp(
      Number(raw.autoScrollSeconds),
      15,
      180,
      DEFAULT_SETTINGS.autoScrollSeconds,
    ),
    volume: clamp(Number(raw.volume), 0, 1, DEFAULT_SETTINGS.volume),
  }
}

export function decodeSettings(raw: string | null): SettingsState {
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    return sanitizeSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const state = reactive<SettingsState>(decodeSettings(storage()?.getItem(SETTINGS_STORAGE_KEY) ?? null))

  function persist() {
    try {
      storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 本地存储不可用时仅失去持久化能力，不影响运行
    }
  }

  function update(patch: Partial<SettingsState>) {
    Object.assign(state, sanitizeSettings({ ...state, ...patch }))
  }

  watch(state, persist, { deep: true })

  return { state, update, persist }
})
