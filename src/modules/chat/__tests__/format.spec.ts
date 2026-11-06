import { describe, expect, it } from 'vitest'

import { formatDmLines, formatMessageLines, helpLines } from '../format'
import type { ChatMessage } from '@/types/chat'

const base: ChatMessage = {
  id: 'm-1',
  seq: 1,
  groupId: 'dev-group',
  fromUserId: 'u1',
  fromNickname: '甲',
  fromNode: 'dev-node-01',
  toUserId: null,
  content: 'hi',
  kind: 'text',
  ts: 1,
  clientMsgId: null,
  recalled: false,
}

describe('format image messages', () => {
  it('群聊图片只输出占位符，不泄露 data URL', () => {
    const lines = formatMessageLines({
      ...base,
      kind: 'image',
      content: 'data:image/png;base64,AAAA',
    })

    expect(lines.join('\n')).toContain('[图片] #m-1')
    expect(lines.join('\n')).not.toContain('base64')
  })

  it('私聊图片只输出占位符，不泄露 imageId', () => {
    const lines = formatDmLines({
      ...base,
      groupId: null,
      toUserId: 'u2',
      kind: 'image',
      content: 'img-secret',
    })

    expect(lines.join('\n')).toContain('[图片] #m-1')
    expect(lines.join('\n')).not.toContain('img-secret')
  })

  it('帮助里说明先发图再 @ 助手可识别图中文字', () => {
    const help = helpLines().join('\n')

    expect(help).toContain('先发图再 @<助手名>')
    expect(help).toContain('2 分钟')
  })
})

describe('format streaming agent replies', () => {
  it('群聊里同一 streamId 的后续片段不再重复消息头', () => {
    const first = formatMessageLines({ ...base, streamId: 's-1', content: '结论：' })
    const next = formatMessageLines(
      { ...base, id: 'm-2', streamId: 's-1', content: '没有 5xx。' },
      true,
    )

    expect(first[0]).toContain('甲@dev-node-01:')
    expect(first[0]).toContain('结论：')
    expect(next).toEqual(['  没有 5xx。'])
  })

  it('私聊里同一 streamId 的后续片段同样只缩进不加头', () => {
    const dm = { ...base, groupId: null, toUserId: 'u2', streamId: 's-2' }
    const first = formatDmLines(dm)
    const next = formatDmLines({ ...dm, id: 'm-3', content: '第二段' }, true)

    expect(first[0]).toContain('[DM]')
    expect(next).toEqual(['  第二段'])
  })

  it('换一条新回答（新 streamId）时重新输出消息头', () => {
    const lines = formatMessageLines({ ...base, id: 'm-4', streamId: 's-3', content: '新回答' })

    expect(lines[0]).toContain('甲@dev-node-01:')
  })
})
