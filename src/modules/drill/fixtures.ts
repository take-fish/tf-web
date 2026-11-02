import type {
  AnnotationSlot,
  DrillSnapshot,
  ProposalCard,
  RosterEntry,
  ShopSlot,
  TraitLine,
  UnitNode,
} from './types'

/**
 * 夹具：先用真实内容跑通界面与「截图盲测」，接模拟后整体替换。
 * 名字与亲和组取自内容设计稿，保证界面看起来是同一套业务。
 */

const UNITS: readonly UnitNode[] = [
  {
    id: 'u-liangqiang',
    name: '良强',
    cost: 2,
    star: 2,
    traits: ['小狮达', '架构'],
    col: 2,
    row: 2,
    sli: 100,
    power: 82,
    throughput: 44,
    skill: '预热链路：前 6 秒算力 +12%',
    annotations: ['元注解·@Async'],
  },
  {
    id: 'u-yuetao',
    name: '粤涛',
    cost: 1,
    star: 3,
    traits: ['小狮达', 'AI'],
    col: 3,
    row: 1,
    sli: 100,
    power: 74,
    throughput: 61,
    skill: '推理预热：每 4 秒算力 +8%，上限 3 层',
    annotations: ['元注解·@Retry', '元注解·@Cache'],
  },
  {
    id: 'u-shunfengyao',
    name: '顺风尧',
    cost: 1,
    star: 2,
    traits: ['小狮达', '订单中台'],
    col: 4,
    row: 2,
    sli: 100,
    power: 58,
    throughput: 37,
    skill: '订单聚合：每次校验通过 +2 配额',
    annotations: [],
  },
  {
    id: 'u-hemadeng',
    name: '河马峰',
    cost: 3,
    star: 2,
    traits: ['小狮达', '监工'],
    col: 1,
    row: 1,
    sli: 100,
    power: 91,
    throughput: 52,
    skill: '巡检处决：对 SLI 低于 40% 目标增伤 15%',
    annotations: ['元注解·@Tx'],
  },
  {
    id: 'u-dange',
    name: '蛋哥',
    cost: 3,
    star: 1,
    traits: ['小狮达', '小狮富'],
    col: 5,
    row: 1,
    sli: 100,
    power: 66,
    throughput: 40,
    skill: '资源沉淀：每个 PVE 轮额外下发 1 个元注解',
    annotations: [],
  },
  {
    id: 'u-dashixiong',
    name: '大师兄',
    cost: 4,
    star: 2,
    traits: ['小狮达', '测试'],
    col: 2,
    row: 0,
    sli: 100,
    power: 96,
    throughput: 58,
    skill: '重试保障：首个退役实例 50% 概率恢复',
    annotations: ['元注解·@Async'],
  },
  {
    id: 'u-longge',
    name: '龙哥',
    cost: 4,
    star: 1,
    traits: ['小狮达', '离殇'],
    col: 4,
    row: 0,
    sli: 100,
    power: 79,
    throughput: 47,
    skill: '降级转化：实例退役时对 2 格内目标造成 80 真实伤害',
    annotations: [],
  },
  {
    id: 'u-miwei',
    name: '米威',
    cost: 5,
    star: 2,
    traits: ['小狮达', '架构', '测试'],
    col: 3,
    row: 3,
    sli: 100,
    power: 104,
    throughput: 63,
    skill: '万金油：所在亲和组计数 +1（不叠加）',
    annotations: ['元注解·@Cache'],
  },
]

const TRAITS: readonly TraitLine[] = [
  { id: 'xiaoshida', label: '小狮达', tiers: [3, 6, 9, 10], count: 8 },
  { id: 'order', label: '订单中台', tiers: [2, 4, 7], count: 3 },
  { id: 'arch', label: '架构', tiers: [2, 3, 5], count: 3 },
  { id: 'ai', label: 'AI', tiers: [2, 4, 7], count: 1 },
  { id: 'frontend', label: '前端', tiers: [2, 4, 6], count: 0 },
  { id: 'supervisor', label: '监工', tiers: [2, 3, 4], count: 1 },
  { id: 'rich', label: '小狮富', tiers: [2, 4, 6], count: 1 },
  { id: 'qa', label: '测试', tiers: [2, 4, 6], count: 3 },
  { id: 'sorrow', label: '离殇', tiers: [2, 3, 4], count: 1 },
  { id: 'flash', label: '闪购', tiers: [2, 3, 4], count: 0 },
]

