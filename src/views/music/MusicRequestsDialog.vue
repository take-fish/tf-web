<script setup lang="ts">
import type { AccessRequest } from '@/types/music'

defineProps<{
  received: AccessRequest[]
  mine: AccessRequest[]
}>()

const emit = defineEmits<{
  close: []
  decide: [request: AccessRequest, action: 'approve' | 'reject' | 'revoke' | 'cancel']
}>()
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="sheet music__requests">
      <header class="sheet__head">
        <div>
          <h2>访问申请</h2>
          <p>私有曲目仅所有者可批准，管理员不可绕过。</p>
        </div>
        <button type="button" class="icon-button" @click="emit('close')">×</button>
      </header>
      <div class="music__requests-body">
        <section>
          <h3>
            收到的申请 <em>{{ received.length }}</em>
          </h3>
          <div v-for="item in received" :key="`in-${item.id}`" class="music__request">
            <div class="music__request-main">
              <b>{{ item.trackTitle }}</b>
              <span>{{ item.requesterNickname }} · {{ item.status }}</span>
              <p v-if="item.message">{{ item.message }}</p>
            </div>
            <div class="music__request-actions">
              <button
                v-if="item.status === 'PENDING'"
                class="music__request-btn"
                @click="emit('decide', item, 'approve')"
              >
                批准
              </button>
              <button
                v-if="item.status === 'PENDING'"
                class="music__request-btn"
                @click="emit('decide', item, 'reject')"
              >
                拒绝
              </button>
              <button
                v-if="item.status === 'APPROVED'"
                class="music__request-btn"
                @click="emit('decide', item, 'revoke')"
              >
                撤销
              </button>
            </div>
          </div>
          <p v-if="received.length === 0" class="music__request-empty">暂无收到的申请</p>
        </section>
        <section>
          <h3>
            我发出的申请 <em>{{ mine.length }}</em>
          </h3>
          <div v-for="item in mine" :key="`out-${item.id}`" class="music__request">
            <div class="music__request-main">
              <b>{{ item.trackTitle }}</b>
              <span>所有者 {{ item.ownerNickname }} · {{ item.status }}</span>
              <p v-if="item.decisionMessage">回复：{{ item.decisionMessage }}</p>
            </div>
            <div class="music__request-actions">
              <button
                v-if="item.status === 'PENDING'"
                class="music__request-btn"
                @click="emit('decide', item, 'cancel')"
              >
                取消
              </button>
            </div>
          </div>
          <p v-if="mine.length === 0" class="music__request-empty">暂无申请记录</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.music__requests {
  width: min(680px, 100%);
}

.music__requests-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(62vh, 560px);
  padding: 16px 22px;
  overflow-y: auto;
}

.music__requests-body h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--fm-text-dim);
  font-size: 11px;
  font-weight: 600;
}

.music__requests-body h3 em {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--fm-panel-2);
  color: var(--fm-text-muted);
  font-style: normal;
}

.music__request {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  padding: 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
}

.music__request-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.music__request-main b {
  color: var(--fm-text);
  font-size: 11.5px;
}

.music__request-main span {
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.music__request-main p {
  margin: 0;
  color: var(--fm-text-dim);
  font-size: 10.5px;
}

.music__request-actions {
  display: flex;
  flex: none;
  gap: 4px;
}

.music__request-btn {
  height: 22px;
  padding: 0 7px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: transparent;
  color: var(--fm-text-dim);
  font-size: 9.5px;
  cursor: pointer;
}

.music__request-btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.music__request-empty {
  padding: 6px 8px;
  color: var(--fm-text-muted);
  font-size: 10px;
  line-height: 1.6;
}
</style>
