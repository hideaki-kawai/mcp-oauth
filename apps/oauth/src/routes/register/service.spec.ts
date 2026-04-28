import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterRepository } from './repository'
import { RegisterService } from './service'

/**
 * D1Database のスタブ。RegisterRepository を spy するので、ここでは
 * 「型として渡せる適当な値」さえあれば良い。
 */
const fakeD1 = {} as D1Database

beforeEach(() => {
  vi.spyOn(RegisterRepository, 'create').mockResolvedValue({
    success: true,
    data: undefined,
    error: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RegisterService.register', () => {
  it('UUID 形式の client_id を生成する', async () => {
    const result = await RegisterService.register(fakeD1, {
      redirect_uris: ['http://localhost:30000/auth/callback'],
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    // UUID v4 形式
    expect(result.data.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('未指定のフィールドにデフォルト値を入れる', async () => {
    const result = await RegisterService.register(fakeD1, {
      redirect_uris: ['http://localhost:30000/auth/callback'],
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.client_name).toBe('Unknown Client')
    expect(result.data.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(result.data.response_types).toEqual(['code'])
    expect(result.data.token_endpoint_auth_method).toBe('none')
    expect(result.data.scope).toBe('read write')
  })

  it('指定された値はデフォルトより優先される', async () => {
    const result = await RegisterService.register(fakeD1, {
      redirect_uris: ['https://claude.ai/callback'],
      client_name: 'Claude',
      grant_types: ['authorization_code'],
      scope: 'read',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.client_name).toBe('Claude')
    expect(result.data.grant_types).toEqual(['authorization_code'])
    expect(result.data.scope).toBe('read')
  })

  it('Repository に正しい値を渡す', async () => {
    const spy = vi.spyOn(RegisterRepository, 'create').mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await RegisterService.register(fakeD1, {
      redirect_uris: ['https://claude.ai/cb1', 'https://claude.ai/cb2'],
      client_name: 'Claude',
      scope: 'read',
    })

    expect(spy).toHaveBeenCalledOnce()
    const passed = spy.mock.calls[0][1]
    expect(passed.name).toBe('Claude')
    expect(passed.redirectUris).toEqual(['https://claude.ai/cb1', 'https://claude.ai/cb2'])
    expect(passed.scopes).toBe('read')
    expect(passed.tokenEndpointAuthMethod).toBe('none')
    expect(passed.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('Repository が失敗したら失敗を伝播する', async () => {
    vi.spyOn(RegisterRepository, 'create').mockResolvedValue({
      success: false,
      data: null,
      error: 'UNIQUE constraint failed',
    })

    const result = await RegisterService.register(fakeD1, {
      redirect_uris: ['http://localhost:30000/auth/callback'],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('UNIQUE constraint failed')
  })

  it('client_id_issued_at は現在時刻 (Unix 秒) になる', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'))

    const result = await RegisterService.register(fakeD1, {
      redirect_uris: ['http://localhost:30000/auth/callback'],
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.client_id_issued_at).toBe(Math.floor(new Date('2026-04-29T12:00:00Z').getTime() / 1000))

    vi.useRealTimers()
  })
})
