import { computed, ref } from 'vue'

import { useAuthStore } from '@/stores/auth'
import {
  addBookToShelf,
  approveAccessRequest,
  cancelAccessRequest,
  createCategory,
  createShelf,
  deleteBook,
  fetchBooks,
  fetchCategories,
  fetchMyAccessRequests,
  fetchMyBooks,
  fetchReceivedAccessRequests,
  fetchShelf,
  fetchShelves,
  fetchSharedBooks,
  importBook,
  previewSharedBook,
  rejectAccessRequest,
  requestAccess,
  revokeAccessRequest,
  shareBook,
  updateBook,
} from '@/modules/reader/readerApi'
import type {
  AccessRequest,
  BookSummary,
  Category,
  ContentStatus,
  Shelf,
  ShelfDetail,
} from '@/types/reader'
import { errorText } from './reader-helpers'
import type { useReaderCore } from './useReaderCore'

type ReaderCore = ReturnType<typeof useReaderCore>

export function useReaderLibrary(core: ReaderCore) {
  const auth = useAuthStore()

  const mode = ref<'public' | 'private' | 'shared' | 'shelves'>('public')
  const books = ref<BookSummary[]>([])

  const categories = ref<Category[]>([])
  const categoryFilter = ref<number | null>(null)
  const searchQuery = ref('')
  const categoryDraft = ref('')
  const categoryEditorOpen = ref(false)

  const shelves = ref<Shelf[]>([])
  const activeShelf = ref<ShelfDetail | null>(null)
  const shelfDraft = ref('')
  const shelfPickerOpen = ref(false)

  const shareTokenInput = ref('')
  const sharePreviewToken = ref('')
  const applying = ref(false)
  const applyMessage = ref('')
  const applyError = ref('')

  const requestsOpen = ref(false)
  const receivedRequests = ref<AccessRequest[]>([])
  const myRequests = ref<AccessRequest[]>([])

  const shareOpen = ref(false)
  const shareToken = ref('')
  const shareError = ref('')

  const editOpen = ref(false)
  const editTitle = ref('')
  const editAuthor = ref('')
  const editDescription = ref('')
  const editCategoryId = ref<number | null>(null)
  const editStatus = ref<ContentStatus>('VISIBLE')
  const editError = ref('')
  const savingEdit = ref(false)

  const importOpen = ref(false)
  const importFile = ref<File | null>(null)
  const importTitle = ref('')
  const importAuthor = ref('')
  const importScope = ref<'public' | 'private'>('public')
  const importCategoryId = ref<number | null>(null)
  const importing = ref(false)
  const importError = ref('')

  const canUploadPublic = computed(() => auth.hasPermission('reader.public.upload'))
  const canManagePrivate = computed(() => auth.hasPermission('reader.private.manage'))
  const canManageCategory = computed(() => auth.hasPermission('reader.category.manage'))
  const canImport = computed(() =>
    mode.value === 'private' ? canManagePrivate.value : canUploadPublic.value,
  )
  const pendingIncoming = computed(
    () => receivedRequests.value.filter((item) => item.status === 'PENDING').length,
  )

  async function loadShelves() {
    shelves.value = await fetchShelves()
    const first = shelves.value[0]
    if (first) {
      await selectShelf(first.id)
    } else {
      activeShelf.value = null
      books.value = []
      core.resetReader()
    }
  }

  async function selectShelf(shelfId: number) {
    const detail = await fetchShelf(shelfId)
    activeShelf.value = detail
    books.value = detail.books
    if (detail.books[0]) await core.selectBook(detail.books[0].id)
    else core.resetReader()
  }

  async function loadBooks() {
    core.loading.value = true
    core.error.value = ''
    try {
      if (mode.value === 'shelves') {
        await loadShelves()
        return
      }
      if (mode.value === 'private') {
        books.value = await fetchMyBooks()
      } else if (mode.value === 'shared') {
        books.value = await fetchSharedBooks()
      } else {
        const page = await fetchBooks({
          scope: 'public',
          categoryId: categoryFilter.value,
          q: searchQuery.value,
        })
        books.value = page.books
      }
      if (books.value[0]) await core.selectBook(books.value[0].id)
      else core.resetReader()
    } catch (value) {
      core.error.value = errorText(value)
    } finally {
      core.loading.value = false
    }
  }

  async function switchMode(next: 'public' | 'private' | 'shared' | 'shelves') {
    if (mode.value === next) return
    mode.value = next
    core.sharePreview.value = null
    shareTokenInput.value = ''
    activeShelf.value = null
    core.resetReader()
    await loadBooks()
  }

  async function loadCategories() {
    try {
      categories.value = await fetchCategories()
    } catch {
      // 分类不可用不影响主流程
    }
  }

  async function submitCategory() {
    const name = categoryDraft.value.trim()
    if (!name) return
    try {
      await createCategory(name)
      categoryDraft.value = ''
      categoryEditorOpen.value = false
      await loadCategories()
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  async function lookupShare() {
    const token = shareTokenInput.value.trim()
    if (!token) return
    core.error.value = ''
    applyError.value = ''
    try {
      const preview = await previewSharedBook(token)
      core.sharePreview.value = preview
      sharePreviewToken.value = token
      core.resetReader()
    } catch (value) {
      core.sharePreview.value = null
      core.error.value = errorText(value)
    }
  }

  async function submitAccessRequest() {
    if (!core.sharePreview.value || applying.value) return
    applying.value = true
    applyError.value = ''
    try {
      await requestAccess(
        core.sharePreview.value.id,
        sharePreviewToken.value,
        applyMessage.value,
      )
      applyMessage.value = ''
      core.error.value = ''
      core.sharePreview.value = null
      shareTokenInput.value = ''
      await loadBooks()
    } catch (value) {
      applyError.value = errorText(value)
    } finally {
      applying.value = false
    }
  }

  async function openShare() {
    if (!core.book.value) return
    shareOpen.value = true
    shareToken.value = ''
    shareError.value = ''
    try {
      const link = await shareBook(core.book.value.id)
      shareToken.value = link.shareToken
    } catch (value) {
      shareError.value = errorText(value)
    }
  }

  async function copyShareToken() {
    if (!shareToken.value) return
    try {
      await navigator.clipboard.writeText(shareToken.value)
      shareError.value = '已复制分享码'
    } catch {
      shareError.value = '复制失败，请手动选择分享码'
    }
  }

  function openEdit() {
    if (!core.book.value) return
    editOpen.value = true
    editTitle.value = core.book.value.title
    editAuthor.value = core.book.value.author
    editDescription.value = core.book.value.description
    editCategoryId.value = core.book.value.categoryId
    editStatus.value = core.book.value.status
    editError.value = ''
  }

  async function submitEdit() {
    if (!core.book.value || savingEdit.value) return
    savingEdit.value = true
    editError.value = ''
    try {
      await updateBook(core.book.value.id, {
        title: editTitle.value.trim(),
        author: editAuthor.value.trim(),
        description: editDescription.value.trim(),
        categoryId: editCategoryId.value,
        status: editStatus.value,
      })
      editOpen.value = false
      await loadBooks()
    } catch (value) {
      editError.value = errorText(value)
    } finally {
      savingEdit.value = false
    }
  }

  async function deleteCurrentBook() {
    if (!core.book.value) return
    if (!window.confirm(`确认删除《${core.book.value.title}》？删除后文件不可恢复。`)) return
    try {
      await deleteBook(core.book.value.id)
      core.resetReader()
      await loadBooks()
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  async function openShelfPicker() {
    shelfPickerOpen.value = true
    try {
      shelves.value = await fetchShelves()
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  async function addCurrentToShelf(shelfId: number) {
    if (!core.book.value) return
    try {
      await addBookToShelf(shelfId, core.book.value.id)
      shelfPickerOpen.value = false
      if (mode.value === 'shelves') await loadBooks()
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  async function submitShelf() {
    const name = shelfDraft.value.trim()
    if (!name) return
    try {
      await createShelf(name)
      shelfDraft.value = ''
      await loadBooks()
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  async function openRequests() {
    requestsOpen.value = true
    await refreshRequests()
  }

  async function refreshRequests() {
    try {
      const [received, mine] = await Promise.all([
        fetchReceivedAccessRequests(),
        fetchMyAccessRequests(),
      ])
      receivedRequests.value = received
      myRequests.value = mine
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  async function decideRequest(
    request: AccessRequest,
    action: 'approve' | 'reject' | 'revoke' | 'cancel',
  ) {
    try {
      if (action === 'approve') await approveAccessRequest(request.id)
      else if (action === 'reject') await rejectAccessRequest(request.id)
      else if (action === 'revoke') await revokeAccessRequest(request.id)
      else await cancelAccessRequest(request.id)
      await refreshRequests()
      if (mode.value === 'shared') await loadBooks()
    } catch (value) {
      core.error.value = errorText(value)
    }
  }

  function openImport() {
    if (!canImport.value) {
      core.error.value =
        mode.value === 'private' ? '没有管理个人书库的权限' : '没有向公共书库上传的权限'
      return
    }
    importOpen.value = true
    importError.value = ''
    importFile.value = null
    importTitle.value = ''
    importAuthor.value = ''
    importScope.value = mode.value === 'private' ? 'private' : 'public'
    importCategoryId.value = categoryFilter.value
  }

  function onImportFile(event: Event) {
    const input = event.target as HTMLInputElement
    importFile.value = input.files?.[0] ?? null
    if (importFile.value && !importTitle.value) {
      importTitle.value = importFile.value.name.replace(/\.txt$/i, '')
    }
  }

  async function submitImport() {
    if (!importFile.value || importing.value) {
      importError.value = '请选择 txt 文件'
      return
    }
    importing.value = true
    importError.value = ''
    try {
      const created = await importBook(importFile.value, {
        scope: importScope.value,
        title: importTitle.value,
        author: importAuthor.value,
        categoryId: importScope.value === 'public' ? importCategoryId.value : null,
      })
      importOpen.value = false
      mode.value = importScope.value === 'private' ? 'private' : 'public'
      await loadCategories()
      await loadBooks()
      await core.selectBook(created.id)
    } catch (value) {
      importError.value = errorText(value)
    } finally {
      importing.value = false
    }
  }

  return {
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
    sharePreviewToken,
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
    importFile,
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
  }
}
