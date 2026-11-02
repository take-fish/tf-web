/**
 * 内容表：36 个实例、10 条亲和组、24 个技术专项。
 * 数值来自《良跑跑-棋子技能设计》《良跑跑-羁绊设计》《良跑跑-技术专项设计》。
 */

export type SkillForm = 'single' | 'line' | 'aoe' | 'buff' | 'sustain'
export type SkillTarget = 'nearest' | 'lowest' | 'highest' | 'self' | 'team'
export type CoefStat = 'atk' | 'ap'
export type TraitId =
  | 'xiaoshida'
  | 'order'
  | 'arch'
  | 'flash'
  | 'ai'
  | 'frontend'
  | 'supervisor'
  | 'rich'
  | 'qa'
  | 'sorrow'

export interface UnitDef {
  id: string
  name: string
  cost: 1 | 2 | 3 | 4 | 5
  traits: readonly TraitId[]
  hp: number
  atk: number
  ap: number
  as: number
  armor: number
  mr: number
  skill: {
    name: string
    form: SkillForm
    target: SkillTarget
    base: number
    coef: number
    stat: CoefStat
    /** 范围半径（AOE / LINE 用） */
    radius: number
    /** buff/sustain 的持续时间（秒） */
    duration: number
  }
}

const COST_STATS: Record<number, { hp: number; atk: number; ap: number; as: number; armor: number; mr: number }> = {
  1: { hp: 550, atk: 55, ap: 40, as: 0.7, armor: 20, mr: 20 },
  2: { hp: 650, atk: 65, ap: 50, as: 0.75, armor: 25, mr: 25 },
  3: { hp: 750, atk: 75, ap: 60, as: 0.8, armor: 30, mr: 30 },
  4: { hp: 900, atk: 90, ap: 75, as: 0.85, armor: 35, mr: 35 },
  5: { hp: 1100, atk: 110, ap: 90, as: 0.9, armor: 40, mr: 40 },
}

function unit(
  id: string,
  name: string,
  cost: 1 | 2 | 3 | 4 | 5,
  traits: readonly TraitId[],
  skill: UnitDef['skill'],
): UnitDef {
  const stats = COST_STATS[cost] ?? COST_STATS[3]!
  return { id, name, cost, traits, ...stats, skill }
}

