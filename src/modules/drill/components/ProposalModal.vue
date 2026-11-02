<script setup lang="ts">
import { computed } from 'vue'

import { useProposalStore } from '../stores/proposal'

const proposal = useProposalStore()

const tierLabel = computed<Record<string, string>>(() => ({
  local: '局部',
  module: '模块',
  global: '全局',
}))

function tierText(tier: string): string {
  return tierLabel.value[tier] ?? tier
}
</script>

<template>
  <div v-if="proposal.open" class="drill__overlay" role="dialog" aria-modal="true" aria-label="技术方案评审">
    <div class="drill__modal drill__modal--review">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">TECH REVIEW</span>
          <b>技术方案评审 · 第 {{ proposal.round }} 轮</b>
        </div>
        <div class="drill__review-timer">
          <span>评审窗口 {{ proposal.remainingSeconds }}s（超时默认 A）</span>
          <span class="drill__progress"><i :style="{ width: `${proposal.progress * 100}%` }" /></span>
        </div>
      </header>

      <div class="drill__review-grid">
        <article v-for="(card, index) in proposal.cards" :key="card.id" class="drill__review-card">
          <header>
            <span class="drill__review-key">{{ ['A', 'B', 'C'][index] }}</span>
            <b>{{ card.name }}</b>
            <em>影响面：{{ tierText(card.tier) }}</em>
          </header>
          <p class="drill__review-effect">{{ card.effect }}</p>
          <footer>
            <span>{{ card.upside }}</span>
            <span>{{ card.risk }}</span>
          </footer>
          <button type="button" class="drill__primary" @click="proposal.pick(card.id)">
            采纳 {{ ['A', 'B', 'C'][index] }}
          </button>
        </article>
      </div>
    </div>
  </div>
</template>
