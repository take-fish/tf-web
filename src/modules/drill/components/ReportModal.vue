<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()
const router = useRouter()

const snapshot = computed(() => drill.snapshot)
const battle = computed(() => snapshot.value.battle)
const bracketOpen = ref(false)

const seeds = computed(() =>
  [...(snapshot.value.standings ?? [])]
    .sort((a, b) => b.wins * 3 + b.draws - (a.wins * 3 + a.draws) || b.wins - a.wins || a.losses - b.losses)
    .map((row, index) => ({ ...row, rank: index + 1 })),
)

const bracket = computed(() => {
  const list = seeds.value
  const pairs = [
    [list[0], list[7]],
    [list[1], list[6]],
    [list[2], list[5]],
    [list[3], list[4]],
  ].filter((pair): pair is [typeof list[number], typeof list[number]] => !!pair[0] && !!pair[1])
  return pairs
})

const curvePoints = computed(() => {
  const curve = battle.value?.curve ?? []
  if (curve.length < 2) return ''
  const step = 100 / (curve.length - 1)
  return curve
    .map((value, index) => `${(index * step).toFixed(1)},${(100 - value * 100).toFixed(1)}`)
    .join(' ')
})

function backToWorkbench() {
  ui.closeReport()
  void router.push('/games')
}

function replay() {
  ui.closeReport()
  drill.restart()
}
</script>

<template>
  <div v-if="ui.reportOpen" class="drill__overlay" role="dialog" aria-modal="true" aria-label="稳态报告">
    <div class="drill__modal drill__modal--report">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">STEADY-STATE REPORT</span>
          <b>稳态报告 · {{ snapshot.drillName }}</b>
        </div>
      </header>

      <dl class="drill__report-rows">
        <div><dt>亲和组达成</dt><dd>{{ snapshot.achievement }}</dd></div>
        <div v-if="!snapshot.tournament"><dt>最终 SLI</dt><dd>{{ snapshot.sli }}</dd></div>
        <div v-if="snapshot.tournament"><dt>战绩</dt><dd>{{ snapshot.record.wins }} 胜 / {{ snapshot.record.losses }} 负 / {{ snapshot.record.draws }} 平</dd></div>
        <div v-if="snapshot.placement"><dt>名次</dt><dd>第 {{ snapshot.placement }} 名</dd></div>
        <div v-if="snapshot.matchPoints !== null"><dt>积分</dt><dd>{{ snapshot.matchPoints.toFixed(1) }}</dd></div>
        <div><dt>轮次</dt><dd>{{ snapshot.round }} / {{ snapshot.totalRounds }}</dd></div>
        <div><dt>配额结余</dt><dd>{{ snapshot.quotas }}</dd></div>
        <div><dt>人口</dt><dd>{{ snapshot.scale }} / {{ snapshot.popCap }}</dd></div>
        <div><dt>注解</dt><dd>{{ snapshot.annotations.filter((slot) => slot.label !== '').length }}</dd></div>
      </dl>

      <div v-if="snapshot.tournament" class="drill__report-block">
        <span>种子排名 · 战绩榜</span>
        <ol class="drill__seeds">
          <li v-for="seed in seeds" :key="seed.name" :class="{ 'is-self': seed.self }">
            <b>{{ seed.rank }}</b>
            <span>{{ seed.self ? '我' : seed.name }}</span>
            <em>{{ seed.wins }}-{{ seed.losses }}-{{ seed.draws }}</em>
            <i>{{ seed.wins * 3 + seed.draws }}</i>
          </li>
        </ol>
        <p v-if="snapshot.reward" class="drill__reward-line">
          奖励已入装备栏：已合成装备 ×{{ snapshot.reward.items }} · 配额 +{{ snapshot.reward.quota }}
        </p>
        <button type="button" class="drill__ghost" @click="bracketOpen = !bracketOpen">
          {{ bracketOpen ? '收起对阵图' : '查看八强对阵图' }}
        </button>
        <div v-if="bracketOpen" class="drill__bracket">
          <div v-for="(pair, index) in bracket" :key="index" class="drill__bracket-match">
            <span class="drill__bracket-tag">八进四 · BO3 · 第 {{ index + 1 }} 场</span>
            <div class="drill__bracket-side"><b>{{ pair[0].rank }}</b> {{ pair[0].self ? '我' : pair[0].name }}</div>
            <div class="drill__bracket-side"><b>{{ pair[1].rank }}</b> {{ pair[1].self ? '我' : pair[1].name }}</div>
          </div>
          <p class="drill__bracket-note">四进二 BO5：一八胜者 vs 四五胜者；二七胜者 vs 三四胜者；决赛 BO5 复用决赛播报。</p>
        </div>
      </div>

      <div v-if="battle" class="drill__report-block">
        <span>最后一场 · {{ battle.opponent }}（{{ battle.mode }}）</span>
        <p>
          {{ battle.won ? '通过' : '未通过' }}
          <template v-if="!snapshot.tournament"> · SLI {{ battle.sliBefore }} → {{ battle.sliAfter }}</template>
          · 剩余实例 {{ battle.survivors }}
        </p>
        <svg class="drill__curve" viewBox="0 0 100 100" preserveAspectRatio="none" v-if="curvePoints">
          <polyline :points="curvePoints" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </div>

      <div class="drill__report-block">
        <span>亲和组</span>
        <p>
          {{
            snapshot.traits
              .filter((trait) => trait.count > 0)
              .map((trait) => `${trait.label} ${trait.count}`)
              .join(' · ')
          }}
        </p>
      </div>

      <div class="drill__report-block">
        <span>技术方案</span>
        <p>{{ snapshot.picks.map((card) => card.name).join(' · ') || '未采纳' }}</p>
      </div>

      <div class="drill__report-block">
        <span>轮次记录</span>
        <ul class="drill__history">
          <li v-for="(entry, index) in snapshot.history.slice(-6)" :key="index">
            R{{ entry.round }} · {{ entry.text }}
          </li>
        </ul>
      </div>

      <div class="drill__report-actions">
        <button type="button" class="drill__ghost" @click="replay">复盘</button>
        <button type="button" class="drill__primary" @click="backToWorkbench">返回工作台</button>
      </div>
    </div>
  </div>
</template>
