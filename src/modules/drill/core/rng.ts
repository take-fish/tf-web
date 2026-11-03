/** 确定性随机：同 seed 同结果，回放与测试都依赖它。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function pickIndex(rng: () => number, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return 0
  let roll = rng() * total
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index] ?? 0
    if (roll < 0) return index
  }
  return weights.length - 1
}
