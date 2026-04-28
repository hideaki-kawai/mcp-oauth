import { describe, expect, it } from 'vitest'
import { generateAuthCode, generateRefreshToken } from './token'

describe('generateAuthCode', () => {
  it('32 文字の 16 進文字列を返す', () => {
    const code = generateAuthCode()
    expect(code).toHaveLength(32)
    expect(code).toMatch(/^[0-9a-f]{32}$/)
  })

  it('呼び出すたびに異なる値を返す', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateAuthCode()))
    // 100 回呼んで衝突ゼロ。実際には 128 bit なので天文学的確率まで衝突しない
    expect(codes.size).toBe(100)
  })
})

describe('generateRefreshToken', () => {
  it('64 文字の 16 進文字列を返す', () => {
    const token = generateRefreshToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('呼び出すたびに異なる値を返す', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken()))
    expect(tokens.size).toBe(100)
  })

  it('認可コードよりエントロピーが大きい（リフレッシュトークンの方が長期間有効なため）', () => {
    expect(generateRefreshToken().length).toBeGreaterThan(generateAuthCode().length)
  })
})
