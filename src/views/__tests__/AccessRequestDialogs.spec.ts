import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { AccessRequest as BookAccessRequest } from '@/types/reader'
import type { AccessRequest as TrackAccessRequest } from '@/types/music'

import MusicRequestsDialog from '../music/MusicRequestsDialog.vue'
import ReaderRequestsDialog from '../reader/ReaderRequestsDialog.vue'

function bookRequest(overrides: Partial<BookAccessRequest> = {}): BookAccessRequest {
  return {
    id: 1,
    bookId: 11,
    bookTitle: '重构之道',
    ownerId: 2,
    ownerNickname: 'Bob',
    requesterId: 3,
    requesterNickname: 'Carol',
    status: 'PENDING',
    message: '想学习一下',
    decisionMessage: '',
    createdAt: '2026-10-01T08:00:00Z',
    decidedAt: null,
    ...overrides,
  }
}

function trackRequest(overrides: Partial<TrackAccessRequest> = {}): TrackAccessRequest {
  return {
    id: 1,
    trackId: 21,
    trackTitle: '晨间播放列表',
    ownerId: 2,
    ownerNickname: 'Bob',
    requesterId: 3,
    requesterNickname: 'Carol',
    status: 'PENDING',
    message: '周末想听',
    decisionMessage: '',
    createdAt: '2026-10-01T08:00:00Z',
    decidedAt: null,
    ...overrides,
  }
}

describe('ReaderRequestsDialog', () => {
  it('按状态展示操作并抛出决定事件', async () => {
    const pending = bookRequest()
    const approved = bookRequest({ id: 2, bookTitle: '已授权书籍', status: 'APPROVED' })
    const mine = bookRequest({ id: 3, status: 'PENDING', decisionMessage: '' })
    const wrapper = mount(ReaderRequestsDialog, {
      props: { received: [pending, approved], mine: [mine] },
    })

    expect(wrapper.text()).toContain('重构之道')
    expect(wrapper.text()).toContain('已授权书籍')

    const buttons = wrapper.findAll('.reader-request__btn')
    expect(buttons.map((button) => button.text())).toEqual(['批准', '拒绝', '撤销授权', '取消申请'])

    await buttons[2]!.trigger('click')
    expect(wrapper.emitted('decide')).toEqual([[approved, 'revoke']])
  })

  it('点击遮罩与关闭按钮都抛出 close', async () => {
    const wrapper = mount(ReaderRequestsDialog, {
      props: { received: [], mine: [] },
    })

    expect(wrapper.text()).toContain('还没有人申请访问你的私有内容')
    expect(wrapper.text()).toContain('暂无申请记录')

    await wrapper.get('.icon-button').trigger('click')
    await wrapper.get('.overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})

describe('MusicRequestsDialog', () => {
  it('展示曲目标题并抛出批准事件', async () => {
    const request = trackRequest()
    const wrapper = mount(MusicRequestsDialog, {
      props: { received: [request], mine: [] },
    })

    expect(wrapper.text()).toContain('晨间播放列表')
    expect(wrapper.text()).toContain('周末想听')

    await wrapper.get('.music__request-btn').trigger('click')
    expect(wrapper.emitted('decide')).toEqual([[request, 'approve']])
  })

  it('空列表展示提示且关闭按钮抛出 close', async () => {
    const wrapper = mount(MusicRequestsDialog, {
      props: { received: [], mine: [] },
    })

    expect(wrapper.text()).toContain('暂无收到的申请')
    await wrapper.get('.icon-button').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[]])
  })
})
