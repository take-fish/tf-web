<script setup lang="ts">
import { computed, ref } from 'vue'

import { TRAIT_DEFS, UNIT_DEFS } from '../core/content'
import { useDrillNamingStore } from '../stores/naming'
import { useDrillUiStore } from '../stores/ui'

const naming = useDrillNamingStore()
const ui = useDrillUiStore()

const tab = ref<'unit' | 'trait'>('unit')
const keyword = ref('')
const confirming = ref(false)

const units = computed(() => {
  const text = keyword.value.trim()
  if (text === '') return UNIT_DEFS
  return UNIT_DEFS.filter((def) => def.name.includes(text) || def.id.includes(text.toLowerCase()))
})

const traits = computed(() => {
  const text = keyword.value.trim()
  if (text === '') return TRAIT_DEFS
  return TRAIT_DEFS.filter((def) => def.label.includes(text) || def.id.includes(text.toLowerCase()))
})

function unitValue(defId: string): string {
  return naming.unitNames[defId] ?? ''
}

function traitValue(defId: string): string {
  return naming.traitNames[defId] ?? ''
}

function onUnitInput(defId: string, event: Event) {
  naming.renameUnit(defId, (event.target as HTMLInputElement).value)
}

function onTraitInput(defId: string, event: Event) {
  naming.renameTrait(defId, (event.target as HTMLInputElement).value)
}

function resetAll() {
  if (!confirming.value) {
    confirming.value = true
    return
  }
  naming.resetAll()
  confirming.value = false
}
</script>

<template>
  <div v-if="ui.namingOpen" class="drill__overlay" role="dialog" aria-modal="true" aria-label="命名管理">
    <div class="drill__modal drill__modal--naming">
      <header class="drill__modal-head">
        <div>
          <span class="drill__eyebrow">NAMING · ADMIN</span>
          <b>命名管理</b>
        </div>
        <button type="button" class="drill__icon-btn" aria-label="关闭" @click="ui.closeNaming()">
          ×
        </button>
      </header>

      <div class="drill__naming-toolbar">
        <div class="drill__naming-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="drill__ghost"
            :class="{ 'is-on': tab === 'unit' }"
            :aria-selected="tab === 'unit'"
            @click="tab = 'unit'"
          >
            实例命名 {{ UNIT_DEFS.length }}
          </button>
          <button
            type="button"
            role="tab"
            class="drill__ghost"
            :class="{ 'is-on': tab === 'trait' }"
            :aria-selected="tab === 'trait'"
            @click="tab = 'trait'"
          >
            亲和组命名 {{ TRAIT_DEFS.length }}
          </button>
        </div>
        <input v-model="keyword" class="drill__naming-search" type="search" placeholder="搜索名称或标识" />
      </div>

      <div class="drill__naming-body">
        <ul v-if="tab === 'unit'" class="drill__naming-list">
          <li v-for="def in units" :key="def.id" class="drill__naming-row">
            <span class="drill__naming-id">{{ def.id }}</span>
            <span class="drill__naming-cost">{{ def.cost }} 费</span>
            <input
              class="drill__naming-input"
              :value="unitValue(def.id)"
              :placeholder="def.name"
              maxlength="12"
              @input="onUnitInput(def.id, $event)"
            />
            <button
              type="button"
              class="drill__naming-reset"
              :disabled="unitValue(def.id) === ''"
              title="还原出厂名"
              @click="naming.resetUnit(def.id)"
            >
              还原
            </button>
          </li>
        </ul>

        <ul v-else class="drill__naming-list">
          <li v-for="def in traits" :key="def.id" class="drill__naming-row">
            <span class="drill__naming-id">{{ def.id }}</span>
            <span class="drill__naming-cost">{{ def.tiers.join('/') }}</span>
            <input
              class="drill__naming-input"
              :value="traitValue(def.id)"
              :placeholder="def.label"
              maxlength="12"
              @input="onTraitInput(def.id, $event)"
            />
            <button
              type="button"
              class="drill__naming-reset"
              :disabled="traitValue(def.id) === ''"
              title="还原出厂名"
              @click="naming.resetTrait(def.id)"
            >
              还原
            </button>
          </li>
        </ul>
      </div>

      <footer class="drill__naming-foot">
        <span class="drill__naming-count">
          已改 <b>{{ naming.changedCount }}</b> 项 · 留空即用出厂名
        </span>
        <div class="drill__naming-actions">
          <button type="button" class="drill__ghost" @click="resetAll">
            {{ confirming ? '再点一次确认还原' : '全部还原' }}
          </button>
          <button type="button" class="drill__primary" @click="ui.closeNaming()">完成</button>
        </div>
      </footer>
    </div>
  </div>
</template>
