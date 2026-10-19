export type BreakoutStatus = 'ready' | 'playing' | 'paused' | 'lost'

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

export interface Paddle {
  x: number
  y: number
  w: number
  h: number
}

export interface Brick {
  x: number
  y: number
  w: number
  h: number
  row: number
  col: number
  alive: boolean
}

export interface BreakoutStepResult {
  brickHit: boolean
  lifeLost: boolean
  levelCleared: boolean
}

const EMPTY_RESULT: BreakoutStepResult = {
  brickHit: false,
  lifeLost: false,
  levelCleared: false,
}

const COLUMNS = 8
const ROWS = 4
const GAP = 8
const MARGIN_X = 36
const BRICK_TOP = 76
const BRICK_HEIGHT = 20

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class BreakoutEngine {
  readonly width: number
  readonly height: number

  status: BreakoutStatus = 'ready'
  paddle: Paddle
  ball: Ball
  bricks: Brick[] = []
  lives = 3
  score = 0
  combo = 0
  level = 1

  private speed = 340

  constructor(width = 960, height = 460) {
    this.width = width
    this.height = height
    this.paddle = {
      x: width / 2 - 55,
      y: height - 30,
      w: 110,
      h: 10,
    }
    this.ball = { x: width / 2, y: 0, vx: 0, vy: 0, r: 7 }
    this.buildBricks()
    this.resetBall()
  }

  movePaddle(x: number) {
    this.paddle.x = clamp(x - this.paddle.w / 2, 0, this.width - this.paddle.w)
    if (this.status === 'ready') {
      this.ball.x = this.paddle.x + this.paddle.w / 2
      this.ball.y = this.paddle.y - this.ball.r - 2
    }
  }

  launch() {
    if (this.status !== 'ready') return
    const angle = (Math.random() * 0.5 + 0.25) * Math.PI
    const direction = Math.random() < 0.5 ? -1 : 1
    this.ball.vx = Math.cos(angle) * this.speed * direction
    this.ball.vy = -Math.sin(angle) * this.speed
    this.status = 'playing'
  }

  pause() {
    if (this.status === 'playing') this.status = 'paused'
  }

  resume() {
    if (this.status === 'paused') this.status = 'playing'
  }

  togglePause() {
    if (this.status === 'playing') this.pause()
    else if (this.status === 'paused') this.resume()
  }

  reset() {
    this.lives = 3
    this.score = 0
    this.combo = 0
    this.level = 1
    this.speed = 340
    this.buildBricks()
    this.resetBall()
    this.status = 'ready'
  }

  step(deltaMs: number): BreakoutStepResult {
    if (this.status !== 'playing') return { ...EMPTY_RESULT }
    const dt = Math.min(32, Math.max(0, deltaMs)) / 1000
    if (dt === 0) return { ...EMPTY_RESULT }

    const result: BreakoutStepResult = { ...EMPTY_RESULT }
    const ball = this.ball
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    if (ball.x - ball.r < 0) {
      ball.x = ball.r
      ball.vx = Math.abs(ball.vx)
    } else if (ball.x + ball.r > this.width) {
      ball.x = this.width - ball.r
      ball.vx = -Math.abs(ball.vx)
    }
    if (ball.y - ball.r < 0) {
      ball.y = ball.r
      ball.vy = Math.abs(ball.vy)
    }

    const paddle = this.paddle
    if (
      ball.vy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x >= paddle.x - ball.r &&
      ball.x <= paddle.x + paddle.w + ball.r
    ) {
      ball.y = paddle.y - ball.r
      ball.vy = -Math.abs(ball.vy)
      const offset = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)
      ball.vx = clamp(ball.vx + offset * 150, -this.speed * 0.9, this.speed * 0.9)
      this.combo = 0
    }

    for (const brick of this.bricks) {
      if (!brick.alive) continue
      const closestX = clamp(ball.x, brick.x, brick.x + brick.w)
      const closestY = clamp(ball.y, brick.y, brick.y + brick.h)
      const dx = ball.x - closestX
      const dy = ball.y - closestY
      if (dx * dx + dy * dy > ball.r * ball.r) continue

      brick.alive = false
      this.combo += 1
      this.score += 10 * (1 + Math.floor(this.combo / 3))
      result.brickHit = true
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = dx >= 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx)
      } else {
        ball.vy = dy >= 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy)
      }
      break
    }

    if (this.bricks.every((brick) => !brick.alive)) {
      result.levelCleared = true
      this.level += 1
      this.speed = 340 + this.level * 26
      this.buildBricks()
      this.resetBall()
      return result
    }

    if (ball.y - ball.r > this.height) {
      result.lifeLost = true
      this.lives -= 1
      this.combo = 0
      if (this.lives <= 0) {
        this.lives = 0
        this.status = 'lost'
      } else {
        this.resetBall()
      }
    }

    return result
  }

  private resetBall() {
    this.ball.x = this.paddle.x + this.paddle.w / 2
    this.ball.y = this.paddle.y - this.ball.r - 2
    this.ball.vx = 0
    this.ball.vy = 0
    this.status = 'ready'
  }

  private buildBricks() {
    const brickWidth = (this.width - MARGIN_X * 2 - GAP * (COLUMNS - 1)) / COLUMNS
    const bricks: Brick[] = []
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLUMNS; col += 1) {
        bricks.push({
          x: MARGIN_X + col * (brickWidth + GAP),
          y: BRICK_TOP + row * (BRICK_HEIGHT + GAP),
          w: brickWidth,
          h: BRICK_HEIGHT,
          row,
          col,
          alive: true,
        })
      }
    }
    this.bricks = bricks
  }
}
