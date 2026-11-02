import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDrillStore } from '../stores/drill'
import type { PartySeat } from '../types'

function seats(members: { seat: number; nickname: string; isAi: boolean }[]): PartySeat[] {
  const list: PartySeat[] = []
  for (let index = 0; index < 8; index += 1) {
    const member = members.find((entry) => entry.seat === index)
    list.push({
      seat: index,
      userId: member && !member.isAi ? `u${index}` : `ai-${index}`,
      nickname: member ? member.nickname : `对照组-0${index}`,
      isAi: member ? member.isAi : true,
    })
  }
  return list
}

describe('组队 / 单练分流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('单练时对手仍是默认对照组', () => {
    const drill = useDrillStore()
    drill.startSolo()

    expect(drill.mode).toBe('solo')
    expect(drill.party).toHaveLength(0)
    expect(drill.snapshot.roster[0]?.label).toBe('对照组-01')
  })

  it('组队时真人席位替换对手名，AI 席位保持对照组', () => {
    const drill = useDrillStore()
    drill.startParty(
      seats([
        { seat: 0, nickname: '我', isAi: false },
        { seat: 3, nickname: '张三', isAi: false },
      ]),
    )

    expect(drill.mode).toBe('party')
    const roster = drill.snapshot.roster
    expect(roster).toHaveLength(7)
    expect(roster[2]?.label).toBe('张三')
    expect(roster[0]?.label).toBe('对照组-01')
  })

  it('模式写进本地存储，重置后清空', () => {
    const drill = useDrillStore()
    drill.startParty(seats([{ seat: 0, nickname: '我', isAi: false }]))
    expect(localStorage.getItem('fm.drill.mode.v1')).toBe('party')
    expect(localStorage.getItem('fm.drill.party.v1')).toContain('对照组-07')

    drill.resetMode()
    expect(localStorage.getItem('fm.drill.mode.v1')).toBeNull()
    expect(localStorage.getItem('fm.drill.party.v1')).toBeNull()
  })
})
