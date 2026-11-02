<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useDrillStore } from '../stores/drill'

const drill = useDrillStore()

const REVIEW_SECONDS = 20
const remaining = ref(REVIEW_SECONDS)
let timer: number | undefined

const cards = computed(() => drill.snapshot.proposals)
const open = computed(() => cards.value.length > 0)

const progress = computed(() => Math.max(0, Math.min(1, remaining.value / REVIEW_SECONDS)))

const tierText: Record<string, string> = { local: '局部', module: '模块', global: '全局' }

function stop() {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
}

function pick(id: string) {
  drill.pickAugment(id)
  stop()
}

watch(
  open,
  (value) => {
    stop()
    if (!value) return
    remaining.value = REVIEW_SECONDS
    timer = window.setInterval(() => {
      remaining.value -= 1
      if (remaining.value > 0) return
      const first = cards.value[0]
      if (first) pick(first.id)
      else stop()
    }, 1000)
  },
  { immediate: true },
)

onBeforeUnmount(stop)
</script>

<template>
  <div v-if="open" class="drill__overlay" role="dialog" aria-modal="true" aria-label="技术方案评审">
    <div class="drill__modal drill__modal--review">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">TECH REVIEW</span>
          <b>技术方案评审 · 第 {{ drill.snapshot.round }} 轮</b>
        </div>
        <div class="drill__review-timer">
          <span>评审窗口 {{ remaining }}s（超时默认 A）</span>
          <span class="drill__progress"><i :style="{ width: `${progress * 100}%` }" /></span>
        </div>
      </header>

      <div class="drill__review-grid">
        <article v-for="(card, index) in cards" :key="card.id" class="drill__review-card">
          <header>
            <span class="drill__review-key">{{ ['A', 'B', 'C'][index] }}</span>
            <b>{{ card.name }}</b>
            <em>影响面：{{ tierText[card.tier] ?? card.tier }}</em>
          </header>
          <p class="drill__review-effect">{{ card.effect }}</p>
          <footer>
            <span>{{ card.upside }}</span>
            <span>{{ card.risk }}</span>
          </footer>
          <button type="button" class="drill__primary" @click="pick(card.id)">
            采纳 {{ ['A', 'B', 'C'][index] }}
          </button>
        </article>
      </div>
    </div>
  </div>
</template>
