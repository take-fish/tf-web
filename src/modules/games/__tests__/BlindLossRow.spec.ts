import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BlindLossRow from '../components/BlindLossRow.vue'

describe('BlindLossRow', () => {
  it('渲染已损失棋子与重复数量', () => {
    const wrapper = mount(BlindLossRow, {
      props: {
        color: 'RED',
        groups: [
          { pieceType: 'CHARIOT', count: 1 },
          { pieceType: 'SOLDIER', count: 2 },
        ],
        align: 'left',
      },
    })

    expect(wrapper.text()).toContain('已损失')
    expect(wrapper.text()).toContain('车')
    expect(wrapper.text()).toContain('兵')
    expect(wrapper.text()).toContain('×2')
    expect(wrapper.findAll('.blind-loss__piece')).toHaveLength(2)
    expect(wrapper.find('.blind-loss').classes()).toContain('is-red')
  })

  it('没有损失时显示暂无损失', () => {
    const wrapper = mount(BlindLossRow, {
      props: { color: 'BLACK', groups: [], align: 'right' },
    })

    expect(wrapper.text()).toContain('已损失')
    expect(wrapper.text()).toContain('暂无损失')
    expect(wrapper.find('.blind-loss').classes()).toContain('is-right')
    expect(wrapper.find('.blind-loss').classes()).toContain('is-black')
  })

  it('颜色未知时不渲染', () => {
    const wrapper = mount(BlindLossRow, {
      props: { color: null, groups: [] },
    })

    expect(wrapper.find('.blind-loss').exists()).toBe(false)
  })
})
