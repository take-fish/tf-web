import type { Ref } from 'vue'

import { ApiError, formatApiError } from '@/lib/http'
import {
  formatBytes,
  IMAGE_TYPES,
  MAX_IMAGE_INPUT_BYTES,
  normalizeImageFile,
  readAsDataUrl,
  shrinkImage,
} from '@/lib/imageFile'
import { uploadImage } from '@/modules/chat/chatApi'
import type { ChatSocketClient } from '@/modules/chat/chatSocket'
import type { OnlineMember } from '@/types/chat'

import type { TerminalApi } from './types'

interface ChatImagesOptions {
  terminalRef: Ref<TerminalApi | null>
  getDmPeer: () => OnlineMember | null
  getGroupId: () => string
  getSocket: () => ChatSocketClient | null
  onAuthFailure: () => void
  focusTerminal: () => void
}

const MAX_DIRECT_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_GROUP_IMAGE_BYTES = 1024 * 1024

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
          [`[INFO] 图片 ${formatBytes(upload.size)}，超过${inDm ? '私聊' : '群聊'}限制，正在压缩...`],
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
        term.writeLines([`[INFO] 已压缩为 ${formatBytes(upload.size)}`], 'dim')
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
          [
            `[INFO] 图片已发送（私聊持久化，${Math.max(1, Math.round(image.size / 1024))} KB）；` +
              '2 分钟内 @<助手名> 可识别图中文字',
          ],
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
      term.writeLines(
        ['[INFO] 图片已发送（群聊临时消息，不保存）；2 分钟内 @<助手名> 可识别图中文字'],
        'dim',
      )
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
