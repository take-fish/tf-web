<script setup lang="ts">
import type { AccessRequest } from '@/types/reader'

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
    <div class="sheet reader-requests">
      <header class="sheet__head">
        <div>
          <h2>访问申请</h2>
          <p>私有内容只有所有者批准后才能被查看，管理员也不例外。</p>
        </div>
        <button type="button" class="icon-button" @click="emit('close')">×</button>
      </header>
      <div class="reader-requests__body">
        <section>
          <h3>
            收到的申请 <em>{{ received.length }}</em>
          </h3>
          <div v-for="item in received" :key="`in-${item.id}`" class="reader-request">
            <div class="reader-request__main">
              <b>{{ item.bookTitle }}</b>
              <span>{{ item.requesterNickname }} · {{ item.status }}</span>
              <p v-if="item.message">{{ item.message }}</p>
            </div>
            <div class="reader-request__actions">
              <button
                v-if="item.status === 'PENDING'"
                class="reader-request__btn"
                @click="emit('decide', item, 'approve')"
              >
                批准
              </button>
              <button
                v-if="item.status === 'PENDING'"
                class="reader-request__btn"
                @click="emit('decide', item, 'reject')"
              >
                拒绝
              </button>
              <button
                v-if="item.status === 'APPROVED'"
                class="reader-request__btn"
                @click="emit('decide', item, 'revoke')"
              >
                撤销授权
              </button>
            </div>
          </div>
          <p v-if="received.length === 0" class="reader-request__empty">
            还没有人申请访问你的私有内容
          </p>
        </section>
        <section>
          <h3>
            我发出的申请 <em>{{ mine.length }}</em>
          </h3>
          <div v-for="item in mine" :key="`out-${item.id}`" class="reader-request">
            <div class="reader-request__main">
              <b>{{ item.bookTitle }}</b>
              <span>所有者 {{ item.ownerNickname }} · {{ item.status }}</span>
              <p v-if="item.decisionMessage">回复：{{ item.decisionMessage }}</p>
            </div>
            <div class="reader-request__actions">
              <button
                v-if="item.status === 'PENDING'"
                class="reader-request__btn"
                @click="emit('decide', item, 'cancel')"
              >
                取消申请
              </button>
            </div>
          </div>
          <p v-if="mine.length === 0" class="reader-request__empty">暂无申请记录</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reader-requests {
  width: min(680px, 100%);
}

.reader-requests__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(62vh, 560px);
  padding: 16px 22px;
  overflow-y: auto;
}

.reader-requests__body h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--fm-text-dim);
  font-size: 11px;
  font-weight: 600;
}

.reader-requests__body h3 em {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--fm-panel-2);
  color: var(--fm-text-muted);
  font-style: normal;
}

.reader-request {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  padding: 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
}

.reader-request__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.reader-request__main b {
  color: var(--fm-text);
  font-size: 11.5px;
}

.reader-request__main span {
  color: var(--fm-text-muted);
  font-size: 9.5px;
}

.reader-request__main p {
  margin: 0;
  color: var(--fm-text-dim);
  font-size: 10.5px;
}

.reader-request__actions {
  display: flex;
  flex: none;
  gap: 4px;
}

.reader-request__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-panel-2);
  color: var(--fm-text-dim);
  font-size: 10px;
  white-space: nowrap;
  cursor: pointer;
}

.reader-request__btn:hover {
  border-color: var(--fm-accent);
  color: var(--fm-text);
}

.reader-request__empty {
  padding: 8px;
  color: var(--fm-text-muted);
  font-size: 11px;
  line-height: 1.6;
}
</style>
