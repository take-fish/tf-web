import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GomokuBoard from '../components/GomokuBoard.vue'

afterEach(() => {
  vi.useRealTimers()
})

describe('GomokuBoard 放大交互', () => {
  it('单击延迟落子，双击取消落子并请求放大', async () => {
    vi.useFakeTimers()
    const wrapper = mount(GomokuBoard, {
      props: {
        moves: [],
        interactive: true,
        blackUserId: 'u1',
        whiteUserId: 'u2',
      },
    })
    const cells = wrapper.findAll('.gomoku__cell')

    await cells[0]!.trigger('click')
    expect(wrapper.emitted('place')).toBeUndefined()

    vi.advanceTimersByTime(240)
    expect(wrapper.emitted('place')).toEqual([[0, 0]])

    await cells[1]!.trigger('click')
    await cells[1]!.trigger('dblclick')
    vi.advanceTimersByTime(300)

    expect(wrapper.emitted('place')).toHaveLength(1)
    expect(wrapper.emitted('expand')).toHaveLength(1)
    wrapper.unmount()
  })

  it('不可落子的棋盘仍可通过双击放大', async () => {
    const wrapper = mount(GomokuBoard, {
      props: { moves: [], interactive: false },
    })
    const cell = wrapper.findAll('.gomoku__cell')[0]!

    expect(cell.attributes('disabled')).toBeUndefined()
    expect(cell.attributes('aria-disabled')).toBe('true')

    await cell.trigger('dblclick')
    expect(wrapper.emitted('expand')).toHaveLength(1)
    wrapper.unmount()
  })

  it('fluid 模式启用自适应棋盘', () => {
    const wrapper = mount(GomokuBoard, {
      props: { moves: [], fluid: true },
    })

    expect(wrapper.classes()).toContain('is-fluid')
    wrapper.unmount()
  })
})
