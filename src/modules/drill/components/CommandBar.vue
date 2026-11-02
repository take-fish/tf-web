<script setup lang="ts">
import { useDrillStore } from '../stores/drill'

defineProps<{
  battleActive: boolean
  progress: number
}>()

const emit = defineEmits<{
  battle: []
  skip: []
}>()

const drill = useDrillStore()

function reroll() {
  drill.reroll()
}

function levelUp() {
  drill.levelUp()
}
</script>

<template>
  <footer class="drill__command">
    <div class="drill__command-group">
      <button type="button" class="drill__ghost" @click="reroll">
        重新编排 -{{ drill.rerollCost }}
      </button>
      <button type="button" class="drill__ghost" @click="levelUp">
        升配 -{{ drill.levelUpCost }}
      </button>
    </div>

    <div class="drill__battle">
      <span class="drill__battle-label">一致性校验</span>
      <span class="drill__progress" role="progressbar" :aria-valuenow="Math.round(progress)">
        <i :style="{ width: `${progress}%` }" />
      </span>
      <span class="drill__mono">{{ battleActive ? '进行中' : '待发起' }}</span>
      <button type="button" class="drill__primary" :disabled="battleActive" @click="emit('battle')">
        发起校验
      </button>
      <button type="button" class="drill__ghost" :disabled="!battleActive" @click="emit('skip')">
        跳过
      </button>
      <button type="button" class="drill__ghost">2x</button>
    </div>
  </footer>
</template>
