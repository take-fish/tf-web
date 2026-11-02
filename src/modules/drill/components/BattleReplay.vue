<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()

const trace = computed(() => drill.lastTrace)
const battle = computed(() => drill.lastBattle)
const frames = computed(() => trace.value?.frames ?? [])
const duration = computed(() => trace.value?.duration ?? 0)

const cursor = ref(0)
const playing = ref(false)
const speed = ref(1)
let timer: number | undefined

const names = computed(() => {
  const map: Record<string, string> = {}
  for (const unit of trace.value?.units ?? []) map[unit.uid] = unit.name
  return map
})

function nameOf(uid: string | undefined): string {
  if (!uid) return '系统'
  return names.value[uid] ?? uid
}

const frameIndex = computed(() => {
  if (frames.value.length === 0) return 0
  return Math.min(frames.value.length - 1, Math.floor(cursor.value / 0.1))
})

const placed = computed(() => {
  const frame = frames.value[frameIndex.value]
  const meta = new Map((trace.value?.units ?? []).map((unit) => [unit.uid, unit]))
  if (!frame) return []
  return frame.units
    .map((item) => {
      const info = meta.get(item.uid)
      if (!info) return null
      return {
        uid: item.uid,
        name: info.name,
        side: info.side,
        col: item.col,
        row: item.row,
        hp: item.hp,
        alive: item.alive,
        maxHp: info.maxHp,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
})

const events = computed(() =>
  (trace.value?.events ?? [])
    .filter((event) => event.t <= cursor.value + 0.001)
    .slice(-70)
    .reverse(),
)

function eventText(kind: string, uid: string, targetId?: string, amount?: number, text?: string) {
  if (kind === 'hit') return `${nameOf(uid)} → ${nameOf(targetId)}　−${amount ?? 0}`
  if (kind === 'skill') return `${nameOf(uid)} 触发「${text ?? '技能'}」`
  if (kind === 'down') return `${nameOf(uid)} 退役`
  return `${nameOf(uid)} 重新接入`
}

function fmt(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

function toggle() {
  if (playing.value) {
    playing.value = false
    return
  }
  if (cursor.value >= duration.value) cursor.value = 0
  playing.value = true
}

watch([playing, speed], () => {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
  if (!playing.value) return
  timer = window.setInterval(() => {
    cursor.value = Math.min(duration.value, cursor.value + 0.1 * speed.value)
    if (cursor.value >= duration.value) playing.value = false
  }, 100)
})

watch(
  () => ui.replayOpen,
  (open) => {
    if (!open) {
      playing.value = false
      return
    }
    cursor.value = 0
    playing.value = true
  },
)

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div v-if="ui.replayOpen && trace" class="drill__overlay" role="dialog" aria-modal="true" aria-label="校验回放">
    <div class="drill__modal drill__modal--replay">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">ALIGNMENT REPLAY</span>
          <b>
            一致性校验回放 · 第 {{ battle?.round ?? 0 }} 轮 · {{ battle?.opponent ?? '对照组' }}
          </b>
        </div>
        <button type="button" class="drill__icon-btn" aria-label="关闭" @click="ui.closeReplay()">
          ×
        </button>
      </header>

      <dl class="drill__replay-stats">
        <div><dt>结论</dt><dd :class="battle?.won ? 'is-ok' : 'is-err'">{{ battle?.won ? '通过' : '未通过' }}</dd></div>
        <div><dt>SLI</dt><dd>{{ battle?.sliBefore }} → {{ battle?.sliAfter }}</dd></div>
        <div><dt>剩余实例</dt><dd>{{ battle?.survivors ?? 0 }}</dd></div>
        <div><dt>耗时</dt><dd class="drill__mono">{{ fmt(duration) }}</dd></div>
        <div><dt>事件</dt><dd>{{ trace.events.length }}</dd></div>
      </dl>

      <div class="drill__replay-body">
        <div class="drill__replay-board">
          <div
            v-for="unit in placed"
            :key="unit.uid"
            class="drill__replay-unit"
            :class="[`is-${unit.side}`, { 'is-dead': !unit.alive }]"
            :style="{
              left: `${(unit.col / 7) * 100}%`,
              top: `${(unit.row / 4) * 100}%`,
              width: `${100 / 7}%`,
              height: `${100 / 4}%`,
            }"
          >
            <b>{{ unit.name }}</b>
            <span class="drill__replay-hp">
              <i :style="{ width: `${Math.max(0, (unit.hp / Math.max(1, unit.maxHp)) * 100)}%` }" />
            </span>
          </div>
          <span class="drill__replay-side drill__replay-side--ally">己方部署</span>
          <span class="drill__replay-side drill__replay-side--enemy">对照组</span>
        </div>

        <ul class="drill__replay-log">
          <li v-for="(event, index) in events" :key="`${event.t}-${index}`" :class="`is-${event.kind}`">
            <span class="drill__mono">{{ fmt(event.t) }}</span>
            <span>{{ eventText(event.kind, event.uid, event.targetId, event.amount, event.text) }}</span>
          </li>
          <li v-if="events.length === 0" class="is-idle">尚未产生事件，点播放开始回放</li>
        </ul>
      </div>

      <footer class="drill__replay-controls">
        <button type="button" class="drill__primary" @click="toggle()">
          {{ playing ? '暂停' : '播放' }}
        </button>
        <div class="drill__replay-speed">
          <button
            v-for="value in [1, 2, 4]"
            :key="value"
            type="button"
            class="drill__ghost"
            :class="{ 'is-on': speed === value }"
            @click="speed = value"
          >
            {{ value }}×
          </button>
        </div>
        <input
          v-model.number="cursor"
          class="drill__replay-scrub"
          type="range"
          min="0"
          :max="duration"
          step="0.1"
          aria-label="回放进度"
        />
        <span class="drill__mono drill__replay-clock">{{ fmt(cursor) }} / {{ fmt(duration) }}</span>
      </footer>
    </div>
  </div>
</template>
