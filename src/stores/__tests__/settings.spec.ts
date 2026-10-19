import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  decodeSettings,
  sanitizeSettings,
  useSettingsStore,
} from '@/stores/settings'

describe('settings sanitize', () => {
  it('空值与非法 JSON 回退默认值', () => {
    expect(decodeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(decodeSettings('{oops')).toEqual(DEFAULT_SETTINGS)
  })

  it('夹取数值并丢弃非法枚举', () => {
    const result = sanitizeSettings({
      activeSkin: 'hacker',
      manualSkin: 'yes',
      lastRoute: 'chat',
      autoBossOnMouseLeave: true,
      autoBossDelayMs: 999999,
      readerTemplate: 'unknown',
      readerFontSize: 2,
      autoScrollSeconds: 500,
      volume: 3,
    })

    expect(result.activeSkin).toBe(DEFAULT_SETTINGS.activeSkin)
    expect(result.manualSkin).toBe(false)
    expect(result.lastRoute).toBe('/')
    expect(result.autoBossOnMouseLeave).toBe(true)
    expect(result.autoBossDelayMs).toBe(10000)
    expect(result.readerTemplate).toBe(DEFAULT_SETTINGS.readerTemplate)
    expect(result.readerFontSize).toBe(10)
    expect(result.autoScrollSeconds).toBe(180)
    expect(result.volume).toBe(1)
  })
})

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('更新状态并持久化', async () => {
    const store = useSettingsStore()
    store.update({ activeSkin: 'kibana', manualSkin: true, volume: 0.25 })
    await nextTick()

    expect(store.state.activeSkin).toBe('kibana')
    expect(store.state.volume).toBe(0.25)

    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).activeSkin).toBe('kibana')
  })

  it('从已有本地存储恢复', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, activeSkin: 'grafana', autoScrollSeconds: 60 }),
    )
    setActivePinia(createPinia())
    const store = useSettingsStore()
    expect(store.state.activeSkin).toBe('grafana')
    expect(store.state.autoScrollSeconds).toBe(60)
  })
})
