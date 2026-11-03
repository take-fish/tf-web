import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import LineupPanel from '../components/LineupPanel.vue'
import ResourceBar from '../components/ResourceBar.vue'
import { UNIT_BY_ID } from '../core/content'
import { LINEUP_DEFS, lineupTraits } from '../core/lineups'
import { useDrillStore } from '../stores/drill'
import { useLineupStore } from '../stores/lineup'
import { useDrillUiStore } from '../stores/ui'

describe('推荐阵容数据', () => {
  it('每套阵容的实例都存在、不重复、站位合法', () => {
    for (const lineup of LINEUP_DEFS) {
      const ids = lineup.units.map((unit) => unit.defId)
      expect(new Set(ids).size).toBe(ids.length)
      for (const unit of lineup.units) {
        expect(UNIT_BY_ID[unit.defId]).toBeTruthy()
        expect(['前排', '中排', '后排']).toContain(unit.row)
      }
      for (const equip of lineup.equip) expect(ids).toContain(equip.defId)
    }
  })

  it('亲和组按成员数自动统计出档位', () => {
    const rush = LINEUP_DEFS.find((lineup) => lineup.id === 'xiaoshida-rush')
    expect(rush).toBeTruthy()
    const traits = lineupTraits(rush!)
    const xiaoshida = traits.find((trait) => trait.id === 'xiaoshida')
    expect(xiaoshida?.count).toBe(8)
    expect(xiaoshida?.tier).toBe(2)
    const xiaozhao = traits.find((trait) => trait.id === 'xiaozhao')
    expect(xiaozhao?.count).toBe(2)
    expect(xiaozhao?.tier).toBe(1)
  })

  it('AI 阵容能吃到 AI 6 档与架构 2 档', () => {
    const ai = LINEUP_DEFS.find((lineup) => lineup.id === 'ai-backline')
    const traits = lineupTraits(ai!)
    expect(traits.find((trait) => trait.id === 'ai')?.tier).toBe(3)
    expect(traits.find((trait) => trait.id === 'arch')?.tier).toBe(1)
  })
})

describe('阵容收藏与使用', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('收藏后进入我的阵容，取消后移出', () => {
    const lineup = useLineupStore()
    expect(lineup.mine).toHaveLength(0)
    lineup.toggleFavorite('xiaozhao-core')
    expect(lineup.mine.map((item) => item.id)).toEqual(['xiaozhao-core'])
    lineup.toggleFavorite('xiaozhao-core')
    expect(lineup.mine).toHaveLength(0)
  })

  it('使用后只对这套阵容的实例亮灯', () => {
    const lineup = useLineupStore()
    lineup.useLineup('xiaoshida-rush')
    expect(lineup.isWanted('miwei')).toBe(true)
    expect(lineup.isWanted('yujie')).toBe(false)
    lineup.useLineup('xiaoshida-rush')
    expect(lineup.active).toBeNull()
    expect(lineup.isWanted('miwei')).toBe(false)
  })
})

describe('阵容界面', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('推荐阵容展示人口/羁绊/站位/装备，收藏后出现在我的阵容', async () => {
    const ui = useDrillUiStore()
    const lineup = useLineupStore()
    ui.openLineup('recommended')

    const wrapper = mount(LineupPanel)
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('小狮达冲锋')
    expect(text).toContain('人口 8')
    expect(text).toContain('装备推荐')
    expect(text).toContain('前排')
    expect(text).toContain('@Async')

    const cards = wrapper.findAll('.drill__lineup-card')
    expect(cards.length).toBe(LINEUP_DEFS.length)
    await cards[0]?.findAll('button')[0]?.trigger('click')
    expect(lineup.mine).toHaveLength(1)

    await cards[0]?.findAll('button')[1]?.trigger('click')
    expect(lineup.activeId).toBe('xiaoshida-rush')

    wrapper.unmount()
  })

  it('商城卡片对当前阵容需要的实例亮红点', async () => {
    const drill = useDrillStore()
    const lineup = useLineupStore()
    lineup.useLineup('xiaozhao-core')

    const wrapper = mount(ResourceBar)
    await nextTick()
    const wanted = drill.snapshot.shop.filter((slot) => lineup.isWanted(slot.unitId))
    expect(wrapper.findAll('.drill__resource-dot')).toHaveLength(wanted.length)
    wrapper.unmount()
  })
})
