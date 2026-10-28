<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { ASCII_ARTS } from '@/modules/chat/asciiArt'
import { shortId } from '@/modules/chat/format'
import TerminalPane from '@/modules/chat/components/TerminalPane.vue'

import { useChatSession } from './chat/useChatSession'

const {
  banner,
  closePreview,
  currentGroupId,
  dismissGallery,
  dmPeer,
  dmUnreadEntries,
  fileInput,
  focusTerminal,
  gallery,
  groups,
  identity,
  onCommand,
  onImagePicked,
  onPasteImages,
  online,
  openPreview,
  pickImage,
  preview,
  previewImageByShortId,
  prompt,
  readyUser,
  selfUserId,
  sessionLabel,
  sideOpen,
  status,
  statusLabel,
  submitSide,
  terminalRef,
  toggleSide,
  totalUnread,
} = useChatSession()
</script>

<template>
  <div class="chat-view">
    <div class="chat-main">
      <div class="chat-toolbar">
        <span class="chat-toolbar__session">session: {{ sessionLabel }}</span>
        <span class="chat-conn" :class="`chat-conn--${status}`">
          <i class="dot" />
          {{ statusLabel }}
        </span>
        <span v-if="totalUnread > 0" class="chat-unread">UNREAD {{ totalUnread }}</span>
        <span class="chat-toolbar__spacer" />
        <button class="chat-tool" @click="toggleSide">
          <AppIcon name="menu" :size="12" />
          会话
        </button>
        <button class="chat-tool" @click="submitSide('clear')">
          <AppIcon name="refresh" :size="12" />
          清屏
        </button>
        <button class="chat-tool" title="发送图片" @click="pickImage">
          <AppIcon name="file" :size="12" />
          图片
        </button>
        <input
          ref="fileInput"
          class="chat-file"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          @change="onImagePicked"
          @cancel="focusTerminal"
        />
      </div>
      <div class="chat-terminal">
        <TerminalPane
          ref="terminalRef"
          :prompt="prompt"
          :banner="banner"
          @command="onCommand"
          @paste-image="onPasteImages"
          @preview-image="previewImageByShortId"
        />
      </div>
      <div v-if="gallery.length" class="chat-gallery" aria-label="图片消息">
        <div v-for="entry in gallery" :key="entry.message.id" class="chat-gallery__item">
          <button
            class="chat-gallery__open"
            :title="`查看图片 #${shortId(entry.message.id)}`"
            @click="openPreview(entry)"
          >
            <img :src="entry.src" :alt="`图片 #${shortId(entry.message.id)}`" />
            <span>#{{ shortId(entry.message.id) }}</span>
          </button>
          <button
            class="chat-gallery__remove"
            :aria-label="`不再在下方展示图片 #${shortId(entry.message.id)}`"
            title="不再在下方展示"
            @click.stop="dismissGallery(entry.message)"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <aside v-if="sideOpen" class="chat-side">
      <div class="chat-side__head">
        <span>会话组</span>
        <span>{{ groups.length }}</span>
      </div>
      <button
        v-for="group in groups"
        :key="group.id"
        class="chat-side__row"
        :class="{ 'is-active': !dmPeer && group.id === currentGroupId }"
        @click="submitSide(`cd ${group.id}`)"
      >
        <AppIcon name="folder" :size="13" />
        <span>{{ group.id }}</span>
        <em>{{ group.onlineCount }} online</em>
        <b v-if="group.unread" class="chat-badge">{{ group.unread > 99 ? '99+' : group.unread }}</b>
      </button>
      <div v-if="groups.length === 0" class="chat-side__empty">索引暂不可用</div>

      <div class="chat-side__head">
        <span>在线节点</span>
        <span>{{ online.length }}</span>
      </div>
      <button
        v-for="member in online"
        :key="member.userId"
        class="chat-side__row"
        :class="{ 'is-active': dmPeer?.userId === member.userId }"
        @click="submitSide(`ssh ${member.nickname}`)"
      >
        <i class="dot dot--ok" />
        <span>{{ member.nickname }}<template v-if="member.userId === selfUserId"> (you)</template></span>
        <em>{{ member.node }}</em>
      </button>
      <div v-if="online.length === 0" class="chat-side__empty">没有在线节点</div>

      <template v-if="dmUnreadEntries.length">
        <div class="chat-side__head">
          <span>私聊未读</span>
          <span>{{ dmUnreadEntries.length }}</span>
        </div>
        <button
          v-for="entry in dmUnreadEntries"
          :key="entry.userId"
          class="chat-side__row chat-side__row--unread"
          @click="submitSide(`ssh ${entry.nickname}`)"
        >
          <AppIcon name="file" :size="13" />
          <span>{{ entry.nickname }}</span>
          <b class="chat-badge">{{ entry.count > 99 ? '99+' : entry.count }}</b>
        </button>
      </template>

      <div class="chat-side__head">
        <span>脚本</span>
        <span>{{ ASCII_ARTS.length }}</span>
      </div>
      <button
        v-for="art in ASCII_ARTS"
        :key="art.path"
        class="chat-side__row"
        @click="submitSide(`cat ${art.path}`)"
      >
        <AppIcon name="file" :size="13" />
        <span>{{ art.name }}</span>
      </button>

      <div class="chat-side__head">
        <span>快捷命令</span>
      </div>
      <div class="chat-side__hints">
        <button @click="submitSide('tail -n 50 chat.log')">最近 50 条</button>
        <button @click="submitSide('ps aux | grep dev')">ps</button>
        <button @click="submitSide('who')">who</button>
        <button @click="submitSide('help')">help</button>
      </div>

      <div class="chat-side__foot">
        {{ identity.state.nickname }}@{{ identity.nodeName }}<br />
        uid={{ selfUserId.slice(0, 8) }} · sshd 8.9
        <template v-if="readyUser"><br />ticket session · {{ readyUser.node }}</template>
      </div>
    </aside>

    <div v-if="preview" class="chat-preview" @click.self="closePreview">
      <figure class="chat-preview__frame">
        <img :src="preview.src" alt="图片预览" />
        <figcaption>
          #{{ shortId(preview.message.id) }} · {{ preview.message.fromNickname }} ·
          {{ new Date(preview.message.ts).toLocaleString('zh-CN') }}
        </figcaption>
      </figure>
      <button class="chat-preview__close" @click="closePreview">关闭</button>
    </div>
  </div>
</template>

<style scoped src="./chat-view.css"></style>
