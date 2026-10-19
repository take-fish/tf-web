import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SKIN,
  SKIN_IDS,
  defaultSkinForPath,
  isSkinId,
  nextSkin,
} from '@/skins/registry'
import { BOSS_TITLE, documentTitle, normalizeRoutePath } from '@/skins/state'
import { useSkinStore } from '@/stores/skin'

describe('skin registry', () => {
  it('按模块映射默认皮肤', () => {
    expect(defaultSkinForPath('/')).toBe('ide')
    expect(defaultSkinForPath('/chat')).toBe('terminal')
    expect(defaultSkinForPath('/chat/dev-group')).toBe('terminal')
    expect(defaultSkinForPath('/reader')).toBe('ide')
    expect(defaultSkinForPath('/games')).toBe('grafana')
    expect(defaultSkinForPath('/music')).toBe('jenkins')
    expect(defaultSkinForPath('/unknown')).toBe(DEFAULT_SKIN)
  })

  it('循环切换皮肤', () => {
    expect(nextSkin('ide')).toBe('terminal')
    expect(nextSkin(SKIN_IDS[SKIN_IDS.length - 1]!)).toBe('ide')
  })

  it('校验皮肤 id', () => {
    expect(isSkinId('kibana')).toBe(true)
    expect(isSkinId('nope')).toBe(false)
    expect(isSkinId(null)).toBe(false)
  })

  it('规范化路由路径', () => {
    expect(normalizeRoutePath('')).toBe('/')
    expect(normalizeRoutePath('/chat/')).toBe('/chat')
    expect(normalizeRoutePath('/chat?x=1')).toBe('/chat')
    expect(normalizeRoutePath('/chat#top')).toBe('/chat')
  })
})

describe('documentTitle', () => {
  it('按皮肤生成伪装标题', () => {
    expect(documentTitle({ skin: 'ide', moduleTitle: 'ReaderService.java', host: 'dev' }, false)).toBe(
      'ReaderService.java - Visual Studio Code',
    )
    expect(documentTitle({ skin: 'terminal', moduleTitle: '', host: 'dev-node-01' }, false)).toBe(
      'bash — dev-node-01',
    )
    expect(documentTitle({ skin: 'grafana', moduleTitle: '', host: 'dev' }, false)).toBe(
      'FishMatrix Metrics - Grafana',
    )
    expect(documentTitle({ skin: 'jenkins', moduleTitle: '', host: 'dev' }, false)).toBe(
      'Dashboard [Jenkins]',
    )
  })

  it('Boss 状态固定为开发工作台标题', () => {
    expect(documentTitle({ skin: 'terminal', moduleTitle: 'chat', host: 'dev' }, true)).toBe(
      BOSS_TITLE,
    )
  })
})

describe('skin store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('路由切换套用模块默认皮肤', () => {
    const store = useSkinStore()
    store.applyRoute('/chat')
    expect(store.activeSkin).toBe('terminal')
    store.applyRoute('/games')
    expect(store.activeSkin).toBe('grafana')
  })

  it('手动皮肤在同一路由保持，换路由后复位', () => {
    const store = useSkinStore()
    store.applyRoute('/chat')
    store.selectSkin('kibana')
    expect(store.activeSkin).toBe('kibana')
    expect(store.manualSkin).toBe(true)

    store.applyRoute('/chat')
    expect(store.activeSkin).toBe('kibana')

    store.applyRoute('/reader')
    expect(store.activeSkin).toBe('ide')
    expect(store.manualSkin).toBe(false)
  })

  it('Boss 模式强制 IDE 并在退出后恢复', () => {
    const store = useSkinStore()
    store.applyRoute('/chat')
    store.enterBoss()
    expect(store.effectiveSkin).toBe('ide')
    store.exitBoss()
    expect(store.effectiveSkin).toBe('terminal')
  })
})
