import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthorizeConsentForm } from '../../../schemas/dto'
import { ConsentRepository } from './repository'
import { ConsentService } from './service'

const fakeD1 = {} as D1Database

const baseForm: AuthorizeConsentForm = {
  action: 'approve',
  response_type: 'code',
  client_id: 'web-client',
  redirect_uri: 'http://localhost:30000/auth/callback',
  code_challenge: 'challenge-xyz',
  code_challenge_method: 'S256',
  scope: 'read write',
  state: 'st-1',
}

afterEach(() => {
  vi.restoreAllMocks()
})

const mockClient = (over?: Partial<{ redirectUris: string[] }>) =>
  vi.spyOn(ConsentRepository, 'findClientById').mockResolvedValue({
    success: true,
    data: {
      id: 'web-client',
      redirectUris: over?.redirectUris ?? ['http://localhost:30000/auth/callback'],
      scopes: 'read write',
    },
    error: null,
  })

describe('ConsentService.handle (approve)', () => {
  it('成功: 認可コードを発行して redirect_uri?code=...&state=... を返す', async () => {
    mockClient()
    const insertSpy = vi.spyOn(ConsentRepository, 'createAuthCode').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    const result = await ConsentService.handle(fakeD1, { form: baseForm, userId: 'u1' })

    expect(result.success).toBe(true)
    if (!result.success) return

    const url = new URL(result.data.redirectUrl)
    expect(url.origin + url.pathname).toBe('http://localhost:30000/auth/callback')
    expect(url.searchParams.get('code')).toMatch(/^[0-9a-f]{32}$/)
    expect(url.searchParams.get('state')).toBe('st-1')

    // INSERT 内容確認
    expect(insertSpy).toHaveBeenCalledOnce()
    const passed = insertSpy.mock.calls[0][1]
    expect(passed.clientId).toBe('web-client')
    expect(passed.userId).toBe('u1')
    expect(passed.scopes).toBe('read write')
    expect(passed.codeChallenge).toBe('challenge-xyz')
    // 有効期限は 10 分後（誤差 5 秒以内）
    const diffSec = (passed.expiresAt.getTime() - Date.now()) / 1000
    expect(diffSec).toBeGreaterThan(10 * 60 - 5)
    expect(diffSec).toBeLessThan(10 * 60 + 5)
  })

  it('client_id が DB に無い → invalid_client', async () => {
    vi.spyOn(ConsentRepository, 'findClientById').mockResolvedValue({
      success: true,
      data: null,
      error: null,
    })

    const result = await ConsentService.handle(fakeD1, { form: baseForm, userId: 'u1' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_client')
  })

  it('redirect_uri が DB の登録 URL と一致しない → invalid_redirect_uri', async () => {
    mockClient({ redirectUris: ['http://other.example/cb'] })

    const result = await ConsentService.handle(fakeD1, { form: baseForm, userId: 'u1' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_redirect_uri')
  })
})

describe('ConsentService.handle (deny)', () => {
  it('redirect_uri?error=access_denied&state=... を返す', async () => {
    mockClient()

    const result = await ConsentService.handle(fakeD1, {
      form: { ...baseForm, action: 'deny' },
      userId: 'u1',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    const url = new URL(result.data.redirectUrl)
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(url.searchParams.get('state')).toBe('st-1')
    expect(url.searchParams.get('code')).toBeNull()
  })

  it('deny でも client/redirect_uri 不正なら拒否', async () => {
    mockClient({ redirectUris: ['http://other.example/cb'] })

    const result = await ConsentService.handle(fakeD1, {
      form: { ...baseForm, action: 'deny' },
      userId: 'u1',
    })
    expect(result.success).toBe(false)
  })
})
