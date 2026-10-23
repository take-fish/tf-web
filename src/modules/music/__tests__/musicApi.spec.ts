import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addTrackToPlaylist,
  fetchSharedTracks,
  fetchTracks,
  importTrack,
  recordPlayback,
  requestAccess,
  shareTrack,
  trackStreamPath,
  updateTrack,
} from '../musicApi'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function lastCall() {
  const fetchMock = vi.mocked(globalThis.fetch)
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? []
  return { url: String(url), init: init as RequestInit }
}

describe('musicApi', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('曲库列表按 scope 与分类查询', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ tracks: [], total: 0, page: 0, size: 20 }),
    )

    await fetchTracks({ scope: 'public', categoryId: 2, q: '夜曲' })

    expect(lastCall().url).toBe(
      `/api/v1/music/tracks?scope=public&categoryId=2&q=${encodeURIComponent('夜曲')}`,
    )
  })

  it('共享曲目使用独立接口', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ tracks: [] }))

    await fetchSharedTracks()

    expect(lastCall().url).toBe('/api/v1/music/tracks/shared')
  })

  it('上传音频包含目标库、歌手与分类', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ id: 3, title: '夜曲' }, 201),
    )
    const file = new File(['mp3'], 'night.mp3', { type: 'audio/mpeg' })

    await importTrack(file, {
      scope: 'private',
      title: '夜曲',
      artist: '歌手',
      durationSec: 180,
      categoryId: 4,
    })

    const { url, init } = lastCall()
    expect(url).toBe('/api/v1/music/tracks/import')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('file')).toBe(file)
    expect(form.get('scope')).toBe('private')
    expect(form.get('artist')).toBe('歌手')
    expect(form.get('durationSec')).toBe('180')
    expect(form.get('categoryId')).toBe('4')
  })

  it('流式播放地址与授权范围由后端决定', () => {
    expect(trackStreamPath(42)).toBe('/api/v1/music/tracks/42/stream')
  })

  it('编辑与分享接口契约', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 7 }))
      .mockResolvedValueOnce(jsonResponse({ shareToken: 'share-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 2, status: 'PENDING' }, 201))

    await updateTrack(7, { title: '新曲名', status: 'HIDDEN' })
    const updateCall = lastCall()
    expect(updateCall.url).toBe('/api/v1/music/tracks/7')
    expect(updateCall.init.method).toBe('PATCH')
    expect(JSON.parse(String(updateCall.init.body))).toEqual({
      title: '新曲名',
      status: 'HIDDEN',
    })

    const link = await shareTrack(7)
    expect(link.shareToken).toBe('share-1')

    await requestAccess(7, 'share-1', '想听')
    expect(lastCall().url).toBe('/api/v1/music/tracks/7/access-requests')
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      shareToken: 'share-1',
      message: '想听',
    })
  })

  it('歌单加曲与播放记录', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse({ recordId: 1, ts: 2 }, 202))

    await addTrackToPlaylist(5, 9)
    expect(lastCall().url).toBe('/api/v1/music/playlists/5/tracks/9')
    expect(lastCall().init.method).toBe('POST')

    await recordPlayback(9, 'complete', 180)
    expect(lastCall().url).toBe('/api/v1/music/tracks/9/records')
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      action: 'complete',
      positionSec: 180,
    })
  })
})
