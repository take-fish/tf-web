import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { GameChatMessage } from '@/types/games'

import MatchChatPanel from '../MatchChatPanel.vue'

function message(overrides: Partial<GameChatMessage> = {}): GameChatMessage {
  return {
    id: 'c1',
    tournamentId: 't1',
    matchId: 'm1',
    channel: 'PUBLIC',
    fromUserId: 'u1',
    fromNickname: 'Alice',
    toUserId: null,
    content: '大家好',
    createdAt: 0,
    ...overrides,
  }
}

const BASE_PROPS = {
  channel: 'PUBLIC' as const,
  messages: [] as GameChatMessage[],
  loading: false,
  error: '',
  closed: false,
  sending: false,
  hint: '公开频道所有人可见',
  placeholder: '说点什么…',
  privateTabVisible: false,
  selfId: 'u1',
}

describe('MatchChatPanel', () => {
  it('按发送者区分自己的消息', () => {
    const wrapper = mount(MatchChatPanel, {
      props: {
        ...BASE_PROPS,
        messages: [message(), message({ id: 'c2', fromUserId: 'u2', content: '收到' })],
      },
    })

    const items = wrapper.findAll('.match-window__message')
    expect(items).toHaveLength(2)
    expect(items[0]?.classes()).toContain('is-self')
    expect(items[1]?.classes()).not.toContain('is-self')
    expect(wrapper.text()).toContain('收到')
  })

  it('空列表按频道给出提示', () => {
    const wrapper = mount(MatchChatPanel, {
      props: { ...BASE_PROPS, channel: 'PLAYER_DM' },
    })

    expect(wrapper.text()).toContain('还没有私聊消息')
  })

  it('切换频道抛出 update:channel', async () => {
    const wrapper = mount(MatchChatPanel, {
      props: { ...BASE_PROPS, privateTabVisible: true },
    })

    const tabs = wrapper.findAll('.match-window__tabs button')
    expect(tabs).toHaveLength(2)
    await tabs[1]!.trigger('click')
    expect(wrapper.emitted('update:channel')).toEqual([['PLAYER_DM']])
  })

  it('提交时抛出裁剪后的文本且不自动清空草稿', async () => {
    const wrapper = mount(MatchChatPanel, { props: BASE_PROPS })
    const input = wrapper.get('.match-window__composer input')
    await input.setValue('  你好  ')
    await wrapper.get('.match-window__composer').trigger('submit')

    expect(wrapper.emitted('send')).toEqual([['你好']])
    expect((input.element as HTMLInputElement).value).toBe('  你好  ')
  })

  it('空白草稿与关闭状态不发送', async () => {
    const wrapper = mount(MatchChatPanel, { props: BASE_PROPS })
    await wrapper.get('.match-window__composer').trigger('submit')
    expect(wrapper.emitted('send')).toBeUndefined()

    await wrapper.setProps({ closed: true })
    expect(wrapper.get('.match-window__composer input').attributes('disabled')).toBeDefined()
  })

  it('clearDraft 清空输入框', async () => {
    const wrapper = mount(MatchChatPanel, { props: BASE_PROPS })
    await wrapper.get('.match-window__composer input').setValue('待发送')

    ;(wrapper.vm as unknown as { clearDraft: () => void }).clearDraft()
    await wrapper.vm.$nextTick()

    expect((wrapper.get('.match-window__composer input').element as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('展示加载、错误与聊天提示', () => {
    const loading = mount(MatchChatPanel, { props: { ...BASE_PROPS, loading: true } })
    expect(loading.text()).toContain('正在同步聊天记录')

    const failed = mount(MatchChatPanel, {
      props: { ...BASE_PROPS, error: '发送失败' },
    })
    expect(failed.text()).toContain('发送失败')
    expect(failed.text()).toContain('公开频道所有人可见')
  })
})
