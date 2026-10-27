import { describe, expect, it } from 'vitest'

import {
  ARENA_SCRIPTS,
  isArenaScript,
  isKnownScript,
  scriptDefaultName,
  scriptLabel,
  scriptOption,
  scriptShortLabel,
} from '../lib/arenaScripts'

describe('演练剧本目录', () => {
  it('包含四种剧本且 id 唯一，与后端 gameId 对齐', () => {
    const ids = ARENA_SCRIPTS.map((script) => script.id)

    expect(ids).toEqual([
      'heatmap-gomoku',
      'log-hotspot-arena',
      'topology-arena',
      'cluster-patrol-arena',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('只有实时竞技场进入 arena 渲染分支', () => {
    expect(isArenaScript('heatmap-gomoku')).toBe(false)
    expect(isArenaScript('log-hotspot-arena')).toBe(true)
    expect(isArenaScript('topology-arena')).toBe(true)
    expect(isArenaScript('cluster-patrol-arena')).toBe(true)
    expect(isArenaScript(null)).toBe(false)
  })

  it('已知剧本可被收窄，未知值不通过', () => {
    expect(isKnownScript('topology-arena')).toBe(true)
    expect(isKnownScript('unknown-game')).toBe(false)
    expect(isKnownScript(undefined)).toBe(false)
  })

  it('文案查询对未知剧本回退到默认项', () => {
    expect(scriptOption('unknown-game').id).toBe('heatmap-gomoku')
    expect(scriptLabel('topology-arena')).toBe('混沌工程攻防演练')
    expect(scriptShortLabel('log-hotspot-arena')).toBe('热点排查')
    expect(scriptDefaultName('log-hotspot-arena')).toBe('日志热区排查')
    expect(scriptDefaultName(null)).toBe('热力五子棋')
  })
})
