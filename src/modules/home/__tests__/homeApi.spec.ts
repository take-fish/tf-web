import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchUserStats } from '../homeApi'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('homeApi', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('读取启用用户统计并补齐缺省字段', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ active: 9, total: 12 }))
      .mockResolvedValueOnce(jsonResponse({ active: 3 }))

    await expect(fetchUserStats()).resolves.toEqual({ active: 9, total: 12 })
    await expect(fetchUserStats()).resolves.toEqual({ active: 3, total: 0 })

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0] ?? []
    expect(String(url)).toBe('/api/v1/user/stats')
  })
})
