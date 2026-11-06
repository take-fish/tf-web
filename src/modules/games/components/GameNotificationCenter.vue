<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchTournamentRoom } from '@/modules/drill/api/rooms'
import { useTournamentStore } from '@/stores/tournament'

const store = useTournamentStore()
const route = useRoute()
const router = useRouter()

let championTimer: ReturnType<typeof setTimeout> | undefined

function clearChampionTimer() {
  if (championTimer) {
    clearTimeout(championTimer)
    championTimer = undefined
  }
}

watch(
  () => store.championNotification?.id,
  (id) => {
    clearChampionTimer()
    if (!id) return
    championTimer = setTimeout(() => {
      store.dismissChampion()
    }, 12_000)
  },
)

/**
 * 用户已经在执行页/观战窗口看这场决赛，或本人就是决赛选手时，
 * 不再用全屏弹窗盖住他自己的对局——他们本来就在“查看执行”。
 */
watchEffect(() => {
  const notification = store.finalNotification
  if (!notification) return
  if (!notification.matchId) {
    // 良跑跑方案赛：决赛在演练房间里打，已经在房间页时不再叠一层全屏弹窗。
    const inDrillRoom =
      route.path === '/games/autochess' && typeof route.query.room === 'string'
    if (inDrillRoom) store.dismissFinal()
    return
  }
  const drillMatchId = typeof route.query.match === 'string' ? route.query.match : null
  const watchMatchId = typeof route.query.watch === 'string' ? route.query.watch : null
  const alreadyThere =
    (route.path === '/games/autochess/run' && drillMatchId === notification.matchId) ||
    (route.path === '/games' && watchMatchId === notification.matchId)
  const selfUserId = store.selfUserId
  const playing =
    !!selfUserId &&
    store.activeMatches.some(
      (match) =>
        match.id === notification.matchId &&
        (match.player1UserId === selfUserId || match.player2UserId === selfUserId),
    )
  if (alreadyThere || playing) store.dismissFinal()
})

async function watchFinal() {
  const notification = store.finalNotification
  if (!notification) return
  store.dismissFinal()
  store.closeLobby()
  if (notification.matchId) {
    void router.push({ path: '/games', query: { watch: notification.matchId } })
    return
  }
  // 没有 MatchRecord 的决赛来自良跑跑方案赛：按赛事查到排位赛房间再进入。
  try {
    const room = await fetchTournamentRoom(notification.tournamentId)
    await router.push({ path: '/games/autochess', query: { room: room.id } })
  } catch {
    await router.push({ path: '/games' })
  }
}

function dismissFinal() {
  store.dismissFinal()
}

