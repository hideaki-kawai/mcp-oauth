import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TokenRepository } from './repository'
import { TokenService } from './service'

const fakeD1 = {} as D1Database
const SECRET = 'test-secret-' + 'x'.repeat(32)

afterEach(() => {
  vi.restoreAllMocks()
})

/** 既存のテストヘルパー: SHA-256(verifier) → base64url を計算 */
async function sha256Base64Url(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

describe('TokenService.exchangeAuthorizationCode', () => {
  const verifier = 'test-code-verifier-1234567890abcdefghijklmno'
  let challenge: string

  beforeEach(async () => {
    challenge = await sha256Base64Url(verifier)
  })

  it('成功: 正しい code + verifier で access_token + refresh_token が返る', async () => {
    vi.spyOn(TokenRepository, 'findAuthCode').mockResolvedValue({
      success: true,
      data: {
        code: 'authcode-1',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read write',
        redirectUri: 'http://localhost:30000/auth/callback',
        codeChallenge: challenge,
        expiresAt: new Date(Date.now() + 60_000), // 1 分後
        usedAt: null,
      },
      error: null,
    })
    vi.spyOn(TokenRepository, 'markAuthCodeUsed').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    const insertSpy = vi.spyOn(TokenRepository, 'createRefreshToken').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    const result = await TokenService.exchangeAuthorizationCode(
      fakeD1,
      {
        code: 'authcode-1',
        redirectUri: 'http://localhost:30000/auth/callback',
        clientId: 'web-client',
        codeVerifier: verifier,
      },
      SECRET
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.token_type).toBe('Bearer')
    expect(result.data.expires_in).toBe(300)
    expect(result.data.refresh_token).toMatch(/^[0-9a-f]{64}$/)
    expect(result.data.scope).toBe('read write')

    // access_token は JWT
    expect(result.data.access_token.split('.').length).toBe(3)

    // refresh_tokens の type は web-client なので 'web'
    expect(insertSpy).toHaveBeenCalledOnce()
    const passed = insertSpy.mock.calls[0][1]
    expect(passed.type).toBe('web')
    expect(passed.userId).toBe('u1')
  })

  it('Claude（DCR 由来 client_id）の場合は refresh_tokens.type = mcp', async () => {
    vi.spyOn(TokenRepository, 'findAuthCode').mockResolvedValue({
      success: true,
      data: {
        code: 'c',
        clientId: 'random-uuid-from-dcr',
        userId: 'u1',
        scopes: 'read',
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: challenge,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      },
      error: null,
    })
    vi.spyOn(TokenRepository, 'markAuthCodeUsed').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    const insertSpy = vi.spyOn(TokenRepository, 'createRefreshToken').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await TokenService.exchangeAuthorizationCode(
      fakeD1,
      {
        code: 'c',
        redirectUri: 'https://claude.ai/cb',
        clientId: 'random-uuid-from-dcr',
        codeVerifier: verifier,
      },
      SECRET
    )

    expect(insertSpy.mock.calls[0][1].type).toBe('mcp')
  })

  it('code が見つからない → invalid_grant', async () => {
    vi.spyOn(TokenRepository, 'findAuthCode').mockResolvedValue({
      success: true,
      data: null,
      error: null,
    })
    const result = await TokenService.exchangeAuthorizationCode(
      fakeD1,
      { code: 'x', redirectUri: 'r', clientId: 'c', codeVerifier: 'v' },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_grant')
  })

  it('使用済み code → invalid_grant', async () => {
    vi.spyOn(TokenRepository, 'findAuthCode').mockResolvedValue({
      success: true,
      data: {
        code: 'used',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read',
        redirectUri: 'r',
        codeChallenge: challenge,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(Date.now() - 1000),
      },
      error: null,
    })
    const result = await TokenService.exchangeAuthorizationCode(
      fakeD1,
      { code: 'used', redirectUri: 'r', clientId: 'web-client', codeVerifier: verifier },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_grant')
    expect(result.error).toBe('code already used')
  })

  it('期限切れ code → invalid_grant', async () => {
    vi.spyOn(TokenRepository, 'findAuthCode').mockResolvedValue({
      success: true,
      data: {
        code: 'expired',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read',
        redirectUri: 'r',
        codeChallenge: challenge,
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
      error: null,
    })
    const result = await TokenService.exchangeAuthorizationCode(
      fakeD1,
      { code: 'expired', redirectUri: 'r', clientId: 'web-client', codeVerifier: verifier },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('code expired')
  })

  it('PKCE 不一致 → invalid_grant', async () => {
    vi.spyOn(TokenRepository, 'findAuthCode').mockResolvedValue({
      success: true,
      data: {
        code: 'c',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read',
        redirectUri: 'r',
        codeChallenge: challenge,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      },
      error: null,
    })

    const result = await TokenService.exchangeAuthorizationCode(
      fakeD1,
      { code: 'c', redirectUri: 'r', clientId: 'web-client', codeVerifier: 'WRONG-VERIFIER' },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('PKCE verification failed')
  })
})

describe('TokenService.refresh (Rotation)', () => {
  it('成功: 旧トークンを失効させ、新しいトークンペアを返す', async () => {
    vi.spyOn(TokenRepository, 'findRefreshToken').mockResolvedValue({
      success: true,
      data: {
        token: 'old-token',
        type: 'web',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read write',
        expiresAt: new Date(Date.now() + 1000_000),
        revokedAt: null,
      },
      error: null,
    })
    const revokeSpy = vi.spyOn(TokenRepository, 'revokeRefreshToken').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    const insertSpy = vi.spyOn(TokenRepository, 'createRefreshToken').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    const result = await TokenService.refresh(
      fakeD1,
      { refreshToken: 'old-token', clientId: 'web-client' },
      SECRET
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(revokeSpy).toHaveBeenCalledWith(fakeD1, 'old-token') // 旧失効
    expect(insertSpy).toHaveBeenCalledOnce() // 新発行
    expect(result.data.refresh_token).not.toBe('old-token') // 別のトークン
  })

  it('失効済みトークンを拒否', async () => {
    vi.spyOn(TokenRepository, 'findRefreshToken').mockResolvedValue({
      success: true,
      data: {
        token: 'rev',
        type: 'web',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read',
        expiresAt: new Date(Date.now() + 1000_000),
        revokedAt: new Date(Date.now() - 1000),
      },
      error: null,
    })

    const result = await TokenService.refresh(
      fakeD1,
      { refreshToken: 'rev', clientId: 'web-client' },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('refresh_token revoked')
  })

  it('期限切れトークンを拒否', async () => {
    vi.spyOn(TokenRepository, 'findRefreshToken').mockResolvedValue({
      success: true,
      data: {
        token: 'old',
        type: 'web',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      },
      error: null,
    })

    const result = await TokenService.refresh(
      fakeD1,
      { refreshToken: 'old', clientId: 'web-client' },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('refresh_token expired')
  })

  it('client_id 不一致 → 拒否', async () => {
    vi.spyOn(TokenRepository, 'findRefreshToken').mockResolvedValue({
      success: true,
      data: {
        token: 'old',
        type: 'web',
        clientId: 'web-client',
        userId: 'u1',
        scopes: 'read',
        expiresAt: new Date(Date.now() + 1000_000),
        revokedAt: null,
      },
      error: null,
    })

    const result = await TokenService.refresh(
      fakeD1,
      { refreshToken: 'old', clientId: 'attacker-client' },
      SECRET
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('client_id does not match')
  })
})
