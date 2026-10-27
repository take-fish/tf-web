import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BlindXiangqiBoard from '../components/BlindXiangqiBoard.vue'
import type { BlindPieceView } from '../types'

function mountBoard(pieces: BlindPieceView[]) {
  return mount(BlindXiangqiBoard, {
    props: {
      pieces,
      selfUserId: 'u1',
      firstUserId: 'u1',
      secondUserId: 'u2',
      turnUserId: 'u1',
      interactive: true,
    },
  })
}

function cellAt(index: number) {
  return index
}

describe('BlindXiangqiBoard', () => {
  it('点击反面棋发出 reveal', async () => {
    const wrapper = mountBoard([
      { x: 4, y: 4, revealed: false, color: null, pieceType: null },
    ])

    await wrapper.findAll('button.blind__cell')[cellAt(4 * 9 + 4)]!.trigger('click')

    expect(wrapper.emitted('reveal')).toEqual([[4, 4]])
  })

  it('选中己方棋子后点击合法反面棋发出 move', async () => {
    const wrapper = mountBoard([
      { x: 0, y: 9, revealed: true, color: 'RED', pieceType: 'CHARIOT' },
      { x: 0, y: 5, revealed: false, color: null, pieceType: null },
    ])

    const cells = wrapper.findAll('button.blind__cell')
    await cells[cellAt(9 * 9 + 0)]!.trigger('click')
    await cells[cellAt(5 * 9 + 0)]!.trigger('click')

    expect(wrapper.emitted('move')).toEqual([[0, 9, 0, 5]])
  })

  it('非己方回合不响应点击', async () => {
    const wrapper = mount(BlindXiangqiBoard, {
      props: {
        pieces: [{ x: 4, y: 4, revealed: false, color: null, pieceType: null }],
        selfUserId: 'u2',
        firstUserId: 'u1',
        secondUserId: 'u2',
        turnUserId: 'u1',
        interactive: true,
      },
    })

    await wrapper.findAll('button.blind__cell')[cellAt(4 * 9 + 4)]!.trigger('click')

    expect(wrapper.emitted('reveal')).toBeUndefined()
  })
})
