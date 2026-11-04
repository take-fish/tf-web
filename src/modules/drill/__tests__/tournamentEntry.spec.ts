import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDrillStore } from '../stores/drill'

describe('锦标赛入口', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('startTournament 直接进入 15 轮锦标赛局', () => {
    const drill = useDrillStore()
    drill.startTournament()

    expect(drill.mode).toBe('tournament')
    expect(drill.snapshot.tournament).toBe(true)
    expect(drill.snapshot.totalRounds).toBe(15)
    expect(drill.snapshot.round).toBe(1)
    expect(drill.snapshot.sli).toBe(100)
    expect(drill.snapshot.standings.length).toBe(8)
  })

  it('重开时保持锦标赛模式', () => {
    const drill = useDrillStore()
    drill.startTournament()
    drill.restart()

    expect(drill.snapshot.tournament).toBe(true)
    expect(drill.snapshot.totalRounds).toBe(15)
  })

  it('从锦标赛回到单练时重置为普通局', () => {
    const drill = useDrillStore()
    drill.startTournament()
    drill.startSolo()

    expect(drill.mode).toBe('solo')
    expect(drill.snapshot.tournament).toBe(false)
    expect(drill.snapshot.totalRounds).toBe(30)
  })
})
