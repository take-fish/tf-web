import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_AGENT_IMAGES, useAgentImages } from '../useAgentImages'

const mocks = vi.hoisted(() => ({ toasts: [] as string[] }))

vi.mock('@/lib/toast', () => ({
  pushToast: (message: string) => mocks.toasts.push(message),
}))

function pngFile(name = 'shot.png', content = 'hello'): File {
  return new File([content], name, { type: 'image/png' })
}

describe('useAgentImages', () => {
  beforeEach(() => {
    mocks.toasts.length = 0
  })

  it('添加小图后生成缩略图与请求体', async () => {
    const images = useAgentImages()
    const added = await images.addFiles([pngFile(), pngFile('shot2.png')])

    expect(added).toBe(2)
    expect(images.images.value).toHaveLength(2)
    expect(images.images.value[0]?.dataUrl).toBe('data:image/png;base64,aGVsbG8=')
    expect(images.toChatImages()).toEqual([
      { mime: 'image/png', data: 'aGVsbG8=' },
      { mime: 'image/png', data: 'aGVsbG8=' },
    ])
  })

  it('拒绝不支持的类型与超大原图', async () => {
    const images = useAgentImages()
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })
    // 只走大小校验，不会真正分配 20MB
    const huge = { type: 'image/png', size: 21 * 1024 * 1024, name: 'huge.png' } as File

    const added = await images.addFiles([svg, huge])

    expect(added).toBe(0)
    expect(images.images.value).toHaveLength(0)
    expect(mocks.toasts.some((text) => text.includes('PNG/JPEG/GIF/WebP'))).toBe(true)
    expect(mocks.toasts.some((text) => text.includes('20MB'))).toBe(true)
  })

  it('最多保留 6 张', async () => {
    const images = useAgentImages()
    const files = Array.from({ length: MAX_AGENT_IMAGES + 1 }, (_, index) =>
      pngFile(`shot-${index}.png`),
    )

    const added = await images.addFiles(files)

    expect(added).toBe(MAX_AGENT_IMAGES)
    expect(images.images.value).toHaveLength(MAX_AGENT_IMAGES)
    expect(mocks.toasts.some((text) => text.includes('最多只能添加'))).toBe(true)
  })

  it('连续添加时不并发处理，避免突破上限', async () => {
    const images = useAgentImages()
    const first = images.addFiles([pngFile('a.png')])
    const second = await images.addFiles([pngFile('b.png')])
    await first

    expect(second).toBe(0)
    expect(images.images.value).toHaveLength(1)
    expect(mocks.toasts.some((text) => text.includes('还在处理中'))).toBe(true)
  })

  it('删除单张与清空', async () => {
    const images = useAgentImages()
    await images.addFiles([pngFile(), pngFile('b.png')])
    const first = images.images.value[0]!

    images.removeImage(first.id)
    expect(images.images.value).toHaveLength(1)

    images.clearImages()
    expect(images.images.value).toHaveLength(0)
  })

  it('打开与关闭预览', async () => {
    const images = useAgentImages()
    await images.addFiles([pngFile('a.png')])

    images.openPreview(images.images.value[0]!, '图片 1 · a.png')
    expect(images.preview.value).toEqual({
      src: 'data:image/png;base64,aGVsbG8=',
      label: '图片 1 · a.png',
    })

    images.closePreview()
    expect(images.preview.value).toBeNull()
  })
})
