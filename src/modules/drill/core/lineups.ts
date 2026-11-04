import { TRAIT_BY_ID, UNIT_BY_ID } from './content'
import type { SuggestedRow, TraitId } from './content'
import type { AnnotationKind } from './state'

/**
 * 推荐阵容。
 *
 * 一套阵容 = 人口（单位数）+ 亲和组（由单位自动统计）+ 站位 + 注解推荐。
 * 亲和组不手写，避免和 content.ts 里的成员表对不上。
 */

export interface LineupUnit {
  defId: string
  row: SuggestedRow
}

export interface LineupEquip {
  defId: string
  /** 推荐的两件元注解 */
  annotations: readonly AnnotationKind[]
}

export interface LineupDef {
  id: string
  name: string
  /** 快攻 / 运营 / 法系 / 经济 / 献祭 */
  tag: string
  summary: string
  units: readonly LineupUnit[]
  equip: readonly LineupEquip[]
}

export interface LineupTraitLine {
  id: TraitId
  label: string
  count: number
  tier: number
  tiers: readonly number[]
}


export const LINEUP_DEFS: readonly LineupDef[] = [
  {
    id: 'xiaoshida-rush',
    name: '小狮达冲锋',
    tag: '快攻',
    summary: '8 人口成型，前排顶住、米威与左肾负责输出，靠小狮达 6 档的攻速把节奏拉快。',
    units: [
      { defId: 'hemadeng', row: '前排' },
      { defId: 'shunfengyao', row: '前排' },
      { defId: 'dashixiong', row: '前排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'yuetao', row: '中排' },
      { defId: 'baoyanlong', row: '中排' },
      { defId: 'miwei', row: '后排' },
      { defId: 'jingtao', row: '后排' },
    ],
    equip: [
      { defId: 'miwei', annotations: ['async', 'retry'] },
      { defId: 'zuoshen', annotations: ['retry', 'cache'] },
    ],
  },
  {
    id: 'xiaozhao-core',
    name: '笑照多核',
    tag: '运营',
    summary: '9 人口大成，笑照 8 档堆攻速与生命，劳模德主输出，佳妹吃满注解后接管后期。',
    units: [
      { defId: 'dashixiong', row: '前排' },
      { defId: 'laomode', row: '后排' },
      { defId: 'xiao0zi', row: '中排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'jiamei', row: '后排' },
      { defId: 'zhangtianshi', row: '后排' },
      { defId: 'ganbu', row: '中排' },
      { defId: 'dingshuoai', row: '中排' },
      { defId: 'laohuang', row: '后排' },
    ],
    equip: [
      { defId: 'laomode', annotations: ['cache', 'tx'] },
      { defId: 'jiamei', annotations: ['async', 'cache'] },
    ],
  },
  {
    id: 'ai-backline',
    name: 'AI 后排',
    tag: '法系',
    summary: '8 人口，AI 6 档把法强堆满，御姐与张天师直线穿后排，企鹅王吃伤害拖时间。',
    units: [
      { defId: 'qiewang', row: '前排' },
      { defId: 'dingshuoai', row: '中排' },
      { defId: 'yuetao', row: '中排' },
      { defId: 'laomode', row: '中排' },
      { defId: 'yujie', row: '后排' },
      { defId: 'zhangtianshi', row: '后排' },
      { defId: 'meiyun', row: '后排' },
      { defId: 'laohuang', row: '后排' },
    ],
    equip: [
      { defId: 'yujie', annotations: ['cache', 'async'] },
      { defId: 'zhangtianshi', annotations: ['cache', 'retry'] },
    ],
  },
  {
    id: 'order-economy',
    name: '订单经济',
    tag: '经济',
    summary: '9 人口，订单中心 6 档每轮多 4 配额，靠经济滚雪球，美林收残局。',
    units: [
      { defId: 'dashixiong', row: '前排' },
      { defId: 'zhentian', row: '中排' },
      { defId: 'meilin', row: '中排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'yayiwei', row: '中排' },
      { defId: 'laomode', row: '后排' },
      { defId: 'mangningfeng', row: '后排' },
      { defId: 'yongqi', row: '后排' },
      { defId: 'jiamei', row: '后排' },
    ],
    equip: [
      { defId: 'meilin', annotations: ['retry', 'tx'] },
      { defId: 'jiamei', annotations: ['async', 'cache'] },
    ],
  },
  {
    id: 'sorrow-sacrifice',
    name: '离殇献祭',
    tag: '献祭',
    summary: '8 人口速成，离殇 4 档阵亡炸场，围巾与尾灯楠顶住前排，小0子与劳模德收人头。',
    units: [
      { defId: 'weijin', row: '前排' },
      { defId: 'baoyanlong', row: '中排' },
      { defId: 'ganbu', row: '中排' },
      { defId: 'fayanhao', row: '中排' },
      { defId: 'xiao0zi', row: '中排' },
      { defId: 'yuetao', row: '中排' },
      { defId: 'laomode', row: '后排' },
      { defId: 'weidengnan', row: '后排' },
    ],
    equip: [
      { defId: 'xiao0zi', annotations: ['cache', 'cache'] },
      { defId: 'baoyanlong', annotations: ['cache', 'async'] },
    ],
  },
  {
    id: 'qa-retry',
    name: '测试重试',
    tag: '续航',
    summary: '8 人口，测试 2 件套让围巾/尾灯楠各自重试一次，笑照 5 档撑中期，靠反复起身拖垮对手。',
    units: [
      { defId: 'weijin', row: '前排' },
      { defId: 'weidengnan', row: '前排' },
      { defId: 'dashixiong', row: '前排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'laomode', row: '中排' },
      { defId: 'ganbu', row: '中排' },
      { defId: 'dingshuoai', row: '后排' },
      { defId: 'zhangtianshi', row: '后排' },
    ],
    equip: [
      { defId: 'weijin', annotations: ['cache', 'retry'] },
      { defId: 'weidengnan', annotations: ['retry', 'async'] },
    ],
  },
  {
    id: 'arch-wall',
    name: '架构防线',
    tag: '防御',
    summary: '8 人口，架构 4 档给四名架构成员 +40 双抗，冠寓 3 档补生命，拖到御姐与张天师第二轮技能。',
    units: [
      { defId: 'qilianhao', row: '前排' },
      { defId: 'qiewang', row: '前排' },
      { defId: 'dashixiong', row: '前排' },
      { defId: 'dingshuoai', row: '中排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'zhangtianshi', row: '后排' },
      { defId: 'yujie', row: '后排' },
      { defId: 'liangqiang', row: '后排' },
    ],
    equip: [
      { defId: 'liangqiang', annotations: ['tx', 'async'] },
      { defId: 'dashixiong', annotations: ['retry', 'cache'] },
    ],
  },
  {
    id: 'supervisor-execute',
    name: '监工处决',
    tag: '处决',
    summary: '8 人口，宫斗 2 + 监工 3 让三名成员获得 +60% 残血增伤，美涛/上祝/野露洁集火逐个点杀。',
    units: [
      { defId: 'meitao', row: '前排' },
      { defId: 'shangzhu', row: '前排' },
      { defId: 'dashixiong', row: '前排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'dingshuoai', row: '中排' },
      { defId: 'zhangtianshi', row: '后排' },
      { defId: 'laomode', row: '后排' },
      { defId: 'yelujie', row: '后排' },
    ],
    equip: [
      { defId: 'yelujie', annotations: ['async', 'cache'] },
      { defId: 'meitao', annotations: ['retry', 'tx'] },
    ],
  },
  {
    id: 'frontend-onhit',
    name: '前端附伤',
    tag: '普攻',
    summary: '8 人口，前端 4 档让四名前端成员普攻附带 24 法伤，学姐与皮皮靠高攻速把附伤打满。',
    units: [
      { defId: 'jingyingqi', row: '前排' },
      { defId: 'pipi', row: '前排' },
      { defId: 'dashixiong', row: '前排' },
      { defId: 'xuejie', row: '中排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'fayanhao', row: '中排' },
      { defId: 'laomode', row: '后排' },
      { defId: 'xiao0zi', row: '后排' },
    ],
    equip: [
      { defId: 'xuejie', annotations: ['async', 'retry'] },
      { defId: 'fayanhao', annotations: ['async', 'tx'] },
    ],
  },
  {
    id: 'flash-rush',
    name: '闪购爆发',
    tag: '快攻',
    summary: '8 人口，闪购 4 档给四名闪购成员 +20% 攻速/+10% 攻击，小0子与米威在 15 秒膨胀前打出第一波爆发。',
    units: [
      { defId: 'kang', row: '前排' },
      { defId: 'jimuzeng', row: '中排' },
      { defId: 'shunfengyao', row: '前排' },
      { defId: 'hemadeng', row: '前排' },
      { defId: 'dashixiong', row: '前排' },
      { defId: 'zuoshen', row: '中排' },
      { defId: 'xiao0zi', row: '中排' },
      { defId: 'miwei', row: '后排' },
    ],
    equip: [
      { defId: 'xiao0zi', annotations: ['cache', 'cache'] },
      { defId: 'miwei', annotations: ['async', 'retry'] },
    ],
  },
]

export function lineupTraits(lineup: LineupDef): LineupTraitLine[] {
  const counts = new Map<string, number>()
  for (const unit of lineup.units) {
    const def = UNIT_BY_ID[unit.defId]
    if (!def) continue
    for (const trait of def.traits) counts.set(trait, (counts.get(trait) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => {
      const def = TRAIT_BY_ID[id]
      return {
        id: id as TraitId,
        label: def?.label ?? id,
        count,
        tier: (def?.tiers ?? []).filter((tier) => count >= tier).length,
        tiers: def?.tiers ?? [],
      }
    })
    .sort((a, b) => b.tier - a.tier || b.count - a.count)
}

export function lineupUnitName(defId: string): string {
  return UNIT_BY_ID[defId]?.name ?? defId
}