/** 全屏通知必须留逃生口：Esc 或点击遮罩都能关闭，避免看起来像页面卡死。 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !store.finalNotification) return
  event.preventDefault()
  dismissFinal()
}

function dismissChampion() {
  clearChampionTimer()
  store.dismissChampion()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clearChampionTimer()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="game-notify">
      <Transition name="champion-slide">
        <aside
          v-if="store.championNotification"
          class="game-notify__champion"
          role="status"
          aria-live="polite"
        >
          <span class="game-notify__trophy">T</span>
          <div class="game-notify__champion-main">
            <span class="game-notify__eyebrow">SYSTEM NOTICE · DRILL RESULT</span>
            <b>{{ store.championNotification.title }}</b>
            <span>{{ store.championNotification.message }}</span>
          </div>
          <button
            type="button"
            class="game-notify__banner-close"
            aria-label="关闭结果通报"
            @click="dismissChampion"
          >
            ×
          </button>
        </aside>
      </Transition>

      <Transition name="final-fade">
        <div
          v-if="store.finalNotification"
          class="game-notify__final"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-final-title"
          @click.self="dismissFinal"
        >
          <div class="game-notify__final-panel">
            <div class="game-notify__final-glow" aria-hidden="true" />
            <span class="game-notify__final-mark">T</span>
            <span class="game-notify__eyebrow">FINAL ROUND · IN PROGRESS</span>
            <h2 id="game-final-title">{{ store.finalNotification.title }}</h2>
            <p>{{ store.finalNotification.message }}</p>
            <div class="game-notify__final-actions">
              <button type="button" class="game-notify__primary" @click="watchFinal">
                {{ store.finalNotification.matchId ? '查看执行' : '进入房间' }}
              </button>
              <button type="button" class="game-notify__ghost" @click="dismissFinal">
                稍后
              </button>
            </div>
            <span class="game-notify__final-hint">
              所有在线用户都会收到这条通知 · 点击查看公开执行记录
            </span>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.game-notify {
  position: fixed;
  inset: 0;
  z-index: 2200;
  pointer-events: none;
}

.game-notify__champion {
  position: absolute;
  top: 10px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(760px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 34%, var(--fm-border));
  border-radius: 4px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
  pointer-events: auto;
  transform: translateX(-50%);
}

.game-notify__trophy {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-size: 15px;
}

.game-notify__champion-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.game-notify__eyebrow {
  color: var(--fm-text-muted);
  font-family: var(--fm-mono);
  font-size: 7.5px;
  letter-spacing: 0.12em;
}

.game-notify__champion-main b {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-notify__champion-main > span:last-child {
  overflow: hidden;
  color: var(--fm-text-dim);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-notify__banner-close {
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid var(--fm-border);
  border-radius: 3px;
  background: transparent;
  color: var(--fm-text-muted);
  font-size: 14px;
  cursor: pointer;
}

.game-notify__banner-close:hover {
  border-color: var(--fm-text-muted);
  color: var(--fm-text);
}

.game-notify__final {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  /* 小屏/高缩放下内容高于视口时，safe 保证顶部仍可滚动到。 */
  place-items: safe center;
  padding: 22px;
  overflow: auto;
  /* 不要用 backdrop-filter：它会每帧对整屏做 backdrop 快照，
     叠在容量编排持续 rAF 渲染的画布上会把界面拖到看起来卡死。 */
  background: rgb(0 0 0 / 62%);
  pointer-events: auto;
}

.game-notify__final-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: min(460px, 100%);
  padding: 24px 26px 20px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 30%, var(--fm-border));
  border-radius: 4px;
  background: var(--fm-panel);
  box-shadow: var(--fm-shadow);
  text-align: center;
}

.game-notify__final-mark {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 38%, var(--fm-border));
  border-radius: 3px;
  background: var(--fm-panel-2);
  color: var(--fm-accent);
  font-family: var(--fm-mono);
  font-size: 14px;
  font-weight: 600;
}

.game-notify__final-panel .game-notify__eyebrow {
  margin-top: 2px;
  color: var(--fm-text-muted);
}

.game-notify__final h2 {
  max-width: 100%;
  margin: 2px 0 0;
  color: var(--fm-text);
  font-size: clamp(17px, 2.6vw, 23px);
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.game-notify__final p {
  max-width: 410px;
  margin: 2px 0 4px;
  color: var(--fm-text-dim);
  font-size: 11px;
  line-height: 1.65;
}

.game-notify__final-actions {
  display: flex;
  gap: 8px;
  margin-top: 5px;
}

.game-notify__primary,
.game-notify__ghost {
  height: 29px;
  padding: 0 16px;
  border: 1px solid var(--fm-accent);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-accent) 12%, var(--fm-panel-2));
  color: var(--fm-accent);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
}

.game-notify__primary:hover {
  background: color-mix(in srgb, var(--fm-accent) 20%, var(--fm-panel-2));
}

.game-notify__ghost {
  border-color: var(--fm-border);
  background: transparent;
  color: var(--fm-text-muted);
  font-weight: 400;
}

.game-notify__ghost:hover {
  border-color: var(--fm-text-muted);
  color: var(--fm-text);
}

.game-notify__final-hint {
  margin-top: 4px;
  color: var(--fm-text-muted);
  font-size: 8px;
}

.champion-slide-enter-active,
.champion-slide-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.champion-slide-enter-from,
.champion-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px);
}

.final-fade-enter-active,
.final-fade-leave-active {
  transition: opacity 200ms ease;
}

.final-fade-enter-from,
.final-fade-leave-to {
  opacity: 0;
}
</style>