const SHOP: readonly ShopSlot[] = [
  {
    slot: 1,
    unitId: 'u-suifengyao',
    name: '顺风尧',
    cost: 1,
    traits: ['小狮达', '订单中台'],
    locked: false,
    soldOut: false,
  },
  {
    slot: 2,
    unitId: 'u-zuoshen',
    name: '左肾',
    cost: 2,
    traits: ['小狮达', '闪购'],
    locked: false,
    soldOut: false,
  },
  {
    slot: 3,
    unitId: 'u-xiao0zi',
    name: '小0子',
    cost: 3,
    traits: ['闪购', '离殇'],
    locked: false,
    soldOut: false,
  },
  {
    slot: 4,
    unitId: 'u-ade',
    name: '阿德',
    cost: 4,
    traits: ['订单中台', '前端'],
    locked: true,
    soldOut: false,
  },
  {
    slot: 5,
    unitId: 'u-meilin',
    name: '美林',
    cost: 4,
    traits: ['订单中台', '监工'],
    locked: false,
    soldOut: true,
  },
]

const ANNOTATIONS: readonly AnnotationSlot[] = [
  { id: 'a1', label: '@Async', combo: false },
  { id: 'a2', label: '@Retry', combo: false },
  { id: 'a3', label: '@Cache', combo: false },
  { id: 'a4', label: '@Tx', combo: false },
  { id: 'a5', label: '异步补偿', combo: true },
  { id: 'a6', label: '', combo: false },
  { id: 'a7', label: '', combo: false },
  { id: 'a8', label: '', combo: false },
  { id: 'a9', label: '', combo: false },
  { id: 'a10', label: '', combo: false },
]

const ROSTER: readonly RosterEntry[] = [
  { id: 'r2', label: '对照组-02', sli: 68, alive: true },
  { id: 'r3', label: '对照组-03', sli: 41, alive: true },
  { id: 'r4', label: '对照组-04', sli: 96, alive: true },
  { id: 'r5', label: '对照组-05', sli: 77, alive: true },
  { id: 'r6', label: '对照组-06', sli: 55, alive: true },
  { id: 'r7', label: '对照组-07', sli: 0, alive: false },
  { id: 'r8', label: '对照组-08', sli: 100, alive: true },
]

const PROPOSALS: readonly ProposalCard[] = [
  {
    id: 'x3',
    name: '统一网关',
    tier: 'global',
    effect: '所有亲和组档位需求 -1（最低 2），位移后重复阈值去重',
    upside: '收益：档位推进',
    risk: '风险：中间档被合并',
  },
  {
    id: 'x4',
    name: '智能调度',
    tier: 'global',
    effect: '每轮免费重新编排 +2 次',
    upside: '收益：资源周转',
    risk: '风险：无',
  },
  {
    id: 'x6',
    name: '数据中台',
    tier: 'global',
    effect: '每次三合一返还 1 个元注解，每局上限 6 个',
    upside: '收益：注解供给',
    risk: '风险：依赖三合一',
  },
]

const PICKS: readonly ProposalCard[] = [
  {
    id: 's1',
    name: '缓存预热',
    tier: 'local',
    effect: '每轮第一次重新编排不消耗配额',
    upside: '收益：配额',
    risk: '风险：无',
  },
  {
    id: 'g4',
    name: '多活部署',
    tier: 'module',
    effect: '每场首个退役实例以 40% 可用性恢复',
    upside: '收益：续航',
    risk: '风险：每场一次',
  },
]

export function createFixtureSnapshot(): DrillSnapshot {
  return {
    drillName: 'cap-prod-01',
    quotas: 24,
    level: 7,
    round: 12,
    totalRounds: 20,
    sli: 82,
    scale: 8,
    elapsed: 14 * 60 + 32,
    phase: 'PREP',
    units: UNITS,
    benchCount: 9,
    traits: TRAITS,
    shop: SHOP,
    annotations: ANNOTATIONS,
    roster: ROSTER,
    proposals: PROPOSALS,
    picks: PICKS,
    achievement: 2,
  }
}

/** 把秒数格式化成 00:14:32，界面上不出现任何「计时」类游戏词汇。 */
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
