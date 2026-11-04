<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { DrillMode, PartySeat } from '@/modules/drill/types'
import type { DrillRoomMode } from '@/modules/drill/api/rooms'
import { useDrillStore } from '@/modules/drill/stores/drill'
import { useDrillRoomStore } from '@/modules/drill/stores/room'
import { useAuthStore } from '@/stores/auth'
import { useTournamentStore } from '@/stores/tournament'

/**
 * 容量编排入口：先分流「单练 / 组队 / 锦标赛 / 联机」，再进演练工作区。
 *
 * 组队是 8 个席位：席位 0 固定自己，其余可以拉在线用户，拉不满由 AI 补齐。
 * 联机走服务端房间：创建或输入房间号，进局后由服务端下发 seed 与轮次。
 */

type EntryTab = DrillMode | 'online'

const router = useRouter()
const drill = useDrillStore()
const room = useDrillRoomStore()
const auth = useAuthStore()
const tournament = useTournamentStore()

const tab = ref<EntryTab>('solo')
const onlineMode = ref<DrillRoomMode>('TOURNAMENT')
const joinCode = ref('')
const seats = ref<PartySeat[]>(buildSeats())

const selfId = computed(() => (auth.user ? `u${auth.user.id}` : 'self'))

const onlineUsers = computed(() =>
  tournament.onlineMembers.filter((member) => member.userId !== selfId.value),
)
const invitedCount = computed(() => seats.value.filter((seat) => !seat.isAi).length - 1)

function buildSeats(): PartySeat[] {
  const list: PartySeat[] = []
  for (let index = 0; index < 8; index += 1) {
    list.push({
      seat: index,
      userId: index === 0 ? String(auth.user?.id ?? 'self') : `ai-${index}`,
      nickname: index === 0 ? (auth.user?.nickname ?? '我') : '',
      isAi: index !== 0,
    })
  }
  return list
}

function aiName(seat: number): string {
  return `对照组-${String(seat).padStart(2, '0')}`
}

function invite(userId: string, nickname: string) {
  const slot = seats.value.find((seat) => seat.seat > 0 && seat.isAi)
  if (!slot) return
  seats.value = seats.value.map((seat) =>
    seat.seat === slot.seat ? { ...seat, userId, nickname, isAi: false } : seat,
  )
}

function kick(seat: number) {
  seats.value = seats.value.map((entry) =>
    entry.seat === seat
      ? { ...entry, userId: `ai-${seat}`, nickname: '', isAi: true }
      : entry,
  )
}

function fillWithAi() {
  seats.value = seats.value.map((seat) =>
    seat.isAi ? { ...seat, nickname: '', userId: `ai-${seat.seat}` } : seat,
  )
}

function enterSolo() {
  drill.startSolo()
  void router.push('/games/autochess/run')
}

function enterParty() {
  const filled = seats.value.map((seat) => ({
    ...seat,
    nickname: seat.isAi ? aiName(seat.seat) : seat.nickname,
  }))
  drill.startParty(filled)
  void router.push('/games/autochess/run')
}

function enterTournament() {
  drill.startTournament()
  void router.push('/games/autochess/run')
}

async function createOnline() {
  const view = await room.create(onlineMode.value)
  if (view) void router.push({ path: '/games/autochess/run', query: { room: view.id } })
}

async function joinOnline() {
  const code = joinCode.value.trim()
  if (!code) return
  const view = await room.join(code)
  if (view) void router.push({ path: '/games/autochess/run', query: { room: view.id } })
}

onMounted(() => {
  if (!tournament.started) tournament.start()
  void tournament.refreshOnline()
})
</script>

