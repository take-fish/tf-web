import { UNIT_DEFS } from './content'
import type { FighterInput } from './combat'
import { hashString, mulberry32, pickIndex } from './rng'
import { BOARD_COLS, coordToCell } from './state'
import type { AnnotationKind } from './state'

const ANNOTATION_KINDS: readonly AnnotationKind[] = ['async', 'retry', 'cache', 'tx']

export interface BotBoard {
  name: string
  units: FighterInput[]
}

/**
 * 对照组集群：按轮次确定性生成，不用随机数表，回放可复现。
 * 轮次越高，允许出现的费用与星级越高。
 */
export function makeBotBoard(seed: number, round: number): BotBoard {
  const rng = mulberry32(hashString(`bot:${seed}:${round}`))
  const maxCost = Math.min(5, 1 + Math.floor(round / 3))
  const count = Math.min(9, 3 + Math.floor(round / 2))
  const star: 1 | 2 | 3 = round >= 12 ? 2 : 1
  const pool = UNIT_DEFS.filter((def) => def.cost <= maxCost)
  const units: FighterInput[] = []
  const used = new Set<number>()

  for (let index = 0; index < count; index += 1) {
    // 越靠后的费用权重越高，模拟"对手也在升级"
    const weights = pool.map((def) => Math.max(1, def.cost * (round >= 8 ? 2 : 1)))
    const def = pool[pickIndex(rng, weights)] ?? pool[0]
    if (!def) break
    const row = 1 + (index % 2)
    const col = Math.min(BOARD_COLS - 2, 1 + (index % (BOARD_COLS - 2)))
    const cell = coordToCell(col, row)
    if (used.has(cell)) continue
    used.add(cell)
    const annotations: AnnotationKind[] = []
    if (rng() < 0.25) annotations.push(ANNOTATION_KINDS[pickIndex(rng, [1, 1, 1, 1])] ?? 'async')
    units.push({
      uid: `enemy-${round}-${index}`,
      defId: def.id,
      star,
      col,
      row,
      annotations,
    })
  }

  return { name: `对照组-${String(round).padStart(2, '0')}`, units }
}

export function makePveBoard(seed: number, round: number): BotBoard {
  const rng = mulberry32(hashString(`pve:${seed}:${round}`))
  const count = 2 + round
  const pool = UNIT_DEFS.filter((def) => def.cost <= 2)
  const units: FighterInput[] = []
  for (let index = 0; index < count; index += 1) {
    const def = pool[pickIndex(rng, pool.map(() => 1))] ?? pool[0]
    if (!def) break
    units.push({
      uid: `pve-${round}-${index}`,
      defId: def.id,
      star: 1,
      col: 1 + (index % 5),
      row: 1 + (index % 2),
      annotations: [],
    })
  }
  return { name: `基准负载-${round}`, units }
}
