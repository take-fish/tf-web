import { describe, expect, it } from 'vitest'

import { BreakoutEngine } from '../lib/breakoutEngine'

describe('BreakoutEngine', () => {
  it('paddle 不越界，ready 时球跟随挡板', () => {
    const engine = new BreakoutEngine()
    engine.movePaddle(-100)
    expect(engine.paddle.x).toBe(0)
    engine.movePaddle(engine.width + 100)
    expect(engine.paddle.x + engine.paddle.w).toBe(engine.width)
    expect(engine.ball.x).toBe(engine.paddle.x + engine.paddle.w / 2)
  })

  it('发球后进入 playing', () => {
    const engine = new BreakoutEngine()
    engine.launch()
    expect(engine.status).toBe('playing')
    expect(engine.ball.vy).toBeLessThan(0)
  })

  it('击中 QPS 砖块得分并反弹', () => {
    const engine = new BreakoutEngine()
    const brick = engine.bricks[0]
    if (!brick) throw new Error('brick missing')
    engine.status = 'playing'
    engine.ball.x = brick.x + brick.w / 2
    engine.ball.y = brick.y + brick.h + engine.ball.r - 1
    engine.ball.vx = 0
    engine.ball.vy = -300

    const result = engine.step(16)

    expect(result.brickHit).toBe(true)
    expect(brick.alive).toBe(false)
    expect(engine.score).toBeGreaterThan(0)
    expect(engine.ball.vy).toBeGreaterThan(0)
  })

  it('掉球扣命，命中底线三次后失败', () => {
    const engine = new BreakoutEngine()
    engine.status = 'playing'
    engine.ball.y = engine.height + 30
    const first = engine.step(16)
    expect(first.lifeLost).toBe(true)
    expect(engine.lives).toBe(2)
    expect(engine.status).toBe('ready')

    engine.lives = 1
    engine.status = 'playing'
    engine.ball.y = engine.height + 30
    engine.step(16)
    expect(engine.status).toBe('lost')
  })

  it('清空砖块进入下一关', () => {
    const engine = new BreakoutEngine()
    engine.status = 'playing'
    for (const brick of engine.bricks) brick.alive = false
    const result = engine.step(16)
    expect(result.levelCleared).toBe(true)
    expect(engine.level).toBe(2)
    expect(engine.bricks.some((brick) => brick.alive)).toBe(true)
    expect(engine.status).toBe('ready')
  })

  it('挡板反弹恢复向上速度', () => {
    const engine = new BreakoutEngine()
    engine.status = 'playing'
    engine.ball.x = engine.paddle.x + engine.paddle.w / 2
    engine.ball.y = engine.paddle.y - engine.ball.r - 1
    engine.ball.vx = 20
    engine.ball.vy = 300
    engine.step(16)
    expect(engine.ball.vy).toBeLessThan(0)
  })
})
