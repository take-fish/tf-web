import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDrillStore } from '../stores/drill'

describe('退出并重开一局', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('重开后回到第 1 轮，进度与暂停状态清零，组队席位保留', () => {
    const drill = useDrillStore()
    drill.startParty([
      { seat: 0, userId: 'self', nickname: '我', isAi: false },
      { seat: 1, userId: 'u2', nickname: '张三', isAi: false },
    ])
    drill.tick()
    drill.togglePause()
    expect(drill.paused).toBe(true)

    drill.restart()

    expect(drill.snapshot.round).toBe(1)
    expect(drill.snapshot.sli).toBe(100)
    expect(drill.snapshot.quotas).toBe(10)
    expect(drill.snapshot.elapsed).toBe(0)
    expect(drill.paused).toBe(false)
    expect(drill.mode).toBe('party')
    expect(drill.snapshot.roster[0]?.label).toBe('张三')
  })
})
