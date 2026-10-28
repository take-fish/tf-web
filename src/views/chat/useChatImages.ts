import type { Ref } from 'vue'

import { ApiError, formatApiError } from '@/lib/http'
import { uploadImage } from '@/modules/chat/chatApi'
import type { ChatSocketClient } from '@/modules/chat/chatSocket'
import type { OnlineMember } from '@/modules/chat/types'

import type { TerminalApi } from './types'

interface ChatImagesOptions {
  terminalRef: Ref<TerminalApi | null>
  getDmPeer: () => OnlineMember | null
  getGroupId: () => string
  getSocket: () => ChatSocketClient | null
  onAuthFailure: () => void
  focusTerminal: () => void
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_DIRECT_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_GROUP_IMAGE_BYTES = 1024 * 1024
const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024

export function useChatImages(options: ChatImagesOptions) {
  const { terminalRef, getDmPeer, getGroupId, getSocket, onAuthFailure, focusTerminal } = options

  function errorText(error: unknown): string {
    return formatApiError(error)
  }

  function handleAuthError(error: unknown): boolean {
    if (error instanceof ApiError && error.status === 401) {
      onAuthFailure()
      return true
    }
    return false
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
  }

  function imageExtension(type: string): string {
    if (type === 'image/jpeg') return 'jpg'
    const ext = type.split('/')[1] ?? 'png'
    return ext.replace(/[^a-z0-9]/gi, '') || 'png'
  }

  function normalizeImageFile(file: File): File {
    // 剪贴板图片有时没有文件名，补一个，保证 multipart 上传与后端扩展名判断稳定。
    if (file.name) return file
    return new File([file], `pasted-${Date.now()}.${imageExtension(file.type)}`, { type: file.type })
  }

  function sizeLabel(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  function canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number,
  ): Promise<Blob | null> {
    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), type, quality)
      } catch {
        resolve(null)
      }
    })
  }

  // 群聊图片走 WebSocket data URL（上限 1MB），粘贴的截图常常超过。
  // 超限时用 canvas 转 WebP/JPEG 并逐步缩小；GIF 动图仅在超限时退化为静态帧。
  async function shrinkImage(file: File, limit: number): Promise<File | null> {
    if (typeof createImageBitmap !== 'function') return null
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return null
    }
    try {
      const longSide = Math.max(bitmap.width, bitmap.height, 1)
      const initialScale = Math.min(1, 1920 / longSide)
      let width = Math.max(1, Math.round(bitmap.width * initialScale))
      let height = Math.max(1, Math.round(bitmap.height * initialScale))
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) return null
        context.drawImage(bitmap, 0, 0, width, height)
        for (const type of ['image/webp', 'image/jpeg'] as const) {
          const blob = await canvasToBlob(canvas, type, 0.82)
          if (blob && blob.type === type && blob.size <= limit) {
            const ext = type === 'image/webp' ? 'webp' : 'jpg'
            return new File([blob], `image-${Date.now()}.${ext}`, { type })
          }
        }
        width = Math.max(1, Math.round(width * 0.75))
        height = Math.max(1, Math.round(height * 0.75))
      }
    } finally {
      bitmap.close()
    }
    return null
  }

  async function sendImageFile(file: File) {
    const term = terminalRef.value
    if (!term) return
    try {
      if (!IMAGE_TYPES.includes(file.type)) {
        term.writeLines(['[ERROR] 仅支持 PNG/JPEG/GIF/WebP 图片'], 'error')
        return
      }
      if (file.size > MAX_IMAGE_INPUT_BYTES) {
        term.writeLines(['[ERROR] 图片超过 20MB，请先压缩后再发送'], 'error')
        return
      }
      const peer = getDmPeer()
      const groupId = getGroupId()
      const inDm = Boolean(peer)
      const limit = inDm ? MAX_DIRECT_IMAGE_BYTES : MAX_GROUP_IMAGE_BYTES
      let upload = normalizeImageFile(file)
      if (upload.size > limit) {
        term.writeLines(
          [`[INFO] 图片 ${sizeLabel(upload.size)}，超过${inDm ? '私聊' : '群聊'}限制，正在压缩...`],
          'dim',
        )
        const shrunk = await shrinkImage(upload, limit)
        if (!shrunk) {
          term.writeLines(
            [`[ERROR] 图片超过 ${Math.round(limit / 1024 / 1024)}MB 限制，自动压缩失败`],
            'error',
          )
          return
        }
        upload = normalizeImageFile(shrunk)
        term.writeLines([`[INFO] 已压缩为 ${sizeLabel(upload.size)}`], 'dim')
      }
      if (peer) {
        const image = await uploadImage(upload)
        if (getDmPeer()?.userId !== peer.userId) {
          term.writeLines(['[WARN] 会话已切换，图片未发送'], 'warn')
          return
        }
        if (!getSocket()?.sendDirectImage(peer.userId, image.id)) {
          term.writeLines(['[ERROR] 消息通道未连接，图片未发送'], 'error')
          return
        }
        term.writeLines(
          [`[INFO] 图片已发送（私聊持久化，${Math.max(1, Math.round(image.size / 1024))} KB）`],
          'dim',
        )
        return
      }
      const dataUrl = await readAsDataUrl(upload)
      if (getGroupId() !== groupId || getDmPeer()) {
        term.writeLines(['[WARN] 会话已切换，图片未发送'], 'warn')
        return
      }
      if (!getSocket()?.sendGroupImage(dataUrl)) {
        term.writeLines(['[ERROR] 消息通道未连接，图片未发送'], 'error')
        return
      }
      term.writeLines(['[INFO] 图片已发送（群聊临时消息，不保存）'], 'dim')
    } catch (error) {
      if (!handleAuthError(error)) {
        term.writeLines([`[ERROR] ${errorText(error)}`], 'error')
      }
    } finally {
      // 关闭文件选择框/粘贴图片后把键盘焦点还给终端，避免退格/打字无响应。
      term.focus()
    }
  }

  async function onImagePicked(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    input.value = ''
    if (!file) {
      focusTerminal()
      return
    }
    await sendImageFile(file)
  }

  async function onPasteImages(files: File[]) {
    const term = terminalRef.value
    if (!term || files.length === 0) return
    if (files.length > 1) {
      term.writeLines([`[INFO] 收到 ${files.length} 张粘贴图片，将按顺序发送`], 'dim')
    }
    for (const file of files) {
      await sendImageFile(file)
    }
  }

  return {
    onImagePicked,
    onPasteImages,
  }
}
