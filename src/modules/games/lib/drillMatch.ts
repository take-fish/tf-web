import type { GameRound } from '@/types/games'

/** 容量编排小局：服务端 seed + 双方各自上报，按战绩分判定胜负。 */
export function isDrillRound(round: GameRound | null | undefined): boolean {
  return Boolean(round && round.gameId === 'capacity-drill' && round.drill)
}

export function drillSubmitted(
  round: GameRound | null | undefined,
  userId: string,
): boolean {
  if (!round?.drill || !userId) return false
  return round.drill.reportedUserIds.includes(userId)
}

/** 对手是否已提交（观战者没有对手，返回 false）。 */
export function drillOpponentSubmitted(
  round: GameRound | null | undefined,
  selfId: string,
): boolean {
  if (!round?.drill || !selfId) return false
  return round.drill.reportedUserIds.some((userId) => userId !== selfId)
}

/** 距离小局截止还剩多少秒；没有截止时间时返回 0。 */
export function drillRemaining(
  round: GameRound | null | undefined,
  now: number,
): number {
  const deadline = round?.drill?.deadlineAt || round?.endsAt || 0
  if (!deadline) return 0
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
