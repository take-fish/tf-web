import { describe, expect, it } from 'vitest'

import { EMPTY_MODS, MAX_TICKS, simulateBattle } from '../core/combat'
import type { FighterInput } from '../core/combat'

function fighter(uid: string, defId: string, col: number, row = 0): FighterInput {
  return { uid, defId, star: 1, col, row, annotations: [] }
}

describe('战斗轨迹', () => {
  it('双方分列左右两半场，开局不重叠', () => {
    const outcome = simulateBattle(
      [fighter('a1', 'shunfengyao', 0)],
      [fighter('e1', 'kang', 1)],
      EMPTY_MODS,
      EMPTY_MODS,
    )
    const units = outcome.trace.units
    const ally = units.find((unit) => unit.uid === 'a1')
    const enemy = units.find((unit) => unit.uid === 'e1')
    expect(ally?.col).toBeLessThanOrEqual(6)
    expect(enemy?.col).toBeGreaterThanOrEqual(7)
    expect(outcome.trace.frames[0]?.units).toHaveLength(2)
  })

  it('近战会走向目标', () => {
    const outcome = simulateBattle(
      [fighter('a1', 'shunfengyao', 0)],
      [fighter('e1', 'kang', 1)],
      EMPTY_MODS,
      EMPTY_MODS,
    )
    const start = outcome.trace.frames[0]?.units.find((unit) => unit.uid === 'a1')?.col ?? 0
    const end = outcome.trace.frames.at(-1)?.units.find((unit) => unit.uid === 'a1')?.col ?? 0
    expect(end).toBeGreaterThan(start)
  })

  it('远程在贴身之前就打出伤害', () => {
    const outcome = simulateBattle(
      [fighter('a1', 'meiyun', 0)],
      [fighter('e1', 'meiyun', 1)],
      EMPTY_MODS,
      EMPTY_MODS,
    )
    const firstHit = outcome.trace.events.find((event) => event.kind === 'hit' && event.uid === 'a1')
    expect(firstHit).toBeTruthy()
    const tick = Math.max(0, Math.round((firstHit?.t ?? 0) / 0.1) - 1)
    const frame = outcome.trace.frames[Math.min(outcome.trace.frames.length - 1, tick)]
    const ally = frame?.units.find((unit) => unit.uid === 'a1')
    const enemy = frame?.units.find((unit) => unit.uid === 'e1')
    expect(Math.abs((ally?.col ?? 0) - (enemy?.col ?? 0))).toBeGreaterThan(1)
  })

  it('45 秒到点按剩余人数判胜', () => {
    const tanky = { ...EMPTY_MODS, hp: 30 }
    const outcome = simulateBattle(
      [fighter('a1', 'liangqiang', 0), fighter('a2', 'miwei', 1)],
      [fighter('e1', 'liangqiang', 3)],
      tanky,
      tanky,
    )
    expect(outcome.ticks).toBe(MAX_TICKS)
    expect(outcome.allyAlive).toBe(2)
    expect(outcome.enemyAlive).toBe(1)
    expect(outcome.winner).toBe('ally')
    expect(outcome.trace.events.at(-1)?.text).toContain('按剩余人数判定')
  })

  it('15 秒与 30 秒各膨胀一次', () => {
    const tanky = { ...EMPTY_MODS, hp: 30 }
    const outcome = simulateBattle(
      [fighter('a1', 'liangqiang', 0)],
      [fighter('e1', 'liangqiang', 3)],
      tanky,
      tanky,
    )
    const surges = outcome.trace.events.filter((event) => event.kind === 'surge')
    expect(surges).toHaveLength(3)
    expect(surges[0]?.t).toBeCloseTo(15, 1)
    expect(surges[1]?.t).toBeCloseTo(30, 1)
    expect(surges[0]?.text).toContain('数值膨胀 1')
    expect(surges[1]?.text).toContain('数值膨胀 2')
  })

  it('快速结束的战斗不会触发膨胀', () => {
    const outcome = simulateBattle(
      [fighter('a1', 'miwei', 0), fighter('a2', 'zuoshen', 1)],
      [fighter('e1', 'jingyingqi', 3)],
      EMPTY_MODS,
      EMPTY_MODS,
    )

    expect(outcome.trace.events.some((event) => event.kind === 'surge')).toBe(false)
  })
})