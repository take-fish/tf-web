import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import DrillView from '@/views/DrillView.vue'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games', component: { template: '<div />' } },
      { path: '/games/autochess', component: DrillView },
    ],
  })
}

describe('DrillView', () => {
  it('渲染编排工作区，且界面上不出现玩法词汇', async () => {
    const router = createTestRouter()
    await router.push('/games/autochess')
    await router.isReady()

    const wrapper = mount(DrillView, {
      global: { plugins: [createPinia(), router] },
    })

    const text = wrapper.text()
    expect(text).toContain('容量编排')
    expect(text).toContain('亲和组依赖')
    expect(text).toContain('资源目录')
    expect(text).toContain('一致性校验')
    expect(text).toContain('SLI')

    // 文案红线：界面不得出现玩法词汇
    expect(text).not.toMatch(/游戏|对局|棋子|英雄|羁绊|装备|商店|金币|血量|吃鸡|海克斯/)

    // 未登录 / 非管理员：命名入口不渲染
    expect(wrapper.find('.drill__ghost--admin').exists()).toBe(false)

    // 同局聊天放在左侧栏 TraitPanel 下方，不再 fixed 到商店上
    expect(wrapper.find('.drill__rail--left > .drill__chat').exists()).toBe(true)

    wrapper.unmount()
  })
})
