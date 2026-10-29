import { describe, expect, it } from 'vitest'

import { formatDmLines, formatMessageLines } from '../format'
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
})
