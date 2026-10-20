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
    expect(parseCommand('cd')).toEqual({
      type: 'invalid',
      message: 'cd: 缺少会话组，例如 cd dev-group',
    })
  })

  it('兼容 echo 写法', () => {
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
    expect(parseCommand('echo')).toEqual({ type: 'invalid', message: 'echo: 消息内容为空' })
  })

  it('解析 tail 模式', () => {
    expect(parseCommand('tail -n 20 chat.log')).toEqual({ type: 'tail', lines: 20 })
    expect(parseCommand('tail -f chat.log')).toEqual({ type: 'tail', lines: 20 })
    expect(parseCommand('tail')).toEqual({ type: 'tail', lines: 20 })
    expect(parseCommand('tail -n 9999 chat.log')).toEqual({ type: 'tail', lines: 200 })
  })

  it('解析进程与 ssh 命令', () => {
    expect(parseCommand('ps aux | grep dev')).toEqual({ type: 'ps' })
    expect(parseCommand('ps')).toEqual({ type: 'ps' })
    expect(parseCommand('ssh zhangsan')).toEqual({ type: 'ssh', target: 'zhangsan' })
    expect(parseCommand('ssh zhangsan@node-03')).toEqual({
      type: 'ssh',
      target: 'zhangsan@node-03',
    })
    expect(parseCommand('ssh')).toEqual({ type: 'invalid', message: 'ssh: 缺少昵称或用户 ID' })
  })

  it('解析搜索、在线列表与撤回命令', () => {
    expect(parseCommand('grep "build passed"')).toEqual({
      type: 'grep',
      keyword: 'build passed',
    })
    expect(parseCommand('grep 需求')).toEqual({ type: 'grep', keyword: '需求' })
    expect(parseCommand('grep')).toEqual({ type: 'invalid', message: 'grep: 缺少搜索关键字' })
    expect(parseCommand('who')).toEqual({ type: 'who' })
    expect(parseCommand('recall #a1b2c3')).toEqual({
      type: 'recall',
      messageId: '#a1b2c3',
    })
    expect(parseCommand('recall')).toEqual({ type: 'invalid', message: 'recall: 缺少消息 ID' })
  })

  it('解析 ascii 脚本', () => {
    expect(parseCommand('cat ascii/funny.cat')).toEqual({
      type: 'cat',
      name: 'ascii/funny.cat',
    })
    expect(parseCommand('cat')).toEqual({ type: 'invalid', message: 'cat: 缺少脚本名' })
  })

  it('普通文本直接作为消息', () => {
    expect(parseCommand('今晚 22:00 发布，请确认')).toEqual({
      type: 'message',
      content: '今晚 22:00 发布，请确认',
    })
    expect(parseCommand('rm -rf /')).toEqual({ type: 'message', content: 'rm -rf /' })
    expect(parseCommand('whoami')).toEqual({ type: 'message', content: 'whoami' })
    expect(parseCommand('cat 是猫')).toEqual({ type: 'message', content: 'cat 是猫' })
    expect(parseCommand('cat missing.cat')).toEqual({ type: 'message', content: 'cat missing.cat' })
  })

  it('命令词开头的普通句子不被误判', () => {
    expect(parseCommand('who are you?')).toEqual({ type: 'message', content: 'who are you?' })
    expect(parseCommand('ps 我错了')).toEqual({ type: 'message', content: 'ps 我错了' })
    expect(parseCommand('help me')).toEqual({ type: 'message', content: 'help me' })
    expect(parseCommand('ls 你好')).toEqual({ type: 'message', content: 'ls 你好' })
    expect(parseCommand('tail 你好')).toEqual({ type: 'message', content: 'tail 你好' })
  })
})

describe('ascii art', () => {
  it('支持带路径与裸文件名查找', () => {
    expect(findAsciiArt('ascii/funny.cat')?.name).toBe('funny.cat')
    expect(findAsciiArt('./funny.cat')?.name).toBe('funny.cat')
    expect(findAsciiArt('missing.cat')).toBeUndefined()
  })
})
