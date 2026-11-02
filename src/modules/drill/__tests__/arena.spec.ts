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
    expect(wrapper.text()).toContain('顺风尧')
    // 每个实例都有一个「人」，且有独立的特效层
    expect(wrapper.findAll('.drill__fig').length).toBe(units.length)
    expect(wrapper.find('.drill__arena-fx').exists()).toBe(true)

    // 窗口尺寸可调：预设按钮齐全
    const sizes = wrapper.findAll('.drill__arena-sizes button')
    expect(sizes.length).toBe(4)
    expect(wrapper.find('.drill__arena-resize').exists()).toBe(true)

    // 拖动预设到「满」后窗口变宽
    const before = wrapper.find('.drill__modal--arena').attributes('style') ?? ''
    await sizes[3]?.trigger('click')
    await nextTick()
    const after = wrapper.find('.drill__modal--arena').attributes('style') ?? ''
    expect(after).not.toBe(before)
    expect(after).toContain('width')

    wrapper.unmount()
    expect(drill.lastTrace).not.toBeNull()
  })
})
