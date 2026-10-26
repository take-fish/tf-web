<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useTournamentStore } from '@/stores/tournament'

const store = useTournamentStore()
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

function watchFinal() {
  const notification = store.finalNotification
  if (!notification) return
  store.dismissFinal()
  store.closeLobby()
  if (notification.matchId) {
    void router.push({ path: '/games', query: { watch: notification.matchId } })
  } else {
    void router.push({ path: '/games' })
  }
}

function dismissFinal() {
  store.dismissFinal()
}

function dismissChampion() {
  clearChampionTimer()
  store.dismissChampion()
}

onBeforeUnmount(() => {
  clearChampionTimer()
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
          <span class="game-notify__trophy">♛</span>
          <div class="game-notify__champion-main">
            <span class="game-notify__eyebrow">HEATMAP GOMOKU · TOURNAMENT RESULT</span>
            <b>{{ store.championNotification.title }}</b>
            <span>{{ store.championNotification.message }}</span>
          </div>
          <button
            type="button"
            class="game-notify__banner-close"
            aria-label="关闭冠军通报"
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
        >
          <div class="game-notify__final-panel">
            <div class="game-notify__final-glow" aria-hidden="true" />
            <span class="game-notify__final-mark">五</span>
            <span class="game-notify__eyebrow">FINAL MATCH · LIVE NOW</span>
            <h2 id="game-final-title">{{ store.finalNotification.title }}</h2>
            <p>{{ store.finalNotification.message }}</p>
            <div class="game-notify__final-actions">
              <button type="button" class="game-notify__primary" @click="watchFinal">
                进入观战
              </button>
              <button type="button" class="game-notify__ghost" @click="dismissFinal">
                稍后
              </button>
            </div>
            <span class="game-notify__final-hint">
              所有在线用户都会收到这条通知 · 点击进入公开观战房间
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
  border: 1px solid color-mix(in srgb, #ffb01f 58%, transparent);
  border-radius: 5px;
  background:
    linear-gradient(105deg, rgba(72, 48, 9, 0.97), rgba(22, 24, 28, 0.97)),
    var(--fm-panel);
  box-shadow:
    0 12px 42px rgba(0, 0, 0, 0.48),
    0 0 28px rgba(255, 176, 31, 0.18);
  pointer-events: auto;
  transform: translateX(-50%);
}

.game-notify__trophy {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 200, 90, 0.52);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffe49b, #f5ac17 58%, #9a6000);
  color: #4a2d00;
  font-size: 19px;
  box-shadow: 0 0 16px rgba(255, 176, 31, 0.34);
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
  color: #ffd978;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-notify__champion-main > span:last-child {
  overflow: hidden;
  color: #d7c8a4;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-notify__banner-close {
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255, 200, 90, 0.24);
  border-radius: 3px;
  background: transparent;
  color: #cbbb92;
  font-size: 14px;
  cursor: pointer;
}

.game-notify__banner-close:hover {
  border-color: #ffb01f;
  color: #ffd978;
}

.game-notify__final {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(3, 5, 8, 0.7);
  backdrop-filter: blur(5px);
  pointer-events: auto;
}

.game-notify__final-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: min(520px, 100%);
  padding: 30px 30px 24px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--fm-accent) 55%, transparent);
  border-radius: 6px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 136, 51, 0.18), transparent 55%),
    var(--fm-panel);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.62),
    0 0 44px rgba(255, 122, 26, 0.16);
  text-align: center;
}

.game-notify__final-glow {
  position: absolute;
  top: -60%;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  background: rgba(255, 122, 26, 0.2);
  filter: blur(48px);
  pointer-events: none;
}

.game-notify__final-mark {
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #ffd08a, #ff7a1a 62%, #a93c00);
  color: #23160a;
  font-size: 21px;
  font-weight: 800;
  box-shadow: 0 0 26px rgba(255, 122, 26, 0.42);
}

.game-notify__final-panel .game-notify__eyebrow {
  margin-top: 4px;
  color: var(--fm-warn);
}

.game-notify__final h2 {
  max-width: 100%;
  margin: 2px 0 0;
  color: var(--fm-text);
  font-size: clamp(19px, 3vw, 27px);
  font-weight: 700;
  line-height: 1.2;
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
  height: 31px;
  padding: 0 18px;
  border: 1px solid var(--fm-accent);
  border-radius: var(--fm-radius);
  background: linear-gradient(160deg, #ff9a34, #f46800);
  color: #241303;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.game-notify__primary:hover {
  filter: brightness(1.08);
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
