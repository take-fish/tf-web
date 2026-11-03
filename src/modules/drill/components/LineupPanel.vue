<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { LINEUP_DEFS, lineupTraits, lineupUnitName } from '../core/lineups'
import type { LineupDef } from '../core/lineups'
import type { AnnotationKind } from '../core/state'
import { useLineupStore } from '../stores/lineup'
import { useDrillUiStore } from '../stores/ui'

const ui = useDrillUiStore()
const lineup = useLineupStore()

const list = computed<readonly LineupDef[]>(() =>
  ui.lineupTab === 'mine' ? lineup.mine : LINEUP_DEFS,
)

const ROWS = ['前排', '中排', '后排'] as const

const ANNOTATION_TEXT: Readonly<Record<AnnotationKind, string>> = {
  async: '@Async',
  retry: '@Retry',
  cache: '@Cacheable',
  tx: '@Tx',
}

function unitsByRow(def: LineupDef) {
  return ROWS.map((row) => ({ row, units: def.units.filter((unit) => unit.row === row) })).filter(
    (group) => group.units.length > 0,
  )
}

function equipLines(def: LineupDef) {
  return def.equip.map((item) => ({
    name: lineupUnitName(item.defId),
    text: item.annotations.map((kind) => ANNOTATION_TEXT[kind]).join(' + '),
  }))
}
</script>

<template>
  <div v-if="ui.lineupOpen" class="drill__overlay" @click.self="ui.closeLineup()">
    <aside class="drill__lineup" role="dialog" aria-modal="true" aria-label="阵容">
      <header class="drill__lineup-head">
        <div>
          <span class="drill__eyebrow">LINEUPS</span>
          <b>阵容</b>
        </div>
        <button type="button" class="drill__icon-btn" aria-label="关闭" @click="ui.closeLineup()">
          <AppIcon name="close" :size="12" />
        </button>
      </header>

      <div class="drill__lineup-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="ui.lineupTab === 'mine'"
          :class="{ 'is-on': ui.lineupTab === 'mine' }"
          @click="ui.lineupTab = 'mine'"
        >
          我的阵容 <em>{{ lineup.mine.length }}</em>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="ui.lineupTab === 'recommended'"
          :class="{ 'is-on': ui.lineupTab === 'recommended' }"
          @click="ui.lineupTab = 'recommended'"
        >
          推荐阵容 <em>{{ LINEUP_DEFS.length }}</em>
        </button>
      </div>

      <p v-if="lineup.active" class="drill__lineup-tip">
        当前使用：<b>{{ lineup.active.name }}</b
        >。资源目录与选型轮盘里出现这套阵容要的实例时，卡片右上角亮红点。
        <button type="button" class="drill__link" @click="lineup.clearActive()">停用</button>
      </p>
      <p v-else class="drill__lineup-tip">
        点「使用」后，本局刷到这套阵容里的实例时，商城卡片和选型轮盘会亮红点提醒。
      </p>

      <ul class="drill__lineup-list">
        <li
          v-for="def in list"
          :key="def.id"
          class="drill__lineup-card"
          :class="{ 'is-active': lineup.activeId === def.id }"
        >
          <header class="drill__lineup-card-head">
            <div>
              <b>{{ def.name }}</b>
              <span class="drill__lineup-tag">{{ def.tag }}</span>
            </div>
            <span class="drill__mono">人口 {{ def.units.length }}</span>
          </header>

          <p class="drill__lineup-summary">{{ def.summary }}</p>

          <div class="drill__lineup-traits">
            <span
              v-for="trait in lineupTraits(def)"
              :key="trait.id"
              :class="{ 'is-on': trait.tier > 0 }"
            >
              {{ trait.label }} {{ trait.count }}/{{ trait.tiers[trait.tiers.length - 1] ?? 0 }}
              <i v-if="trait.tier > 0">{{ trait.tier }} 档</i>
            </span>
          </div>

          <div class="drill__lineup-rows">
            <div v-for="group in unitsByRow(def)" :key="group.row">
              <span class="drill__lineup-row">{{ group.row }}</span>
              <span class="drill__lineup-units">
                {{ group.units.map((unit) => lineupUnitName(unit.defId)).join('、') }}
              </span>
            </div>
          </div>

          <div class="drill__lineup-equip">
            <span class="drill__lineup-row">装备推荐</span>
            <em v-for="line in equipLines(def)" :key="line.name">{{ line.name }}：{{ line.text }}</em>
          </div>

          <footer class="drill__lineup-actions">
            <button type="button" class="drill__ghost" @click="lineup.toggleFavorite(def.id)">
              {{ lineup.isFavorite(def.id) ? '取消收藏' : '收藏' }}
            </button>
            <button type="button" class="drill__primary" @click="lineup.useLineup(def.id)">
              {{ lineup.activeId === def.id ? '取消使用' : '使用' }}
            </button>
          </footer>
        </li>

        <li v-if="list.length === 0" class="drill__lineup-empty">
          还没有收藏的阵容。切到「推荐阵容」，点「收藏」就会出现在这里。
        </li>
      </ul>
    </aside>
  </div>
</template>
