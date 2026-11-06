import { computed, ref } from 'vue'

import type { AgentImagePayload } from '@/api/agent'
import {
  formatBytes,
  isSupportedImage,
  MAX_IMAGE_INPUT_BYTES,
  normalizeImageFile,
  readAsDataUrl,
  shrinkImage,
  splitDataUrl,
} from '@/lib/imageFile'
import { pushToast } from '@/lib/toast'

/** 单条提问最多 6 张：配合约 800KB/张，请求体控制在 Nginx 10MB 以内。 */
export const MAX_AGENT_IMAGES = 6
export const MAX_AGENT_IMAGE_BYTES = 800 * 1024
export const MAX_AGENT_TOTAL_BYTES = 6 * 1024 * 1024

export interface DraftImage {
  id: number
  name: string
  mime: string
  /** 用于缩略图/预览的完整 data URL */
  dataUrl: string
  bytes: number
}

export interface ImagePreview {
  src: string
  label: string
}

/** 助手页待发送图片：浏览器内压缩成 ≤800KB，只保存在内存，不落库。 */
export function useAgentImages() {
  const images = ref<DraftImage[]>([])
  const preview = ref<ImagePreview | null>(null)
  const busy = ref(false)
  let seq = 0

  const count = computed(() => images.value.length)
  const totalBytes = computed(() => images.value.reduce((sum, image) => sum + image.bytes, 0))

  function removeImage(id: number) {
    images.value = images.value.filter((image) => image.id !== id)
  }

  function clearImages() {
    images.value = []
  }

  function openPreview(image: DraftImage, label?: string) {
    preview.value = { src: image.dataUrl, label: label ?? image.name }
  }

  function closePreview() {
    preview.value = null
  }

  async function addFiles(files: File[]): Promise<number> {
    if (!files.length) return 0
    // 连续粘贴/选择时不并发处理，避免两次校验都通过后突破 6 张上限。
    if (busy.value) {
      pushToast('图片还在处理中，请稍后再试')
      return 0
    }
    let added = 0
    for (const file of files) {
      if (images.value.length >= MAX_AGENT_IMAGES) {
        pushToast(`最多只能添加 ${MAX_AGENT_IMAGES} 张图片`)
        break
      }
      if (!isSupportedImage(file)) {
        pushToast(`仅支持 PNG/JPEG/GIF/WebP 图片：${file.name || '剪贴板图片'}`)
        continue
      }
      if (file.size > MAX_IMAGE_INPUT_BYTES) {
        pushToast('图片超过 20MB，请先压缩后再发送')
        continue
      }

      busy.value = true
      try {
        let upload = normalizeImageFile(file)
        if (upload.size > MAX_AGENT_IMAGE_BYTES) {
          const shrunk = await shrinkImage(upload, MAX_AGENT_IMAGE_BYTES)
          if (!shrunk) {
            pushToast(`图片压缩失败或仍超过 ${Math.round(MAX_AGENT_IMAGE_BYTES / 1024)}KB，请换一张`)
            continue
          }
          upload = normalizeImageFile(shrunk)
        }
        if (totalBytes.value + upload.size > MAX_AGENT_TOTAL_BYTES) {
          pushToast('图片总量超过 6MB，请减少数量或压缩后再试')
          continue
        }
        const dataUrl = await readAsDataUrl(upload)
        const parsed = splitDataUrl(dataUrl)
        if (!parsed) {
          pushToast('图片读取失败')
          continue
        }
        images.value.push({
          id: ++seq,
          name: upload.name || `图片 ${images.value.length + 1}`,
          mime: parsed.mime,
          dataUrl,
          bytes: upload.size,
        })
        added += 1
      } catch {
        pushToast('图片读取失败')
      } finally {
        busy.value = false
      }
    }
    return added
  }

  /** 转成请求体里的 `{mime, data}`；只取当前仍附着的图片。 */
  function toChatImages(): AgentImagePayload[] {
    const payload: AgentImagePayload[] = []
    for (const image of images.value) {
      const parsed = splitDataUrl(image.dataUrl)
      if (parsed) payload.push(parsed)
    }
    return payload
  }

  return {
    images,
    preview,
    busy,
    count,
    totalBytes,
    addFiles,
    removeImage,
    clearImages,
    openPreview,
    closePreview,
    toChatImages,
    formatBytes,
  }
}