<template>
  <div class="drill-entry">
    <header class="drill-entry__head">
      <div class="drill-entry__title">
        <span class="drill__eyebrow">CAPACITY ORCHESTRATION</span>
        <b>容量编排</b>
        <span class="drill-entry__sub">选择演练形式，进入编排工作区</span>
      </div>
      <button type="button" class="drill-entry__back" @click="router.push('/games')">
        ← 返回工作台
      </button>
    </header>

    <div class="drill-entry__tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="drill-entry__tab"
        :class="{ 'is-on': tab === 'solo' }"
        :aria-selected="tab === 'solo'"
        @click="tab = 'solo'"
      >
        <b>单练</b>
        <span>1 人 + 7 个对照组，25 轮 + 血潮决胜</span>
      </button>
      <button
        type="button"
        role="tab"
        class="drill-entry__tab"
        :class="{ 'is-on': tab === 'party' }"
        :aria-selected="tab === 'party'"
        @click="tab = 'party'"
      >
        <b>组队</b>
        <span>邀请在线用户，不足 8 人由 AI 补齐</span>
      </button>
      <button
        type="button"
        role="tab"
        class="drill-entry__tab"
        :class="{ 'is-on': tab === 'tournament' }"
        :aria-selected="tab === 'tournament'"
        @click="tab = 'tournament'"
      >
        <b>锦标赛</b>
        <span>8 人同局 · 15 轮 · 按战绩排名发奖</span>
      </button>
      <button
        type="button"
        role="tab"
        class="drill-entry__tab"
        :class="{ 'is-on': tab === 'online' }"
        :aria-selected="tab === 'online'"
        @click="tab = 'online'"
      >
        <b>联机</b>
        <span>创建/加入房间 · 服务端统一 seed 与轮次</span>
      </button>
    </div>

    <section v-if="tab === 'solo'" class="drill-entry__panel">
      <dl class="drill-entry__facts">
        <div>
          <dt>席位</dt>
          <dd>8 人桌 · 1 人 + 7 AI</dd>
        </div>
        <div>
          <dt>赛程</dt>
          <dd>5 阶段 + 血潮</dd>
        </div>
        <div>
          <dt>时长</dt>
          <dd>15–18 分钟</dd>
        </div>
        <div>
          <dt>算力</dt>
          <dd>纯前端演练，本地存档</dd>
        </div>
      </dl>
      <button type="button" class="drill-entry__go" @click="enterSolo">
        进入单练 →
      </button>
    </section>

    <section v-else-if="tab === 'tournament'" class="drill-entry__panel">
      <dl class="drill-entry__facts">
        <div>
          <dt>席位</dt>
          <dd>8 人同局 · 教练补位</dd>
        </div>
        <div>
          <dt>赛程</dt>
          <dd>15 轮 · 不淘汰</dd>
        </div>
        <div>
          <dt>排名</dt>
          <dd>胜 3 / 平 1 / 负 0</dd>
        </div>
        <div>
          <dt>奖励</dt>
          <dd>装备入装备栏 + 配额</dd>
        </div>
      </dl>
      <p class="drill-entry__hint">
        锦标赛专项：与机器人教练同榜排名，局末按名次发奖励；正式赛事接入后可邀请真人同局。
      </p>
      <button type="button" class="drill-entry__go" @click="enterTournament">
        进入锦标赛 →
      </button>
    </section>

    <section v-else-if="tab === 'online'" class="drill-entry__panel">
      <div class="drill-entry__lobby">
        <div class="drill-entry__lobby-mode">
          <span class="drill-entry__label">房间模式</span>
          <div class="drill-entry__seg">
            <button
              type="button"
              :class="{ 'is-on': onlineMode === 'TOURNAMENT' }"
              @click="onlineMode = 'TOURNAMENT'"
            >
              锦标赛
            </button>
            <button
              type="button"
              :class="{ 'is-on': onlineMode === 'CASUAL' }"
              @click="onlineMode = 'CASUAL'"
            >
              休闲
            </button>
          </div>
        </div>
        <button type="button" class="drill-entry__go" :disabled="room.loading" @click="createOnline">
          创建房间 →
        </button>
        <div class="drill-entry__lobby-join">
          <input
            v-model="joinCode"
            maxlength="8"
            placeholder="输入 8 位房间号"
            @keyup.enter="joinOnline"
          />
          <button type="button" :disabled="room.loading || !joinCode.trim()" @click="joinOnline">
            加入
          </button>
        </div>
        <p v-if="room.error" class="drill-entry__error">{{ room.error }}</p>
        <p class="drill-entry__hint">
          联机房间由服务端下发 seed 并统一推进轮次；创建后把房间号发给同伴，至少 2 人准备后开局。
        </p>
      </div>
    </section>

    <section v-else class="drill-entry__panel">
      <div class="drill-entry__party">
        <div class="drill-entry__seats">
          <button
            v-for="seat in seats"
            :key="seat.seat"
            type="button"
            class="drill-entry__seat"
            :class="{ 'is-ai': seat.isAi, 'is-self': seat.seat === 0 }"
            :title="seat.seat === 0 ? '自己' : seat.isAi ? 'AI 补齐' : '点击移除邀请'"
            @click="seat.seat > 0 && !seat.isAi && kick(seat.seat)"
          >
            <span class="drill-entry__seat-index">{{ seat.seat === 0 ? '你' : seat.seat + 1 }}</span>
            <b>{{ seat.isAi ? (seat.nickname || aiName(seat.seat)) : seat.nickname }}</b>
            <span class="drill-entry__seat-tag">{{ seat.isAi ? 'AI' : '在线' }}</span>
          </button>
        </div>

        <aside class="drill-entry__invite">
          <div class="drill-entry__invite-head">
            <b>在线用户</b>
            <span class="drill__mono">{{ tournament.onlineMembers.length }}</span>
          </div>
          <ul v-if="onlineUsers.length" class="drill-entry__online">
            <li v-for="user in onlineUsers" :key="user.userId">
              <span>{{ user.nickname }}</span>
              <button
                type="button"
                class="drill__ghost"
                :disabled="invitedCount >= 7 || seats.some((seat) => seat.userId === user.userId)"
                @click="invite(user.userId, user.nickname)"
              >
                邀请
              </button>
            </li>
          </ul>
          <p v-else class="drill-entry__empty">暂无其他在线用户，开始时会由 AI 补齐</p>
          <p class="drill-entry__hint">
            当前 {{ invitedCount }} 位真人 · {{ 8 - invitedCount }} 席由 AI 接管
          </p>
          <button type="button" class="drill__ghost" @click="fillWithAi">全部交回 AI</button>
        </aside>
      </div>

      <button type="button" class="drill-entry__go" @click="enterParty">
        开始组队演练 →
      </button>
    </section>
  </div>
</template>

<style scoped src="./drill-entry.css"></style>
