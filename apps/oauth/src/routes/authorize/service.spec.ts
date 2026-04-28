import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthorizeQuery } from '../../schemas/dto'
import { AuthorizeRepository, type OAuthClient } from './repository'
import { AuthorizeService } from './service'

const fakeD1 = {} as D1Database

const validClient: OAuthClient = {
  id: 'web-client',
  name: 'web',
  redirectUris: ['http://localhost:30000/auth/callback'],
  tokenEndpointAuthMethod: 'none',
  scopes: 'read write',
  createdAt: new Date('2026-04-01T00:00:00Z'),
}

const validQuery: AuthorizeQuery = {
  response_type: 'code',
  client_id: 'web-client',
  redirect_uri: 'http://localhost:30000/auth/callback',
  scope: 'read write',
  state: 'state-xyz',
  code_challenge: 'challenge-xyz',
  code_challenge_method: 'S256',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AuthorizeService.validate', () => {
  it('正常系: client が存在し redirect_uri が一致する → success', async () => {
    vi.spyOn(AuthorizeRepository, 'findClientById').mockResolvedValue({
      success: true,
      data: validClient,
      error: null,
    })

    const result = await AuthorizeService.validate(fakeD1, validQuery)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.client.id).toBe('web-client')
    expect(result.data.query).toEqual(validQuery)
  })

  it('client_id が DB に無い → invalid_client', async () => {
    vi.spyOn(AuthorizeRepository, 'findClientById').mockResolvedValue({
      success: true,
      data: null,
      error: null,
    })

    const result = await AuthorizeService.validate(fakeD1, validQuery)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_client')
  })

  it('redirect_uri が登録された URL と一致しない → invalid_redirect_uri', async () => {
    vi.spyOn(AuthorizeRepository, 'findClientById').mockResolvedValue({
      success: true,
      data: validClient,
      error: null,
    })

    const result = await AuthorizeService.validate(fakeD1, {
      ...validQuery,
      redirect_uri: 'http://attacker.example/callback',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_redirect_uri')
  })

  it('redirect_uri が完全一致する場合のみ受理する（部分一致は不可）', async () => {
    vi.spyOn(AuthorizeRepository, 'findClientById').mockResolvedValue({
      success: true,
      data: validClient,
      error: null,
    })

    // 末尾にスラッシュ追加 → 完全一致しない
    const result = await AuthorizeService.validate(fakeD1, {
      ...validQuery,
      redirect_uri: 'http://localhost:30000/auth/callback/',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('invalid_redirect_uri')
  })

  it('複数登録されている redirect_uris のいずれかと一致すれば OK', async () => {
    vi.spyOn(AuthorizeRepository, 'findClientById').mockResolvedValue({
      success: true,
      data: {
        ...validClient,
        redirectUris: [
          'http://localhost:30000/auth/callback',
          'https://prod.example/auth/callback',
        ],
      },
      error: null,
    })

    const result = await AuthorizeService.validate(fakeD1, {
      ...validQuery,
      redirect_uri: 'https://prod.example/auth/callback',
    })

    expect(result.success).toBe(true)
  })

  it('Repository が失敗 → server_error', async () => {
    vi.spyOn(AuthorizeRepository, 'findClientById').mockResolvedValue({
      success: false,
      data: null,
      error: 'db connection lost',
    })

    const result = await AuthorizeService.validate(fakeD1, validQuery)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorCode).toBe('server_error')
    expect(result.error).toBe('db connection lost')
  })
})
