import { computed, ref } from 'vue'
import type { Ref } from 'vue'

import { ApiError } from '@/lib/http'
import { fetchImageBlob } from '@/modules/chat/chatApi'
import { shortId } from '@/modules/chat/format'
import type { ChatMessage } from '@/modules/chat/types'

import type { GalleryEntry, TerminalApi } from './types'

interface ChatMessagesOptions {
  terminalRef: Ref<TerminalApi | null>
  onAuthFailure: () => void
}

const MAX_TRACKED_IMAGES = 200
const MAX_DISMISSED_GALLERY_IDS = 200

export function useChatMessages(options: ChatMessagesOptions) {
  const { terminalRef, onAuthFailure } = options

  const preview = ref<GalleryEntry | null>(null)
  const galleryMessages = ref<ChatMessage[]>([])
  const dismissedGalleryIds = ref<Set<string>>(new Set())
  const imageSources = ref<Record<string, string>>({})

  const seenIds = new Set<string>()
  const shortIds = new Map<string, string>()
  const shortOrder: string[] = []
  const imageMessages = new Map<string, ChatMessage>()
  const imagePromises = new Map<string, Promise<string | null>>()
  let galleryEpoch = 0

  const gallery = computed<GalleryEntry[]>(() =>
    galleryMessages.value.flatMap((message) => {
      const src = message.groupId ? message.content : imageSources.value[message.content]
      return src ? [{ message, src }] : []
    }),
  )

  function handleAuthError(error: unknown): boolean {
    if (error instanceof ApiError && error.status === 401) {
      onAuthFailure()
      return true
    }
    return false
  }

  function rememberMessage(message: ChatMessage): boolean {
    if (seenIds.has(message.id)) return false
    seenIds.add(message.id)
    const key = shortId(message.id)
    if (!shortIds.has(key)) {
      shortIds.set(key, message.id)
      shortOrder.push(key)
      if (shortOrder.length > 500) {
        const evicted = shortOrder.shift()
        if (evicted) shortIds.delete(evicted)
      }
    } else {
      shortIds.set(key, message.id)
    }
    return true
  }

  function clearGallery() {
    // 切会话后旧图片请求可能仍在路上，用 epoch 丢弃过期结果，避免把旧会话图片塞进新会话。
    galleryEpoch += 1
    galleryMessages.value = []
    dismissedGalleryIds.value = new Set()
    preview.value = null
    imageMessages.clear()
    imagePromises.clear()
    for (const url of Object.values(imageSources.value)) {
      URL.revokeObjectURL(url)
    }
    imageSources.value = {}
  }

  function rememberImageMessage(message: ChatMessage) {
    if (message.kind !== 'image' || message.recalled) return
    imageMessages.set(message.id, message)
    if (imageMessages.size <= MAX_TRACKED_IMAGES) return
    const oldest = imageMessages.keys().next().value
    if (oldest) imageMessages.delete(oldest)
  }

  async function ensureImageSource(message: ChatMessage): Promise<string | null> {
    if (message.groupId) return message.content
    const imageId = message.content
    if (!imageId) return null
    const cached = imageSources.value[imageId]
    if (cached) return cached
    const pending = imagePromises.get(imageId)
    if (pending) return pending

    const epoch = galleryEpoch
    const promise = fetchImageBlob(imageId)
      .then((blob) => {
        if (epoch !== galleryEpoch) return null
        const src = URL.createObjectURL(blob)
        imageSources.value = { ...imageSources.value, [imageId]: src }
        return src
      })
      .catch((error: unknown) => {
        if (epoch === galleryEpoch && !handleAuthError(error)) {
          terminalRef.value?.writeLiveLines(
            [`[WARN] 图片 #${shortId(message.id)} 加载失败`],
            'warn',
          )
        }
        return null
      })
      .finally(() => {
        imagePromises.delete(imageId)
      })
    imagePromises.set(imageId, promise)
    return promise
  }

  function addGallery(message: ChatMessage) {
    if (message.kind !== 'image' || message.recalled) return
    // 缩略图只保留最近 12 张，但点击终端里更早的图片占位符时仍要能预览。
    rememberImageMessage(message)
    if (dismissedGalleryIds.value.has(message.id)) return
    if (galleryMessages.value.some((item) => item.id === message.id)) return
    galleryMessages.value = [...galleryMessages.value, message].slice(-12)
    void ensureImageSource(message)
  }

  function dismissGallery(message: ChatMessage) {
    // 只从底部缩略图移除，保留 imageMessages 与图片缓存，终端里的 [图片] 链接仍可预览。
    const next = new Set(dismissedGalleryIds.value)
    next.add(message.id)
    while (next.size > MAX_DISMISSED_GALLERY_IDS) {
      const oldest = next.values().next().value
      if (!oldest) break
      next.delete(oldest)
    }
    dismissedGalleryIds.value = next
    galleryMessages.value = galleryMessages.value.filter((item) => item.id !== message.id)
    if (preview.value?.message.id === message.id) {
      preview.value = null
    }
    terminalRef.value?.focus()
  }

  async function previewImageByShortId(id: string) {
    const messageId = shortIds.get(id)
    const known = messageId ? imageMessages.get(messageId) : undefined
    const message = known
      ?? Array.from(imageMessages.values()).find((item) => shortId(item.id) === id)
    if (!message) {
      terminalRef.value?.writeLiveLines(
        [`[WARN] 图片 #${id} 不在当前图片索引中，可点击下方缩略图查看`],
        'warn',
      )
      return
    }
    const src = await ensureImageSource(message)
    // 等待期间切换会话/撤回时不再打开旧预览。
    if (!src || !imageMessages.has(message.id)) return
    preview.value = { message, src }
  }

  return {
    gallery,
    preview,
    shortIds,
    rememberMessage,
    clearGallery,
    addGallery,
    dismissGallery,
    previewImageByShortId,
  }
}
