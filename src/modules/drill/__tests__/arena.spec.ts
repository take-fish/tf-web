import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import BattleArena from '../components/BattleArena.vue'
import { createGame, dispatch } from '../core/engine'
import type { GameState } from '../core/state'
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

function prepareBattle() {
  const drill = useDrillStore()
  const base: GameState = {
    ...createGame(11),
    units: [
      { uid: 'a', defId: 'shunfengyao', star: 2, zone: 'board', slot: 0, annotations: [] },
      { uid: 'b', defId: 'zuoshen', star: 2, zone: 'board', slot: 1, annotations: [] },
    ],
  }
  const result = dispatch(base, { type: 'START_BATTLE' })
  drill.lastTrace = result.trace ?? null
  return drill
}

describe('演练观察窗', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('窗口打开后渲染实例卡与血条，而不是只有飘字', async () => {
    const drill = prepareBattle()
    const ui = useDrillUiStore()

    const wrapper = mount(BattleArena)
    ui.arenaOpen = true
    await nextTick()

    const units = wrapper.findAll('.drill__arena-unit')
    expect(units.length).toBeGreaterThanOrEqual(2)
    expect(wrapper.findAll('.drill__arena-hp').length).toBe(units.length)
    expect(wrapper.text()).toContain('顺丰尧')
    // 每个实例都有一个「人」，且有独立的特效层
    expect(wrapper.findAll('.drill__fig').length).toBe(units.length)
    expect(wrapper.find('.drill__arena-fx').exists()).toBe(true)

    // 浮动窗：八向缩放热区 + 绝对定位矩形
    expect(wrapper.findAll('.drill__arena-grip').length).toBe(8)
    const style = wrapper.find('.drill__modal--arena').attributes('style') ?? ''
    expect(style).toContain('left:')
    expect(style).toContain('top:')
    expect(style).toContain('width:')
    expect(style).toContain('height:')

    wrapper.unmount()
    expect(drill.lastTrace).not.toBeNull()
  })

  it('双方分列左右半场，己方不会被对手盖住', async () => {
    prepareBattle()
    const ui = useDrillUiStore()
    const wrapper = mount(BattleArena)
    ui.arenaOpen = true
    await nextTick()

    const allies = wrapper.findAll('.drill__arena-unit.is-ally')
    const enemies = wrapper.findAll('.drill__arena-unit.is-enemy')
    expect(allies.length).toBeGreaterThan(0)
    expect(enemies.length).toBeGreaterThan(0)

    const leftOf = (index: number, list: typeof allies) => {
      const style = list[index]?.attributes('style') ?? ''
      return Number(style.match(/left:\s*([\d.]+)%/)?.[1] ?? 0)
    }
    expect(leftOf(0, allies)).toBeLessThan(50)
    expect(leftOf(0, enemies)).toBeGreaterThanOrEqual(50)
    wrapper.unmount()
  })
})
