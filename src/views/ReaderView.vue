<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore } from '@/stores/identity'
import { useSettingsStore } from '@/stores/settings'
import { READER_TEMPLATES } from '@/modules/reader/lib/novelFormatter'
import CodeEditorPane from '@/modules/reader/components/CodeEditorPane.vue'
import ReaderRequestsDialog from './reader/ReaderRequestsDialog.vue'
import { useReaderCore } from './reader/useReaderCore'
import { useReaderLibrary } from './reader/useReaderLibrary'

const auth = useAuthStore()
const identity = useIdentityStore()
const settings = useSettingsStore()

const core = useReaderCore()
const library = useReaderLibrary(core)

const {
  selectedBookId,
  book,
  chapters,
  chapterIndex,
  chapter,
  bookmarks,
  annotations,
  currentLine,
  editorRef,
  loading,
  error,
  autoScroll,
  annotationDraft,
  postingAnnotation,
  sharePreview,
  templateId,
  light,
  paragraphs,
  formatted,
  code,
  chapterMeta,
  reviewPercent,
  currentParagraphBookmarked,
  bookmarkLines,
  annotationCounts,
  clock,
  flushProgress,
  onVisibilityChange,
  onScrollRatio,
  selectChapter,
  selectBook,
  toggleBookmark,
  deleteBookmark,
  jumpToBookmark,
  jumpToAnnotation,
  submitAnnotation,
  onTemplateChange,
  onAutoScrollSpeed,
  startPolling,
  dispose,
} = core

const {
  mode,
  books,
  categories,
  categoryFilter,
  searchQuery,
  categoryDraft,
  categoryEditorOpen,
  shelves,
  activeShelf,
  shelfDraft,
  shelfPickerOpen,
  shareTokenInput,
  applying,
  applyMessage,
  applyError,
  requestsOpen,
  receivedRequests,
  myRequests,
  shareOpen,
  shareToken,
  shareError,
  editOpen,
  editTitle,
  editAuthor,
  editDescription,
  editCategoryId,
  editStatus,
  editError,
  savingEdit,
  importOpen,
  importTitle,
  importAuthor,
  importScope,
  importCategoryId,
  importing,
  importError,
  canUploadPublic,
  canManagePrivate,
  canManageCategory,
  canImport,
  pendingIncoming,
  loadCategories,
  loadBooks,
  switchMode,
  submitCategory,
  lookupShare,
  submitAccessRequest,
  openShare,
  copyShareToken,
  openEdit,
  submitEdit,
  deleteCurrentBook,
  selectShelf,
  openShelfPicker,
  addCurrentToShelf,
  submitShelf,
  openRequests,
  refreshRequests,
  decideRequest,
  openImport,
  onImportFile,
  submitImport,
} = library

onMounted(async () => {
  // 关标签页/切到后台时补存进度：滚动保存有 2 秒防抖，靠这两个事件兜住最后那段。
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', flushProgress)
  await loadCategories()
  await loadBooks()
  void refreshRequests()
  startPolling()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', flushProgress)
  dispose()
})
</script>

