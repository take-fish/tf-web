import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LeaderboardEntry, MatchRecordPreview } from '@/types/games'

import LeaderboardPanel from '../LeaderboardPanel.vue'
import MatchRecordsPanel from '../MatchRecordsPanel.vue'

const updateLeaderboardEntry = vi.fn()
const updateMatchRecord = vi.fn()
const reorderMatchRecords = vi.fn()

vi.mock('@/modules/games/gameApi', () => ({
  updateLeaderboardEntry: (...args: unknown[]) => updateLeaderboardEntry(...args),
  updateMatchRecord: (...args: unknown[]) => updateMatchRecord(...args),
  reorderMatchRecords: (...args: unknown[]) => reorderMatchRecords(...args),
}))

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    rank: 1,
    userId: 'u1',
    nickname: '甲',
    championships: 2,
    runnerUps: 1,
    points: 30,
    visible: true,
    displayOrder: 0,
    matches: 3,
    wins: 2,
    losses: 1,
    bestScore: 100,
    ...overrides,
  }
}

function record(overrides: Partial<MatchRecordPreview> = {}): MatchRecordPreview {
  return {
    matchId: 'm1',
    tournamentId: 't1',
    tournamentName: '演练赛',
    gameId: 'heatmap-gomoku',
    kind: 'TOURNAMENT',
    roundNo: 1,
    slotNo: 1,
    stage: 'KNOCKOUT',
    status: 'FINISHED',
    player1UserId: 'u1',
    player1Nickname: '甲',
    player2UserId: 'u2',
    player2Nickname: '乙',
    player1Score: 2,
    player2Score: 1,
    winnerUserId: 'u1',
    createdAt: Date.UTC(2026, 0, 1),
    finishedAt: Date.UTC(2026, 0, 1),
    visible: true,
    displayOrder: 0,
    ...overrides,
  }
}

describe('LeaderboardPanel 管理员入口', () => {
  beforeEach(() => {
    updateLeaderboardEntry.mockReset()
  })

  it('普通玩家只看到榜单，没有调整按钮', () => {
    const wrapper = mount(LeaderboardPanel, { props: { entries: [entry()] } })

    expect(wrapper.text()).toContain('甲')
    expect(wrapper.find('.leaderboard__manage').exists()).toBe(false)
  })

  it('管理员可以展开调整面板并保存数值', async () => {
    updateLeaderboardEntry.mockResolvedValue(entry({ points: 99 }))
    const wrapper = mount(LeaderboardPanel, {
      props: { entries: [entry()], admin: true },
    })

    await wrapper.find('.leaderboard__manage').trigger('click')
    expect(wrapper.find('.leaderboard__editor').exists()).toBe(true)

    await wrapper.find('.leaderboard__editor-grid input').setValue('99')
    await wrapper.find('.leaderboard__save').trigger('click')
    await vi.waitFor(() => expect(updateLeaderboardEntry).toHaveBeenCalled())

    const [userId, patch] = updateLeaderboardEntry.mock.calls[0] as [string, { points: number }]
    expect(userId).toBe('u1')
    expect(patch.points).toBe(99)
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeTruthy())
  })

  it('被下架的行带标记，管理员仍能看到', () => {
    const wrapper = mount(LeaderboardPanel, {
      props: { entries: [entry({ visible: false })], admin: true },
    })

    expect(wrapper.text()).toContain('已下架')
  })
})

describe('MatchRecordsPanel 管理员入口', () => {
  beforeEach(() => {
    updateMatchRecord.mockReset()
    reorderMatchRecords.mockReset()
  })

  it('列表只展示预览信息，普通玩家没有管理按钮', () => {
    const wrapper = mount(MatchRecordsPanel, { props: { records: [record()] } })

    expect(wrapper.text()).toContain('演练赛')
    expect(wrapper.text()).toContain('甲 2 : 1 乙')
    expect(wrapper.find('.records__actions').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('小局')
  })

  it('管理员可以隐藏记录', async () => {
    updateMatchRecord.mockResolvedValue(record({ visible: false }))
    const wrapper = mount(MatchRecordsPanel, {
      props: { records: [record()], admin: true },
    })

    await wrapper.find('.records__toggle').trigger('click')
    await vi.waitFor(() => expect(updateMatchRecord).toHaveBeenCalledWith('m1', { visible: false }))
    await vi.waitFor(() => expect(wrapper.emitted('updated')).toBeTruthy())
  })

  it('管理员上移时按列表顺序整体重写权重', async () => {
    reorderMatchRecords.mockResolvedValue([
      record({ matchId: 'm2', displayOrder: 20 }),
      record({ matchId: 'm1', displayOrder: 10 }),
    ])
    const wrapper = mount(MatchRecordsPanel, {
      props: {
        records: [record({ matchId: 'm1' }), record({ matchId: 'm2', tournamentName: '第二场' })],
        admin: true,
      },
    })

    const upButtons = wrapper.findAll('.records__actions button')
    // 第二行的 ↑ 按钮（每行三个：↑ / ↓ / 隐藏）
    await upButtons[3]?.trigger('click')
    await vi.waitFor(() => expect(reorderMatchRecords).toHaveBeenCalled())

    const [items] = reorderMatchRecords.mock.calls[0] as [{ id: string; displayOrder: number }[]]
    expect(items[0]).toEqual({ id: 'm2', displayOrder: 20 })
    expect(items[1]).toEqual({ id: 'm1', displayOrder: 10 })
  })
})
