import { describe, expect, it } from 'vitest'

import {
  canMove,
  colorOfPlayer,
  legalTargets,
  pieceAt,
  pieceGlyph,
} from '../lib/blindXiangqi'
import type { BlindPieceColor, BlindPieceType, BlindPieceView } from '../types'

function revealed(
  x: number,
  y: number,
  color: BlindPieceColor,
  pieceType: BlindPieceType,
): BlindPieceView {
  return { x, y, revealed: true, color, pieceType }
}

function hidden(x: number, y: number): BlindPieceView {
  return { x, y, revealed: false, color: null, pieceType: null }
}

describe('盲棋前端规则提示', () => {
  it('反面棋阻挡车路，同时可作为盲吃目标', () => {
    const pieces = [revealed(0, 9, 'RED', 'CHARIOT'), hidden(0, 5)]

    expect(canMove(pieces, 'RED', 0, 9, 0, 0)).toBe(false)
    expect(canMove(pieces, 'RED', 0, 9, 0, 6)).toBe(true)
    expect(canMove(pieces, 'RED', 0, 9, 0, 5)).toBe(true)
    expect(legalTargets(pieces, 'RED', 0, 9)).toContainEqual({ x: 0, y: 5 })
  })

  it('未翻开的棋不能移动，敌方已翻开的棋不能被己方移动', () => {
    expect(canMove([hidden(0, 9)], 'RED', 0, 9, 0, 8)).toBe(false)
    expect(
      canMove([revealed(0, 9, 'BLACK', 'CHARIOT')], 'RED', 0, 9, 0, 8),
    ).toBe(false)
  })

  it('炮移动不需要炮架，吃子需要恰好一个炮架', () => {
    const pieces = [
      revealed(0, 9, 'RED', 'CANNON'),
      hidden(0, 7),
      hidden(0, 5),
    ]

    expect(canMove(pieces, 'RED', 0, 9, 0, 8)).toBe(true)
    expect(canMove(pieces, 'RED', 0, 9, 0, 5)).toBe(true)
    expect(canMove(pieces, 'RED', 0, 9, 0, 4)).toBe(false)
  })

  it('马腿、象眼与兵卒方向，将/士/象不设九宫过河限制', () => {
    expect(
      canMove(
        [revealed(4, 9, 'RED', 'HORSE'), hidden(4, 8)],
        'RED',
        4,
        9,
        5,
        7,
      ),
    ).toBe(false)
    expect(canMove([revealed(4, 9, 'RED', 'HORSE')], 'RED', 4, 9, 5, 7)).toBe(
      true,
    )
    expect(
      canMove(
        [revealed(2, 9, 'RED', 'ELEPHANT'), hidden(3, 8)],
        'RED',
        2,
        9,
        4,
        7,
      ),
    ).toBe(false)
    expect(
      canMove([revealed(2, 5, 'RED', 'ELEPHANT')], 'RED', 2, 5, 4, 3),
    ).toBe(true)
    expect(canMove([revealed(4, 8, 'RED', 'GENERAL')], 'RED', 4, 8, 4, 7)).toBe(
      true,
    )
    expect(canMove([revealed(4, 7, 'RED', 'GENERAL')], 'RED', 4, 7, 4, 6)).toBe(
      true,
    )
    expect(canMove([revealed(4, 8, 'RED', 'GENERAL')], 'RED', 4, 8, 4, 6)).toBe(
      false,
    )
    expect(canMove([revealed(4, 7, 'RED', 'ADVISOR')], 'RED', 4, 7, 3, 6)).toBe(
      true,
    )
    expect(
      canMove([revealed(4, 6, 'RED', 'SOLDIER')], 'RED', 4, 6, 5, 6),
    ).toBe(false)
    expect(
      canMove([revealed(4, 4, 'RED', 'SOLDIER')], 'RED', 4, 4, 5, 4),
    ).toBe(true)
    expect(
      canMove([revealed(4, 4, 'RED', 'SOLDIER')], 'RED', 4, 4, 4, 5),
    ).toBe(false)
  })

  it('棋子字符、坐标查找与红黑归属', () => {
    expect(pieceGlyph('RED', 'GENERAL')).toBe('帅')
    expect(pieceGlyph('BLACK', 'GENERAL')).toBe('将')
    expect(pieceGlyph('RED', 'SOLDIER')).toBe('兵')
    expect(pieceGlyph('BLACK', 'SOLDIER')).toBe('卒')
    expect(pieceAt([revealed(0, 9, 'RED', 'CHARIOT')], 0, 9)?.pieceType).toBe(
      'CHARIOT',
    )
    expect(pieceAt([], 0, 9)).toBeUndefined()
    expect(colorOfPlayer('u1', 'u1', 'u2')).toBe('RED')
    expect(colorOfPlayer('u2', 'u1', 'u2')).toBe('BLACK')
    expect(colorOfPlayer('u3', 'u1', 'u2')).toBeNull()
  })
})
