import { decode } from 'hono/utils/jwt/jwt'
import { describe, expect, it, vi } from 'vitest'
import { JwtDomain } from './index'

const SECRET = 'test-secret-' + 'x'.repeat(32) // 32 byte以上推奨
const OTHER_SECRET = 'other-secret-' + 'y'.repeat(32)

describe('JwtDomain.signAccessToken', () => {
  it('iat / exp / sub / client_id / scope / type を含む有効な JWT を返す', async () => {
    const token = await JwtDomain.signAccessToken(
      { sub: 'user-1', clientId: 'client-1', scope: 'read write' },
      SECRET,
    )

    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)

    const { payload } = decode(token)
    expect(payload.sub).toBe('user-1')
    expect(payload.client_id).toBe('client-1')
    expect(payload.scope).toBe('read write')
    expect(payload.type).toBe('access')
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.exp).toBe('number')
  })

  it('5 分後に失効するトークンを発行する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T00:00:00Z'))

    const token = await JwtDomain.signAccessToken(
      { sub: 'user-1', clientId: 'client-1', scope: 'read' },
      SECRET,
    )
    const { payload } = decode(token)

    expect(payload.exp! - payload.iat!).toBe(5 * 60)

    vi.useRealTimers()
  })
})

describe('JwtDomain.signOAuthSession + verifyOAuthSession (roundtrip)', () => {
  it('正常な署名・検証で同じ sub が返る', async () => {
    const token = await JwtDomain.signOAuthSession({ sub: 'user-42' }, SECRET)
    const payload = await JwtDomain.verifyOAuthSession(token, SECRET)

    expect(payload.sub).toBe('user-42')
    expect(payload.type).toBe('oauth_session')
  })

  it('7 日後に失効するトークンを発行する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T00:00:00Z'))

    const token = await JwtDomain.signOAuthSession({ sub: 'user-1' }, SECRET)
    const { payload } = decode(token)

    expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60)

    vi.useRealTimers()
  })
})

describe('JwtDomain.verifyOAuthSession (異常系)', () => {
  it('署名鍵が違うトークンを拒否する', async () => {
    const token = await JwtDomain.signOAuthSession({ sub: 'user-1' }, SECRET)
    await expect(JwtDomain.verifyOAuthSession(token, OTHER_SECRET)).rejects.toThrow()
  })

  it('期限切れトークンを拒否する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))
    const token = await JwtDomain.signOAuthSession({ sub: 'user-1' }, SECRET)

    // 8 日後にジャンプ（exp は 7 日後なので失効済み）
    vi.setSystemTime(new Date('2026-04-09T00:00:00Z'))
    await expect(JwtDomain.verifyOAuthSession(token, SECRET)).rejects.toThrow()

    vi.useRealTimers()
  })

  it('アクセストークン（type=access）を拒否する — 誤流入の防止', async () => {
    const accessToken = await JwtDomain.signAccessToken(
      { sub: 'user-1', clientId: 'client-1', scope: 'read' },
      SECRET,
    )
    await expect(JwtDomain.verifyOAuthSession(accessToken, SECRET)).rejects.toThrow(
      /invalid oauth_session payload/,
    )
  })

  it('壊れた JWT を拒否する', async () => {
    await expect(JwtDomain.verifyOAuthSession('not-a-jwt', SECRET)).rejects.toThrow()
    await expect(JwtDomain.verifyOAuthSession('', SECRET)).rejects.toThrow()
  })
})