export const UNIT_DEFS: readonly UnitDef[] = [
  unit('shunfengyao', '顺风尧', 1, ['xiaoshida', 'order'], { name: '灰度放量', form: 'single', target: 'nearest', base: 180, coef: 1.2, stat: 'atk', radius: 0, duration: 0 }),
  unit('yuetao', '粤涛', 1, ['xiaoshida', 'ai'], { name: '预热加载', form: 'buff', target: 'self', base: 20, coef: 0, stat: 'ap', radius: 0, duration: 5 }),
  unit('qiewang', '企鹅王', 1, ['arch', 'ai'], { name: '探活保底', form: 'sustain', target: 'self', base: 220, coef: 0, stat: 'ap', radius: 0, duration: 4 }),
  unit('jingyingqi', '经营齐', 1, ['frontend', 'qa'], { name: '首屏直出', form: 'single', target: 'highest', base: 170, coef: 1.0, stat: 'atk', radius: 0, duration: 0 }),
  unit('yelu', '夜露', 1, ['rich', 'qa'], { name: '缓存回填', form: 'sustain', target: 'lowest', base: 200, coef: 0.08, stat: 'ap', radius: 0, duration: 0 }),
  unit('fayanhao', '发烟豪', 1, ['frontend', 'sorrow'], { name: '摘流', form: 'aoe', target: 'nearest', base: 120, coef: 0.8, stat: 'ap', radius: 1, duration: 0 }),
  unit('kang', '抗', 1, ['flash'], { name: '秒杀兜底', form: 'single', target: 'highest', base: 240, coef: 1.0, stat: 'atk', radius: 0, duration: 0 }),
  unit('meitao', '美涛', 1, ['supervisor'], { name: '熔断', form: 'single', target: 'lowest', base: 240, coef: 1.0, stat: 'atk', radius: 0, duration: 0 }),
  unit('liangqiang', '良强', 2, ['xiaoshida', 'arch'], { name: '扩容', form: 'buff', target: 'team', base: 25, coef: 0, stat: 'ap', radius: 0, duration: 6 }),
  unit('zuoshen', '左肾', 2, ['xiaoshida', 'flash'], { name: '瞬时放量', form: 'single', target: 'nearest', base: 260, coef: 1.3, stat: 'atk', radius: 0, duration: 0 }),
  unit('da0zi', '大0子', 2, ['xiaoshida', 'frontend'], { name: '链路直连', form: 'line', target: 'nearest', base: 200, coef: 1.0, stat: 'atk', radius: 3, duration: 0 }),
  unit('zhentian', '震天', 2, ['order', 'ai'], { name: '订单洪峰', form: 'buff', target: 'team', base: 20, coef: 0, stat: 'atk', radius: 0, duration: 6 }),
  unit('laohuang', '牢黄', 2, ['ai', 'qa'], { name: '重试保底', form: 'sustain', target: 'self', base: 260, coef: 0, stat: 'ap', radius: 0, duration: 4 }),
  unit('weijin', '围巾', 2, ['frontend', 'rich'], { name: '预取', form: 'aoe', target: 'highest', base: 180, coef: 1.1, stat: 'ap', radius: 1, duration: 0 }),
  unit('meiyouzheren', '煤油这人', 2, ['supervisor', 'rich'], { name: '告警升级', form: 'single', target: 'highest', base: 250, coef: 1.2, stat: 'atk', radius: 0, duration: 0 }),
  unit('mangningfeng', '芒柠锋', 2, ['order', 'sorrow'], { name: '削峰填谷', form: 'sustain', target: 'lowest', base: 240, coef: 0.1, stat: 'ap', radius: 0, duration: 0 }),
  unit('hemadeng', '河马峰', 3, ['xiaoshida', 'supervisor'], { name: '巡检处决', form: 'single', target: 'lowest', base: 400, coef: 1.5, stat: 'atk', radius: 0, duration: 0 }),
  unit('dange', '蛋哥', 3, ['xiaoshida', 'rich'], { name: '资源调度', form: 'buff', target: 'team', base: 30, coef: 0, stat: 'ap', radius: 0, duration: 6 }),
  unit('yongqi', '勇气', 3, ['order', 'arch'], { name: '限流', form: 'aoe', target: 'nearest', base: 220, coef: 1.0, stat: 'ap', radius: 1, duration: 3 }),
  unit('yayiwei', '压抑伟', 3, ['order', 'qa'], { name: '压测对齐', form: 'buff', target: 'team', base: 25, coef: 0, stat: 'ap', radius: 0, duration: 5 }),
  unit('yujie', '御姐', 3, ['ai', 'frontend'], { name: '推理加速', form: 'line', target: 'nearest', base: 260, coef: 1.2, stat: 'ap', radius: 3, duration: 0 }),
  unit('zhongliudizhu', '肿瘤地主', 3, ['ai', 'rich'], { name: '缓存预热', form: 'sustain', target: 'team', base: 150, coef: 0.06, stat: 'ap', radius: 0, duration: 0 }),
  unit('xiao0zi', '小0子', 3, ['flash', 'sorrow'], { name: '秒杀洪峰', form: 'aoe', target: 'nearest', base: 300, coef: 1.2, stat: 'ap', radius: 2, duration: 0 }),
  unit('dashixiong', '大师兄', 4, ['xiaoshida', 'qa'], { name: '全链路回归', form: 'aoe', target: 'lowest', base: 450, coef: 1.3, stat: 'atk', radius: 2, duration: 0 }),
  unit('ade', '阿德', 4, ['order', 'frontend'], { name: '首屏接管', form: 'single', target: 'highest', base: 600, coef: 1.8, stat: 'atk', radius: 0, duration: 0 }),
  unit('meilin', '美林', 4, ['order', 'supervisor'], { name: '熔断降级', form: 'single', target: 'lowest', base: 580, coef: 1.6, stat: 'atk', radius: 0, duration: 0 }),
  unit('jimuzeng', '积木曾', 4, ['arch', 'flash'], { name: '弹性伸缩', form: 'sustain', target: 'team', base: 280, coef: 0.08, stat: 'ap', radius: 0, duration: 0 }),
  unit('jingtao', '京涛', 4, ['arch', 'rich'], { name: '地基加固', form: 'buff', target: 'team', base: 40, coef: 0, stat: 'ap', radius: 0, duration: 8 }),
  unit('meiyun', '美云', 4, ['ai', 'supervisor'], { name: '模型寻优', form: 'line', target: 'nearest', base: 420, coef: 1.4, stat: 'ap', radius: 3, duration: 0 }),
  unit('longge', '龙哥', 4, ['xiaoshida', 'sorrow'], { name: '摘流回滚', form: 'aoe', target: 'lowest', base: 400, coef: 1.2, stat: 'ap', radius: 2, duration: 0 }),
  unit('beiyao', '北垚', 5, ['xiaoshida', 'sorrow'], { name: '灰度回滚·全量', form: 'aoe', target: 'lowest', base: 700, coef: 1.6, stat: 'ap', radius: 2, duration: 0 }),
  unit('guozong', '郭总', 5, ['ai', 'sorrow'], { name: '双活切换', form: 'sustain', target: 'team', base: 280, coef: 0, stat: 'ap', radius: 0, duration: 0 }),
  unit('miwei', '米威', 5, ['xiaoshida', 'arch', 'qa'], { name: '全链路压测', form: 'buff', target: 'team', base: 25, coef: 0, stat: 'atk', radius: 0, duration: 8 }),
  unit('depang', '德旁', 5, ['order', 'rich', 'qa'], { name: '资源编排', form: 'aoe', target: 'highest', base: 600, coef: 1.4, stat: 'ap', radius: 2, duration: 0 }),
  unit('buxiaode', '布晓得', 5, ['order', 'flash'], { name: '秒杀兜底·终局', form: 'single', target: 'highest', base: 850, coef: 2.0, stat: 'atk', radius: 0, duration: 0 }),
  unit('meide', '媚得', 5, ['frontend', 'supervisor'], { name: '告警终结', form: 'single', target: 'lowest', base: 800, coef: 1.8, stat: 'atk', radius: 0, duration: 0 }),
]

