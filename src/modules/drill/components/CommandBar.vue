<script setup lang="ts">
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

defineProps<{
  battleActive: boolean
  progress: number
}>()

const emit = defineEmits<{
  battle: []
  skip: []
}>()

const drill = useDrillStore()
const ui = useDrillUiStore()

function reroll() {
  drill.reroll()
}

function buyXp() {
  drill.buyXp()
}
</script>

<template>
  <footer class="drill__command">
    <div class="drill__command-group">
      <button type="button" class="drill__ghost" @click="reroll">
        重新编排 -{{ drill.rerollCost }}
      </button>
      <button type="button" class="drill__ghost" @click="buyXp">
        升配 -{{ drill.levelUpCost }}
      </button>
      <span class="drill__xpbar" :title="`编排经验 ${drill.snapshot.xp}/${drill.snapshot.xpNeed}`">
        <i :style="{ width: `${Math.min(100, (drill.snapshot.xp / Math.max(1, drill.snapshot.xpNeed)) * 100)}%` }" />
      </span>
    </div>

    <div class="drill__battle">
      <span class="drill__battle-label">一致性校验</span>
      <span class="drill__progress" role="progressbar" :aria-valuenow="Math.round(progress)">
        <i :style="{ width: `${progress}%` }" />
      </span>
      <span class="drill__mono">{{ battleActive ? '进行中' : '待发起' }}</span>
      <button
        type="button"
        class="drill__primary"
        :disabled="battleActive || drill.snapshot.over"
        @click="emit('battle')"
      >
        发起校验
      </button>
      <button type="button" class="drill__ghost" :disabled="!battleActive" @click="emit('skip')">
        跳过
      </button>
      <button
        type="button"
        class="drill__ghost"
        :disabled="!drill.lastTrace"
        title="查看上一场校验的完整过程"
        @click="ui.openReplay()"
      >
        回放
      </button>
    </div>
  </footer>
</template>
