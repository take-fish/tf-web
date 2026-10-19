import { describe, expect, it } from 'vitest'

import { findAsciiArt } from '../asciiArt'
import { parseCommand } from '../commands'

describe('parseCommand', () => {
  it('识别基础命令', () => {
    expect(parseCommand('')).toEqual({ type: 'empty' })
    expect(parseCommand('pwd')).toEqual({ type: 'pwd' })
    expect(parseCommand('clear')).toEqual({ type: 'clear' })
    expect(parseCommand('help')).toEqual({ type: 'help' })
    expect(parseCommand('exit')).toEqual({ type: 'exit' })
    expect(parseCommand('ls /opt/chat/group')).toEqual({ type: 'ls' })
  })

  it('解析 cd 路径', () => {
    expect(parseCommand('cd dev-group')).toEqual({ type: 'cd', groupId: 'dev-group' })
    expect(parseCommand('cd /opt/chat/group/ops-oncall')).toEqual({
      type: 'cd',
      groupId: 'ops-oncall',
    })
    expect(parseCommand('cd')).toEqual({ type: 'unknown', raw: 'cd' })
  })

  it('解析 echo 与重定向', () => {
    expect(parseCommand('echo "今天需求改了吗" >> chat.log')).toEqual({
      type: 'echo',
      content: '今天需求改了吗',
    })
    expect(parseCommand("echo 'build passed' >> chat.log")).toEqual({
      type: 'echo',
      content: 'build passed',
    })
    expect(parseCommand('echo plain message')).toEqual({
      type: 'echo',
      content: 'plain message',
    })
  })

  it('解析 tail 模式', () => {
    expect(parseCommand('tail -n 20 chat.log')).toEqual({
      type: 'tail',
      follow: false,
      lines: 20,
    })
    expect(parseCommand('tail -f chat.log')).toEqual({
      type: 'tail',
      follow: true,
      lines: 20,
    })
    expect(parseCommand('tail')).toEqual({ type: 'tail', follow: false, lines: 20 })
    expect(parseCommand('tail -n 9999 chat.log')).toEqual({
      type: 'tail',
      follow: false,
      lines: 200,
    })
  })

  it('解析进程与 ssh 命令', () => {
    expect(parseCommand('ps aux | grep dev')).toEqual({ type: 'ps' })
    expect(parseCommand('ssh zhangsan')).toEqual({ type: 'ssh', target: 'zhangsan' })
    expect(parseCommand('ssh zhangsan@node-03')).toEqual({
      type: 'ssh',
      target: 'zhangsan@node-03',
    })
    expect(parseCommand('ssh')).toEqual({ type: 'unknown', raw: 'ssh' })
  })

  it('解析 ascii 脚本与未知命令', () => {
    expect(parseCommand('cat ascii/funny.cat')).toEqual({
      type: 'cat',
      name: 'ascii/funny.cat',
    })
    expect(parseCommand('rm -rf /')).toEqual({ type: 'unknown', raw: 'rm -rf /' })
  })
})

describe('ascii art', () => {
  it('支持带路径与裸文件名查找', () => {
    expect(findAsciiArt('ascii/funny.cat')?.name).toBe('funny.cat')
    expect(findAsciiArt('./funny.cat')?.name).toBe('funny.cat')
    expect(findAsciiArt('missing.cat')).toBeUndefined()
  })
})
