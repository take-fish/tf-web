import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UserAvatar from '../UserAvatar.vue'

describe('UserAvatar', () => {
  it('明确地址优先渲染图片', () => {
    const wrapper = mount(UserAvatar, {
      props: { name: '良一情', src: '/api/v1/user/avatars/12?v=1' },
    })

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/api/v1/user/avatars/12?v=1')
    expect(wrapper.text()).toBe('')
  })

  it('没有明确地址时按 u12 推导公开头像地址', () => {
    const wrapper = mount(UserAvatar, {
      props: { name: '良一情', userId: 'u12' },
    })

    expect(wrapper.find('img').attributes('src')).toBe('/api/v1/user/avatars/12')
  })

  it('没有头像信息时显示名号首字', () => {
    const wrapper = mount(UserAvatar, {
      props: { name: '良一情' },
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('良')
  })

  it('图片加载失败时回退首字', async () => {
    const wrapper = mount(UserAvatar, {
      props: { name: 'bob', userId: 'u2' },
    })

    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('B')
  })

  it('固定尺寸通过内联样式生效', () => {
    const wrapper = mount(UserAvatar, {
      props: { name: 'bob', size: 40 },
    })

    expect(wrapper.attributes('style')).toContain('width: 40px')
    expect(wrapper.attributes('style')).toContain('height: 40px')
  })
})