<template>
  <div class="reader">
    <aside class="reader-side">
      <div class="reader-side__head">
        <span>资料库</span>
        <button
          v-if="canImport"
          class="reader-mini-btn"
          title="导入 txt 数据集"
          @click="openImport"
        >
          +
        </button>
      </div>
      <div class="reader-tabs">
        <button
          class="reader-tab"
          :class="{ 'is-active': mode === 'public' }"
          @click="switchMode('public')"
        >
          公共库
        </button>
        <button
          v-if="canManagePrivate"
          class="reader-tab"
          :class="{ 'is-active': mode === 'private' }"
          @click="switchMode('private')"
        >
          私有库
        </button>
        <button
          class="reader-tab"
          :class="{ 'is-active': mode === 'shared' }"
          @click="switchMode('shared')"
        >
          共享
        </button>
        <button
          v-if="canManagePrivate"
          class="reader-tab"
          :class="{ 'is-active': mode === 'shelves' }"
          @click="switchMode('shelves')"
        >
          书单
        </button>
      </div>

      <form v-if="mode === 'public'" class="reader-filter" @submit.prevent="loadBooks">
        <input v-model="searchQuery" maxlength="64" placeholder="搜索书名 / 作者" />
        <select v-model="categoryFilter" @change="loadBooks">
          <option :value="null">全部分类</option>
          <option v-for="item in categories" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <button
          v-if="canManageCategory"
          type="button"
          class="reader-mini-btn"
          title="新建分类"
          @click="categoryEditorOpen = !categoryEditorOpen"
        >
          +
        </button>
        <div v-if="categoryEditorOpen" class="reader-filter__inline">
          <input v-model="categoryDraft" maxlength="32" placeholder="新分类名称" />
          <button type="button" @click="submitCategory">保存</button>
        </div>
      </form>

      <form v-if="mode === 'shared'" class="reader-filter" @submit.prevent="lookupShare">
        <input v-model="shareTokenInput" placeholder="粘贴分享码" />
        <button type="submit">查询</button>
      </form>

      <form v-if="mode === 'shelves'" class="reader-filter" @submit.prevent="submitShelf">
        <input v-model="shelfDraft" maxlength="64" placeholder="新建书单名称" />
        <button type="submit">新建</button>
      </form>
      <div v-if="mode === 'shelves'" class="reader-shelves">
        <button
          v-for="item in shelves"
          :key="item.id"
          class="reader-book"
          :class="{ 'is-active': activeShelf?.shelf.id === item.id }"
          @click="selectShelf(item.id)"
        >
          <AppIcon name="bookmark" :size="13" />
          <span class="reader-book__title">{{ item.name }}</span>
          <em>{{ item.bookCount }}</em>
        </button>
        <p v-if="shelves.length === 0" class="reader-side__empty">还没有书单</p>
      </div>

      <template v-if="mode !== 'shelves'">
        <button
          v-for="item in books"
          :key="item.id"
          class="reader-book"
          :class="{ 'is-active': selectedBookId === item.id }"
          @click="selectBook(item.id)"
        >
          <AppIcon name="file" :size="13" />
          <span class="reader-book__title">{{ item.title }}</span>
          <span v-if="item.status === 'HIDDEN'" class="reader-book__badge">隐藏</span>
          <em>{{
            item.scope === 'PRIVATE' ? '私有' : item.categoryName || `${item.chapterCount} 章`
          }}</em>
        </button>
        <div v-if="books.length === 0" class="reader-side__empty">
          <p>
            {{
              mode === 'shared'
                ? '暂无可阅读的共享书籍'
                : mode === 'private'
                  ? '私有库还是空的'
                  : '公共库暂无书籍'
            }}
          </p>
          <button v-if="canImport" class="reader-link" @click="openImport">导入 txt 数据集</button>
        </div>
      </template>

      <template v-if="book">
        <div class="reader-side__head reader-side__head--sub">
          <span>{{ book.title }}</span>
          <span>{{ chapters.length }}</span>
        </div>
        <button
          v-for="item in chapters"
          :key="item.chapterIndex"
          class="reader-chapter"
          :class="{ 'is-active': chapterIndex === item.chapterIndex }"
          @click="selectChapter(item.chapterIndex)"
        >
          <span class="reader-chapter__index">{{
            String(item.chapterIndex + 1).padStart(2, '0')
          }}</span>
          <span class="reader-chapter__title">{{ item.title }}</span>
          <em>{{ item.wordCount }}w</em>
        </button>
      </template>
    </aside>

    <section class="reader-main">
      <div class="reader-toolbar">
        <div class="reader-crumbs">
          <span>{{ book?.title ?? '未选择仓库' }}</span>
          <span class="reader-crumbs__sep">/</span>
          <b>{{ chapter?.title ?? '—' }}</b>
        </div>
        <span v-if="chapterMeta" class="reader-toolbar__meta">
          {{ chapterMeta.wordCount }} 字 · {{ paragraphs.length }} 段
        </span>
        <span class="reader-toolbar__spacer" />
        <button v-if="book?.canEdit" class="reader-btn" @click="openEdit">编辑</button>
        <button
          v-if="book?.scope === 'PRIVATE' && book?.mine"
          class="reader-btn"
          @click="openShare"
        >
          分享
        </button>
        <button v-if="book" class="reader-btn" @click="openShelfPicker">书单</button>
        <button
          v-if="book?.canDelete"
          class="reader-btn reader-btn--danger"
          @click="deleteCurrentBook"
        >
          删除
        </button>
        <button class="reader-btn" @click="openRequests">
          访问申请
          <em v-if="pendingIncoming > 0" class="reader-btn__badge">{{ pendingIncoming }}</em>
        </button>
        <label class="reader-control">
          <span>语言</span>
          <select :value="templateId" @change="onTemplateChange">
            <option v-for="item in READER_TEMPLATES" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="reader-control">
          <span>审阅</span>
          <select :value="settings.state.autoScrollSeconds" @change="onAutoScrollSpeed">
            <option :value="30">30s</option>
            <option :value="45">45s</option>
            <option :value="60">60s</option>
          </select>
        </label>
        <button
          class="reader-btn"
          :class="{ 'is-active': autoScroll }"
          :disabled="!chapter"
          @click="autoScroll = !autoScroll"
        >
          <AppIcon :name="autoScroll ? 'pause' : 'play'" :size="12" />
          {{ autoScroll ? '暂停审阅' : '自动审阅' }}
        </button>
        <button class="reader-btn" :disabled="!chapter" @click="toggleBookmark">
          <AppIcon name="bookmark" :size="12" />
          {{ currentParagraphBookmarked ? '取消标记' : '标记行' }}
        </button>
      </div>

      <div v-if="error" class="reader-error-bar">{{ error }}</div>

      <div v-if="sharePreview" class="reader-preview">
        <div class="reader-preview__card">
          <span class="reader-preview__tag">私有内容 · 需要授权</span>
          <h2>{{ sharePreview.title }}</h2>
          <p class="reader-preview__meta">
            {{ sharePreview.author || '未知作者' }} · {{ sharePreview.chapterCount }} 章 · 所有者
            {{ sharePreview.ownerNickname || '—' }}
          </p>
          <p class="reader-preview__desc">
            {{ sharePreview.description || '所有者未填写简介。' }}
          </p>
          <p class="reader-preview__hint">
            分享码只用于发现内容，不等于授权。提交申请后需由所有者批准。
          </p>
          <textarea
            v-model="applyMessage"
            rows="3"
            maxlength="255"
            placeholder="向所有者说明申请原因（可选）"
          />
          <p v-if="applyError" class="reader-import__error">{{ applyError }}</p>
          <div class="reader-preview__actions">
            <button class="primary-button" :disabled="applying" @click="submitAccessRequest">
              {{ applying ? '提交中…' : '申请访问' }}
            </button>
            <button class="reader-btn" @click="sharePreview = null">关闭</button>
          </div>
        </div>
      </div>
      <div v-else class="reader-editor">
        <CodeEditorPane
          v-if="chapter"
          ref="editorRef"
          :value="code"
          :language="formatted.language"
          :font-size="settings.state.readerFontSize"
          :light="light"
          :bookmarks="bookmarkLines"
          :annotation-counts="annotationCounts"
          @line-change="currentLine = $event"
          @scroll-ratio="onScrollRatio"
        />
        <div v-else class="reader-empty">
          <template v-if="loading">正在索引代码视图…</template>
          <template v-else-if="error">{{ error }}</template>
          <template v-else>选择左侧仓库开始代码审阅</template>
        </div>
      </div>

      <footer class="reader-status">
        <span>main*</span>
        <span>Ln {{ currentLine + 1 }}, Col 1</span>
        <span>{{ formatted.lines.length }} lines</span>
        <span>UTF-8</span>
        <span>{{ formatted.language.toUpperCase() }}</span>
        <span class="reader-status__spacer" />
        <span>审阅进度 {{ reviewPercent }}%</span>
        <span>{{ identity.state.nickname }}@{{ identity.nodeName }}</span>
      </footer>
    </section>

    <aside class="reader-rail">
      <div class="reader-rail__head">
        <span>评审意见</span>
        <em>{{ annotations.length }}</em>
      </div>
      <form class="reader-annotation-form" @submit.prevent="submitAnnotation">
        <textarea
          v-model="annotationDraft"
          rows="3"
          maxlength="500"
          placeholder="在当前行添加评审意见…"
          :disabled="!chapter || postingAnnotation"
        />
        <button type="submit" :disabled="!annotationDraft.trim() || postingAnnotation">
          提交评审
        </button>
        <span>同步间隔 5s</span>
      </form>
      <div class="reader-rail__list">
        <button
          v-for="annotation in annotations"
          :key="annotation.id"
          class="reader-note"
          @click="jumpToAnnotation(annotation)"
        >
          <span class="reader-note__meta">
            <b>{{ annotation.nickname }}</b>
            <em>段落 {{ annotation.paragraphIndex + 1 }}</em>
            <time>{{ clock(annotation.createdAt) }}</time>
          </span>
          <span class="reader-note__body">{{ annotation.content }}</span>
        </button>
        <p v-if="annotations.length === 0" class="reader-rail__empty">暂无评审意见</p>
      </div>

      <div class="reader-rail__head reader-rail__head--sub">
        <span>代码标记</span>
        <em>{{ bookmarks.length }}</em>
      </div>
      <div class="reader-rail__list">
        <div v-for="mark in bookmarks" :key="mark.id" class="reader-mark">
          <button class="reader-mark__jump" @click="jumpToBookmark(mark)">
            <span class="reader-note__meta">
              <b>第 {{ mark.chapterIndex + 1 }} 章 · 段落 {{ mark.paragraphIndex + 1 }}</b>
              <time>{{ clock(mark.createdAt) }}</time>
            </span>
            <span class="reader-note__body">{{ mark.excerpt || '（无摘录）' }}</span>
          </button>
          <button class="reader-mark__remove" title="删除标记" @click.stop="deleteBookmark(mark)">
            ×
          </button>
        </div>
        <p v-if="bookmarks.length === 0" class="reader-rail__empty">暂无代码标记</p>
      </div>
    </aside>

    <div v-if="importOpen" class="overlay" @click.self="importOpen = false">
      <form class="sheet reader-import" @submit.prevent="submitImport">
        <header class="sheet__head">
          <div>
            <h2>导入审阅数据集</h2>
            <p>支持 UTF-8 / GBK 编码的 txt，自动按章节标题拆分。</p>
          </div>
          <button type="button" class="icon-button" @click="importOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <label class="reader-import__row">
            <span>目标库</span>
            <select v-model="importScope">
              <option v-if="canUploadPublic" value="public">公共书库（所有人可读）</option>
              <option v-if="canManagePrivate" value="private">个人私有库（仅自己可见）</option>
            </select>
          </label>
          <label class="reader-import__row">
            <span>数据集文件</span>
            <input type="file" accept=".txt,text/plain" @change="onImportFile" />
          </label>
          <label class="reader-import__row">
            <span>书籍名称</span>
            <input v-model="importTitle" maxlength="255" placeholder="留空则取文件名" />
          </label>
          <label class="reader-import__row">
            <span>作者</span>
            <input v-model="importAuthor" maxlength="128" placeholder="可选" />
          </label>
          <label
            v-if="importScope === 'public' && canManageCategory && categories.length > 0"
            class="reader-import__row"
          >
            <span>分类</span>
            <select v-model="importCategoryId">
              <option :value="null">未分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <p v-if="importError" class="reader-import__error">{{ importError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>文件上限 8 MiB · 原文仅保存在服务端存储卷</span>
          <button class="primary-button" type="submit" :disabled="importing">
            {{ importing ? '导入中…' : '导入并索引' }}
          </button>
        </footer>
      </form>
    </div>

    <div v-if="shareOpen" class="overlay" @click.self="shareOpen = false">
      <div class="sheet reader-import">
        <header class="sheet__head">
          <div>
            <h2>分享私有内容</h2>
            <p>分享码只能用于发现内容与发起申请，不代表阅读授权。</p>
          </div>
          <button type="button" class="icon-button" @click="shareOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <label class="reader-import__row">
            <span>分享码</span>
            <input :value="shareToken" readonly placeholder="生成中…" />
          </label>
          <p v-if="shareError" class="reader-import__error">{{ shareError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>对方需持有分享码才能提交申请</span>
          <button class="primary-button" @click="copyShareToken">复制分享码</button>
        </footer>
      </div>
    </div>

    <div v-if="editOpen" class="overlay" @click.self="editOpen = false">
      <form class="sheet reader-import" @submit.prevent="submitEdit">
        <header class="sheet__head">
          <div>
            <h2>编辑书籍信息</h2>
            <p>仅作者本人或内容管理员可以修改。</p>
          </div>
          <button type="button" class="icon-button" @click="editOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <label class="reader-import__row">
            <span>书名</span>
            <input v-model="editTitle" maxlength="255" required />
          </label>
          <label class="reader-import__row">
            <span>作者</span>
            <input v-model="editAuthor" maxlength="128" />
          </label>
          <label class="reader-import__row">
            <span>简介</span>
            <input v-model="editDescription" maxlength="512" />
          </label>
          <label v-if="auth.hasPermission('reader.category.manage')" class="reader-import__row">
            <span>分类</span>
            <select v-model="editCategoryId">
              <option :value="null">未分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <label v-if="auth.hasPermission('reader.content.manage.any')" class="reader-import__row">
            <span>可见状态</span>
            <select v-model="editStatus">
              <option value="VISIBLE">公开可见</option>
              <option value="HIDDEN">隐藏</option>
            </select>
          </label>
          <p v-if="editError" class="reader-import__error">{{ editError }}</p>
        </div>
        <footer class="sheet__foot">
          <span>公共内容改动会对所有读者生效</span>
          <button class="primary-button" type="submit" :disabled="savingEdit">
            {{ savingEdit ? '保存中…' : '保存' }}
          </button>
        </footer>
      </form>
    </div>

    <ReaderRequestsDialog
      v-if="requestsOpen"
      :received="receivedRequests"
      :mine="myRequests"
      @close="requestsOpen = false"
      @decide="decideRequest"
    />

    <div v-if="shelfPickerOpen" class="overlay" @click.self="shelfPickerOpen = false">
      <div class="sheet reader-import">
        <header class="sheet__head">
          <div>
            <h2>加入书单</h2>
            <p>{{ book?.title ?? '' }}</p>
          </div>
          <button type="button" class="icon-button" @click="shelfPickerOpen = false">×</button>
        </header>
        <div class="reader-import__body">
          <button
            v-for="item in shelves"
            :key="item.id"
            class="reader-book"
            @click="addCurrentToShelf(item.id)"
          >
            <AppIcon name="bookmark" :size="13" />
            <span class="reader-book__title">{{ item.name }}</span>
            <em>{{ item.bookCount }}</em>
          </button>
          <p v-if="shelves.length === 0" class="reader-side__empty">
            还没有书单，可在「书单」标签下新建。
          </p>
        </div>
        <footer class="sheet__foot">
          <span>书单只有自己可见</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped src="./reader-view.css"></style>
