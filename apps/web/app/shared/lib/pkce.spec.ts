import { describe, expect, it } from 'vitest'
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce'

// Base64URL 文字セット: [A-Z][a-z][0-9]-_  （= は付かない）
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/

describe('generateCodeVerifier', () => {
  it('43 文字の Base64URL 文字列を返す（32 バイト乱数の Base64URL は 43 文字）', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toHaveLength(43)
    expect(verifier).toMatch(BASE64URL_REGEX)
  })

  it('呼び出すたびに異なる値を返す', () => {
    const values = new Set(Array.from({ length: 100 }, () => generateCodeVerifier()))
    expect(values.size).toBe(100)
  })

  it('RFC 7636 が要求する長さ範囲（43〜128 文字）に収まる', () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })
})

describe('generateCodeChallenge', () => {
  it('43 文字の Base64URL 文字列を返す（SHA-256 32 バイトを Base64URL すると 43 文字）', async () => {
    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    expect(challenge).toHaveLength(43)
    expect(challenge).toMatch(BASE64URL_REGEX)
  })

  it('同じ入力に対して同じ値を返す（決定的なハッシュ関数）', async () => {
    const verifier = 'fixed-verifier-for-determinism-check'
    const c1 = await generateCodeChallenge(verifier)
    const c2 = await generateCodeChallenge(verifier)
    expect(c1).toBe(c2)
  })

  it('異なる入力には異なる出力を返す', async () => {
    const c1 = await generateCodeChallenge('verifier-a')
    const c2 = await generateCodeChallenge('verifier-b')
    expect(c1).not.toBe(c2)
  })

  it('RFC 7636 の Appendix B テストベクトルと一致する', async () => {
    // RFC 7636 Appendix B の例:
    //   verifier:  "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    //   challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await generateCodeChallenge(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('generateState', () => {
  it('22 文字の Base64URL 文字列を返す（16 バイト乱数の Base64URL は 22 文字）', () => {
    const state = generateState()
    expect(state).toHaveLength(22)
    expect(state).toMatch(BASE64URL_REGEX)
  })

  it('呼び出すたびに異なる値を返す（CSRF 対策の本質）', () => {
    const values = new Set(Array.from({ length: 100 }, () => generateState()))
    expect(values.size).toBe(100)
  })
})
