import { describe, expect, it } from 'vitest'

import { MODULES, moduleByPath } from '../registry'

describe('模块登记表', () => {
  it('智能助手保留入口，但不在工作台服务实例网格出卡片', () => {
    const agent = MODULES.find((module) => module.id === 'agent')
    expect(agent).toBeTruthy()
    expect(agent?.serviceCard).toBe(false)
    expect(moduleByPath('/agent').id).toBe('agent')

    const cards = MODULES.filter((module) => module.serviceCard !== false)
    expect(cards.map((module) => module.id)).toEqual(['overview', 'chat', 'reader', 'games', 'music'])
  })

  it('每个模块的路径都能反查到自身', () => {
    for (const module of MODULES) {
      expect(moduleByPath(module.path).id).toBe(module.id)
    }
  })
})
