import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  imageExtension,
  isSupportedImage,
  normalizeImageFile,
  readAsDataUrl,
  shrinkImage,
  splitDataUrl,
} from '../imageFile'

describe('splitDataUrl', () => {
  it('拆出 MIME 与标准 Base64', () => {
    expect(splitDataUrl('data:image/png;base64,aGVsbG8=')).toEqual({
      mime: 'image/png',
      data: 'aGVsbG8=',
    })
    expect(splitDataUrl('data:image/webp;base64,AAAA')).toEqual({
      mime: 'image/webp',
      data: 'AAAA',
    })
  })

  it('非 data URL 或非 base64 返回 null', () => {
    expect(splitDataUrl('https://example.com/a.png')).toBeNull()
    expect(splitDataUrl('data:image/png,plain')).toBeNull()
    expect(splitDataUrl('')).toBeNull()
  })
})

describe('image file helpers', () => {
  it('只认 PNG/JPEG/GIF/WebP', () => {
    expect(isSupportedImage(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(isSupportedImage(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe(true)
    expect(isSupportedImage(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toBe(false)
    expect(isSupportedImage(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe(false)
  })

  it('扩展名与大小文案', () => {
    expect(imageExtension('image/jpeg')).toBe('jpg')
    expect(imageExtension('image/webp')).toBe('webp')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1)).toBe('1 KB')
  })

  it('剪贴板图片没有文件名时补一个', () => {
    const pasted = new File(['x'], '', { type: 'image/jpeg' })
    const normalized = normalizeImageFile(pasted)
    expect(normalized.name).toMatch(/^pasted-\d+\.jpg$/)
    expect(normalizeImageFile(new File(['x'], 'keep.png', { type: 'image/png' })).name).toBe(
      'keep.png',
    )
  })

  it('读取为 Data URL', async () => {
    const dataUrl = await readAsDataUrl(new File(['hello'], 'a.png', { type: 'image/png' }))
    expect(dataUrl).toBe('data:image/png;base64,aGVsbG8=')
  })

  it('浏览器不支持 createImageBitmap 时不压缩', async () => {
    const original = globalThis.createImageBitmap
    // jsdom 默认不提供 createImageBitmap（部分实现提供时先移除）
    Object.defineProperty(globalThis, 'createImageBitmap', { value: undefined, configurable: true })
    try {
      const result = await shrinkImage(new File(['x'], 'a.png', { type: 'image/png' }), 1)
      expect(result).toBeNull()
    } finally {
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: original,
        configurable: true,
      })
    }
  })
})
