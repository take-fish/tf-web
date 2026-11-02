<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { formatElapsed } from '../format'
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()
const auth = useAuthStore()
const router = useRouter()

function switchMode() {
  drill.resetMode()
  void router.push('/games/autochess')
}
const snapshot = computed(() => drill.snapshot)
</script>

<template>
  <header class="drill__header">
    <div class="drill__ident">
      <span class="drill__mark">C</span>
      <div>
        <div class="drill__eyebrow">DASHBOARDS / CAPACITY DRILL</div>
        <h1>容量编排 · {{ snapshot.drillName }}</h1>
      </div>
    </div>

    <dl class="drill__metrics">
      <div class="drill__metric">
        <dt>配额</dt>
        <dd>{{ snapshot.quotas }}</dd>
      </div>
      <div class="drill__metric">
        <dt>规格</dt>
        <dd>L{{ snapshot.level }}<em class="drill__xp">{{ snapshot.xp }}/{{ snapshot.xpNeed }}</em></dd>
      </div>
      <div class="drill__metric">
        <dt>轮次</dt>
        <dd>{{ snapshot.round }}/{{ snapshot.totalRounds }}</dd>
      </div>
      <div class="drill__metric" :class="{ 'is-warn': snapshot.sli < 40 }">
        <dt>SLI</dt>
        <dd>{{ snapshot.sli }}</dd>
      </div>
      <div class="drill__metric">
        <dt>人口</dt>
        <dd>{{ snapshot.scale }}/{{ snapshot.popCap }}</dd>
      </div>
      <div class="drill__metric">
        <dt>已运行</dt>
        <dd class="drill__mono">{{ formatElapsed(snapshot.elapsed) }}</dd>
      </div>
    </dl>

    <div class="drill__actions">
      <button type="button" class="drill__ghost" @click="drill.togglePause()">
        <AppIcon :name="drill.paused ? 'play' : 'pause'" :size="12" />
        {{ drill.paused ? '继续' : '暂停' }}
      </button>
      <button type="button" class="drill__ghost" @click="ui.toggleMeeting()">
        {{ ui.meetingMode ? '退出会议模式' : '会议模式' }}
      </button>
      <button type="button" class="drill__ghost" @click="switchMode()">切换模式</button>
      <button
        v-if="auth.isAdmin"
        type="button"
        class="drill__ghost drill__ghost--admin"
        title="管理员：修改实例与亲和组的展示名"
        @click="ui.openNaming()"
      >
        命名
      </button>
    </div>
  </header>
</template>