export const UNIT_BY_ID: Readonly<Record<string, UnitDef>> = Object.fromEntries(
  UNIT_DEFS.map((def) => [def.id, def]),
)

export interface TraitEffect {
  atk?: number
  as?: number
  ap?: number
  armor?: number
  mr?: number
  hp?: number
  goldPerRound?: number
  interestCap?: number
  onHitFlat?: number
  executeBonus?: number
  reviveRatio?: number
  deathAoe?: number
}

export interface TraitDef {
  id: TraitId
  label: string
  tiers: readonly number[]
  /** 与 tiers 等长，第 n 项是达成该档时的全队效果 */
  effects: readonly TraitEffect[]
}

export const TRAIT_DEFS: readonly TraitDef[] = [
  {
    id: 'xiaoshida',
    label: '小狮达',
    tiers: [3, 6, 9, 10],
    effects: [{ atk: 0.12 }, { atk: 0.2, as: 0.12 }, { atk: 0.3, as: 0.2 }, { atk: 0.4, as: 0.25 }],
  },
  {
    id: 'order',
    label: '订单中台',
    tiers: [2, 4, 7],
    effects: [{ goldPerRound: 1 }, { goldPerRound: 2, interestCap: 2 }, { goldPerRound: 5, interestCap: 4 }],
  },
  {
    id: 'arch',
    label: '架构',
    tiers: [2, 3, 5],
    effects: [{ armor: 20, mr: 20 }, { armor: 35, mr: 35 }, { armor: 60, mr: 60 }],
  },
  {
    id: 'flash',
    label: '闪购',
    tiers: [2, 3, 4],
    effects: [{ as: 0.1 }, { as: 0.15 }, { as: 0.25 }],
  },
  {
    id: 'ai',
    label: 'AI',
    tiers: [2, 4, 7],
    effects: [{ ap: 0.15 }, { ap: 0.3 }, { ap: 0.5, as: 0.2 }],
  },
  {
    id: 'frontend',
    label: '前端',
    tiers: [2, 4, 6],
    effects: [{ onHitFlat: 8 }, { onHitFlat: 16 }, { onHitFlat: 28 }],
  },
  {
    id: 'supervisor',
    label: '监工',
    tiers: [2, 3, 4],
    effects: [{ executeBonus: 0.15 }, { executeBonus: 0.25 }, { executeBonus: 0.4 }],
  },
  {
    id: 'rich',
    label: '小狮富',
    tiers: [2, 4, 6],
    effects: [{ goldPerRound: 1 }, { goldPerRound: 2 }, { goldPerRound: 4 }],
  },
  {
    id: 'qa',
    label: '测试',
    tiers: [2, 4, 6],
    effects: [{ reviveRatio: 0.3 }, { reviveRatio: 0.4 }, { reviveRatio: 0.5 }],
  },
  {
    id: 'sorrow',
    label: '离殇',
    tiers: [2, 3, 4],
    effects: [{ deathAoe: 60 }, { deathAoe: 120 }, { deathAoe: 200 }],
  },
]

