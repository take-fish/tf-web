<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { KnockoutMatch } from '../api/knockout'
import { useDrillKnockoutStore } from '../stores/knockout'

const props = defineProps<{ roomId: string }>()
const emit = defineEmits<{
  play: [payload: { matchId: string; game: number; seed: number }]
  close: []
}>()

const knockout = useDrillKnockoutStore()
const now = ref(Date.now())
let timer: number | undefined

const roundNames = ['八强', '四强', '决赛']

const rounds = computed(() => knockout.bracket?.rounds ?? [])

const championName = computed(() => {
  const id = knockout.champion
  if (!id) return ''
  for (const match of knockout.matches) {
    if (match.playerA?.userId === id) return match.playerA.nickname
    if (match.playerB?.userId === id) return match.playerB.nickname
  }
  return id
})

const selfReported = computed(() => {
  const match = knockout.selfMatch
  if (!match) return false
  const isA = match.playerA?.userId === knockout.selfId
  return isA ? match.reportedA : match.reportedB
})

const prepLeft = computed(() => {
  const match = knockout.selfMatch
  if (!match || !match.prepEndsAt) return null
  return Math.max(0, Math.ceil((match.prepEndsAt - now.value) / 1000))
})

function playerName(match: KnockoutMatch, side: 'a' | 'b'): string {
  return (side === 'a' ? match.playerA : match.playerB)?.nickname ?? '待定'
}

function isWinner(match: KnockoutMatch, side: 'a' | 'b'): boolean {
  const player = side === 'a' ? match.playerA : match.playerB
  return !!match.winner && match.winner === player?.userId
}

function isLive(match: KnockoutMatch): boolean {
  return !match.winner && !!match.playerA && !!match.playerB
}

async function startBracket() {
  const ok = await knockout.start(props.roomId)
  if (ok) now.value = Date.now()
}

onMounted(async () => {
  await knockout.load(props.roomId)
  timer = window.setInterval(async () => {
    now.value = Date.now()
    if (!knockout.bracket) await knockout.load(props.roomId)
    else await knockout.refresh()
  }, 2000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="drill__overlay" role="dialog" aria-modal="true" aria-label="淘汰赛对阵">
    <div class="drill__modal drill__modal--knockout">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">KNOCKOUT</span>
          <b>淘汰赛 · 八进四 BO3 / 四强与决赛 BO5</b>
        </div>
        <button type="button" class="drill__ghost" @click="emit('close')">收起</button>
      </header>

      <div v-if="knockout.error" class="drill__knockout-error">{{ knockout.error }}</div>

      <div v-if="!knockout.bracket" class="drill__knockout-empty">
        <p>排位赛已结束，按名次播种八强：1v8、4v5、3v6、2v7。</p>
        <button type="button" class="drill__primary" :disabled="knockout.loading" @click="startBracket">
          开启淘汰赛
        </button>
        <p class="drill__hint">需要 8 名选手；不足 8 人时暂不能开赛。</p>
      </div>

      <template v-else>
        <div v-if="knockout.champion" class="drill__knockout-champion">
          🏆 冠军：{{ championName }}
        </div>

        <div class="drill__bracket">
          <section v-for="(round, index) in rounds" :key="index" class="drill__bracket-round">
            <h4>{{ roundNames[index] }}</h4>
            <article
              v-for="match in round"
              :key="match.id"
              class="drill__bracket-match"
              :class="{ 'is-live': isLive(match), 'is-mine': knockout.isMine(match) }"
            >
              <div class="drill__bracket-player" :class="{ 'is-winner': isWinner(match, 'a') }">
                <span>{{ playerName(match, 'a') }}</span>
                <b>{{ match.winsA }}</b>
              </div>
              <div class="drill__bracket-player" :class="{ 'is-winner': isWinner(match, 'b') }">
                <span>{{ playerName(match, 'b') }}</span>
                <b>{{ match.winsB }}</b>
              </div>
              <footer>
                <span>BO{{ match.bestOf }} · 第 {{ match.game }} 局</span>
                <span v-if="match.winner">已结束</span>
                <span v-else-if="isLive(match)" class="drill__bracket-live">进行中</span>
              </footer>
            </article>
            <p v-if="round.length === 0" class="drill__hint">上一轮结束后自动生成</p>
          </section>
        </div>

        <footer class="drill__knockout-actions">
          <template v-if="knockout.selfMatch">
            <span class="drill__knockout-meta">
              你的对局 · 第 {{ knockout.selfMatch.game }} 局
              <em v-if="prepLeft !== null">· 备战 {{ prepLeft }}s</em>
            </span>
            <button
              type="button"
              class="drill__primary"
              :disabled="selfReported"
              @click="
                emit('play', {
                  matchId: knockout.selfMatch.id,
                  game: knockout.selfMatch.game,
                  seed: knockout.selfMatch.seed,
                })
              "
            >
              {{ selfReported ? '已上报，等待对手' : `进入第 ${knockout.selfMatch.game} 局` }}
            </button>
          </template>
          <span v-else-if="knockout.champion" class="drill__knockout-meta">本局结束，冠军已产生。</span>
          <span v-else-if="knockout.hasLost" class="drill__knockout-meta">
            你已被淘汰，可继续观战。
          </span>
          <span v-else class="drill__knockout-meta">等待其他场次结束…</span>
        </footer>
      </template>
    </div>
  </div>
</template>
