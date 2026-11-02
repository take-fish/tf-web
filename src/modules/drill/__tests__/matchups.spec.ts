import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDrillStore } from '../stores/drill'

describe('本轮对阵', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('开演前全部待演，开演后出结果，且只含当前回合', () => {
    const drill = useDrillStore()
    const round = drill.snapshot.round

    expect(drill.matchups.length).toBeGreaterThan(1)
    expect(drill.matchups.every((row) => row.round === round)).toBe(true)
    expect(drill.matchups.every((row) => !row.played)).toBe(true)
    expect(drill.matchups.some((row) => row.isPlayer)).toBe(true)

    // 买一个上场再发起校验
    const slot = drill.snapshot.shop.find((item) => item.unitId !== null)
    expect(slot).toBeTruthy()
    drill.buy(slot?.slot ?? 1)
    const benched = drill.snapshot.bench[0]
    expect(benched).toBeTruthy()
    drill.move(benched?.id ?? '', 'board', 0)

    expect(drill.startBattle()).toBe(true)

    const after = drill.matchups
    expect(after.every((row) => row.round === round)).toBe(true)
    const playerRow = after.find((row) => row.isPlayer)
    expect(playerRow?.played).toBe(true)
    expect(playerRow?.resultLabel).toMatch(/通过|未通过/)
    // 其它对局也有结果与轨迹，可以直接打开观察窗
    const other = after.find((row) => !row.isPlayer)
    expect(other?.played).toBe(true)
    expect(other?.hasTrace).toBe(true)
    expect(drill.openMatchup(other?.id ?? '')).toBe(true)
    expect(drill.preview?.trace).toBeTruthy()
    drill.clearPreview()
    expect(drill.preview).toBeNull()
  })
})
