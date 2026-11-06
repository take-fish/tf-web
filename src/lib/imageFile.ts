/**
 * 图片文件通用工具：聊天页与助手页共用类型校验、Data URL 读取与等比压缩。
 * 只处理浏览器内存里的 File/Blob，不上传、不落盘。
 */

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
/** 原图输入上限；超过直接拒绝，避免浏览器解压超大图。 */
export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024

export function isSupportedImage(file: File): boolean {
  return IMAGE_TYPES.includes(file.type)
}

export function imageExtension(type: string): string {
  if (type === 'image/jpeg') return 'jpg'
  const ext = type.split('/')[1] ?? 'png'
  return ext.replace(/[^a-z0-9]/gi, '') || 'png'
}

/** 剪贴板图片有时没有文件名，补一个，保证后续上传/命名稳定。 */
export function normalizeImageFile(file: File): File {
  if (file.name) return file
  return new File([file], `pasted-${Date.now()}.${imageExtension(file.type)}`, { type: file.type })
}

export function formatBytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

/** 拆出 data URL 的 MIME 与标准 Base64；格式不合法返回 null。 */
export function splitDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const mime = match[1] ?? ''
  const data = match[2] ?? ''
  if (!mime || !data) return null
  return { mime, data }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * 超过 limit 时用 canvas 转 WebP/JPEG 并逐步缩小；GIF 动图仅在超限时退化为静态帧。
 * 浏览器不支持 createImageBitmap 或压缩后仍超限时返回 null。
 */
export async function shrinkImage(file: File, limit: number): Promise<File | null> {
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
