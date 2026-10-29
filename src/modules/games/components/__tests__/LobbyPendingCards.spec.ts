import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { GameMatch, GameTournament } from '@/types/games'

import LobbyPendingCards from '../LobbyPendingCards.vue'

function tournament(overrides: Partial<GameTournament> = {}): GameTournament {
  return {
    id: 't1',
    name: '测试赛事',
    gameId: 'heatmap-gomoku',
    kind: 'TOURNAMENT',
    format: 'BO3',
    bracketType: 'KNOCKOUT',
    status: 'INVITING',
    creatorUserId: 'u1',
    creatorNickname: 'Alice',
    targetPlayers: 4,
    inviteDeadline: 0,
    currentRound: 0,
    totalRounds: 2,
    championUserId: null,
    championNickname: null,
    runnerUpUserId: null,
    runnerUpNickname: null,
    createdAt: 0,
    startedAt: null,
    finishedAt: null,
    players: [],
    matches: [],
    ...overrides,
  }
}

function match(overrides: Partial<GameMatch> = {}): GameMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    gameId: 'heatmap-gomoku',
    kind: 'TOURNAMENT',
    roundNo: 1,
    slotNo: 1,
    stage: 'KNOCKOUT',
    status: 'RUNNING',
    player1UserId: 'u1',
    player1Nickname: 'Alice',
    player2UserId: 'u2',
    player2Nickname: 'Bob',
    player1Score: 0,
    player2Score: 0,
    winnerUserId: null,
    nextMatchId: null,
    firstGameId: null,
    gameChooserUserId: null,
    createdAt: 0,
    startedAt: 0,
    finishedAt: null,
    currentRound: null,
    ...overrides,
  }
}

describe('LobbyPendingCards', () => {
  it('剩余时间倒计时并允许接受邀请', async () => {
    const invitation = tournament({ id: 'i1', name: '晨间邀请', inviteDeadline: 65_000 })
    const wrapper = mount(LobbyPendingCards, {
      props: { invitations: [invitation], activeMatches: [], actingId: '', now: 5_000 },
    })

    expect(wrapper.text()).toContain('晨间邀请')
    expect(wrapper.text()).toContain('剩余 1:00')
    expect(wrapper.text()).toContain('Alice 邀请你')

    await wrapper.get('.lobby__button--primary').trigger('click')
    expect(wrapper.emitted('respond')).toEqual([[invitation, true]])
  })

  it('超时邀请禁用接受按钮', async () => {
    const invitation = tournament({ id: 'i2', inviteDeadline: 1_000 })
    const wrapper = mount(LobbyPendingCards, {
      props: { invitations: [invitation], activeMatches: [], actingId: '', now: 9_000 },
    })

    expect(wrapper.text()).toContain('邀请已超时')
    expect(wrapper.get('.lobby__button--primary').attributes('disabled')).toBeDefined()

    await wrapper.findAll('.lobby__button')[1]!.trigger('click')
    expect(wrapper.emitted('respond')).toEqual([[invitation, false]])
  })

  it('处理中的邀请禁用两个按钮', () => {
    const wrapper = mount(LobbyPendingCards, {
      props: {
        invitations: [tournament({ inviteDeadline: 9_000 })],
        activeMatches: [],
        actingId: 't1',
        now: 0,
      },
    })

    for (const button of wrapper.findAll('.lobby__button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
  })

  it('进行中的演练展示对局并抛出查看事件', async () => {
    const active = match({ status: 'RUNNING' })
    const wrapper = mount(LobbyPendingCards, {
      props: { invitations: [], activeMatches: [active], actingId: '', now: 0 },
    })

    expect(wrapper.text()).toContain('进行中的演练')
    expect(wrapper.text()).toContain('执行中')

    await wrapper.get('.lobby__active-match').trigger('click')
    expect(wrapper.emitted('watch')).toEqual([['m1']])
  })

  it('没有邀请与对局时不渲染卡片', () => {
    const wrapper = mount(LobbyPendingCards, {
      props: { invitations: [], activeMatches: [], actingId: '', now: 0 },
    })

    expect(wrapper.find('.lobby__card').exists()).toBe(false)
  })
})