export const TRAIT_BY_ID: Readonly<Record<string, TraitDef>> = Object.fromEntries(
  TRAIT_DEFS.map((def) => [def.id, def]),
)

export type AugmentTier = 'silver' | 'gold' | 'prismatic'

export interface AugmentDef {
  id: string
  name: string
  tier: AugmentTier
  /** 影响面：局部 / 模块 / 全局，对应 UI 上的影响面标签 */
  scope: 'local' | 'module' | 'global'
  effect: string
  upside: string
  risk: string
}

export const AUGMENT_DEFS: readonly AugmentDef[] = [
  { id: 'S1', name: '缓存预热', tier: 'silver', scope: 'local', effect: '每轮第一次刷新不消耗配额', upside: '收益：配额', risk: '风险：无' },
  { id: 'S2', name: '弹性额度', tier: 'silver', scope: 'local', effect: '利息上限 5 → 6（与订单中台叠加封顶 8）', upside: '收益：利息', risk: '风险：无' },
  { id: 'S3', name: '冷启动优化', tier: 'silver', scope: 'local', effect: '每个 PVE 轮额外掉落 1 个元注解', upside: '收益：注解', risk: '风险：无' },
  { id: 'S4', name: '灰度发布', tier: 'silver', scope: 'local', effect: '3 费出现概率 +5%', upside: '收益：中期补强', risk: '风险：低费变薄' },
  { id: 'S5', name: '监控补点', tier: 'silver', scope: 'local', effect: '战斗开始后 8 秒内全队攻速 +8%', upside: '收益：快攻', risk: '风险：无' },
  { id: 'S6', name: '巡检自动化', tier: 'silver', scope: 'local', effect: '第 3/6/9/12/15/18 轮各 +2 配额', upside: '收益：经济', risk: '风险：无' },
  { id: 'S7', name: '依赖收敛', tier: 'silver', scope: 'local', effect: '每局第一次拆卸不消耗配额', upside: '收益：转型', risk: '风险：仅一次' },
  { id: 'S8', name: '小流量验证', tier: 'silver', scope: 'local', effect: 'PVE 轮失败不扣 SLI', upside: '收益：容错', risk: '风险：PVE 才生效' },
  { id: 'G1', name: '链路复用', tier: 'gold', scope: 'module', effect: '计数最高的亲和组 +1（受上场人数限制）', upside: '收益：补位', risk: '风险：不能破顶' },
  { id: 'G2', name: '限流降级', tier: 'gold', scope: 'module', effect: '战斗前 6 秒敌方攻速 -12%', upside: '收益：快攻', risk: '风险：短窗口' },
  { id: 'G3', name: '日志采样', tier: 'gold', scope: 'module', effect: '每轮 +3 配额，利息上限 -2', upside: '收益：现金流', risk: '风险：利息变薄' },
  { id: 'G4', name: '多活部署', tier: 'gold', scope: 'module', effect: '每场第一个阵亡单位以 40% 生命复活', upside: '收益：续航', risk: '风险：每场一次' },
  { id: 'G5', name: '依赖治理', tier: 'gold', scope: 'module', effect: '4 费出现概率 +4%', upside: '收益：后期成型', risk: '风险：低费变薄' },
  { id: 'G6', name: '压测准入', tier: 'gold', scope: 'module', effect: '战斗前 10 秒全队伤害 +10%', upside: '收益：爆发', risk: '风险：后程乏力' },
  { id: 'G7', name: '容量规划', tier: 'gold', scope: 'module', effect: '待命席 +3 格（9 → 12）', upside: '收益：周转', risk: '风险：无' },
  { id: 'G8', name: '灰度切流', tier: 'gold', scope: 'module', effect: '全队受到的范围伤害 -12%', upside: '收益：抗 AOE', risk: '风险：单体无效' },
  { id: 'X1', name: '同城双活', tier: 'prismatic', scope: 'global', effect: 'SLI 归零时恢复到 20 点，每局一次', upside: '收益：保命', risk: '风险：仅一次' },
  { id: 'X2', name: '预算池化', tier: 'prismatic', scope: 'global', effect: '利息 = floor(配额/10)，取消上限', upside: '收益：复利', risk: '风险：前期更穷' },
  { id: 'X3', name: '统一网关', tier: 'prismatic', scope: 'global', effect: '所有档位阈值 -1，最低 2', upside: '收益：成型更快', risk: '风险：中间档合并' },
  { id: 'X4', name: '智能调度', tier: 'prismatic', scope: 'global', effect: '每轮免费刷新 +2 次', upside: '收益：周转', risk: '风险：无' },
  { id: 'X5', name: '全链路压测', tier: 'prismatic', scope: 'global', effect: '全队伤害 +15%，受到伤害 +10%', upside: '收益：输出', risk: '风险：更脆' },
  { id: 'X6', name: '数据中台', tier: 'prismatic', scope: 'global', effect: '每次三合一返还 1 个元注解，每局上限 6', upside: '收益：注解供给', risk: '风险：依赖三合一' },
  { id: 'X7', name: '熔断兜底', tier: 'prismatic', scope: 'global', effect: '战斗 12 秒后全队每秒回复 2.5% 最大生命', upside: '收益：续航', risk: '风险：后程才生效' },
  { id: 'X8', name: '单元化改造', tier: 'prismatic', scope: 'global', effect: '上场人口 +1（L9 时 10 人口）', upside: '收益：人口', risk: '风险：无' },
]

export const AUGMENT_BY_ID: Readonly<Record<string, AugmentDef>> = Object.fromEntries(
  AUGMENT_DEFS.map((def) => [def.id, def]),
)

/** 商店各等级的费用概率（1..5 费），与《经济与节奏设计》一致。 */
export const SHOP_ODDS: Readonly<Record<number, readonly number[]>> = {
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [20, 35, 35, 9, 1],
  8: [15, 25, 35, 20, 5],
  9: [10, 15, 25, 30, 20],
}

export const XP_TABLE: Readonly<Record<number, number>> = { 3: 6, 4: 10, 5: 16, 6: 22, 7: 30, 8: 60 }

export const POOL_COUNTS: Readonly<Record<number, number>> = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 10 }
