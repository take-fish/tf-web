<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useDrillStore } from '../stores/drill'
import { useDrillUiStore } from '../stores/ui'

const drill = useDrillStore()
const ui = useDrillUiStore()

const unit = computed(
  () => drill.snapshot.units.find((item) => item.id === ui.drawerUnitId) ?? null,
)

const emit = defineEmits<{
  remove: [string]
}>()
</script>

<template>
  <aside v-if="unit" class="drill__drawer" aria-label="实例详情">
    <header class="drill__drawer-head">
      <div>
        <span class="drill__eyebrow">INSTANCE</span>
        <b>实例详情 · {{ unit.name }}</b>
      </div>
      <button type="button" class="drill__icon-btn" aria-label="关闭" @click="ui.closeDrawer()">
        <AppIcon name="close" :size="12" />
      </button>
    </header>

    <dl class="drill__drawer-rows">
      <div><dt>类型</dt><dd>计算节点</dd></div>
      <div><dt>规格</dt><dd>★{{ unit.star }}</dd></div>
      <div><dt>亲和组</dt><dd>{{ unit.traits.join(' · ') }}</dd></div>
      <div><dt>SLI</dt><dd>{{ unit.sli }}%</dd></div>
      <div><dt>算力</dt><dd>{{ unit.power }}</dd></div>
      <div><dt>吞吐</dt><dd>{{ unit.throughput }}</dd></div>
      <div><dt>注解</dt><dd>{{ unit.annotations.length ? unit.annotations.join('、') : '无' }}</dd></div>
      <div><dt>技能</dt><dd>{{ unit.skill }}</dd></div>
    </dl>

    <div class="drill__drawer-actions">
      <button type="button" class="drill__ghost">调整部署</button>
      <button type="button" class="drill__ghost">卸载注解</button>
      <button type="button" class="drill__danger" @click="emit('remove', unit.id)">下架</button>
    </div>
  </aside>
</template>
