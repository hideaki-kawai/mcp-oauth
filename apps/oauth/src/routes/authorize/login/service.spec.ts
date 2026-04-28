import { hashPassword } from '@mcp-oauth/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginRepository, type UserRecord } from './repository'
import { LoginService } from './service'

const fakeD1 = {} as D1Database

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LoginService.authenticate', () => {
  it('正しいパスワードで認証成功', async () => {
    const passwordHash = await hashPassword('correct-password')
    const user: UserRecord = {
      id: 'u1',
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    }
    vi.spyOn(LoginRepository, 'findByEmail').mockResolvedValue({
      success: true,
      data: user,
      error: null,
    })

    const result = await LoginService.authenticate(fakeD1, {
      email: 'admin@example.com',
      password: 'correct-password',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.userId).toBe('u1')
    expect(result.data.role).toBe('admin')
  })

  it('間違ったパスワードで失敗', async () => {
    const passwordHash = await hashPassword('correct-password')
    vi.spyOn(LoginRepository, 'findByEmail').mockResolvedValue({
      success: true,
      data: { id: 'u1', email: 'a@b', passwordHash, role: 'user' },
      error: null,
    })

    const result = await LoginService.authenticate(fakeD1, {
      email: 'a@b',
      password: 'WRONG',
    })

    expect(result.success).toBe(false)
  })

  it('ユーザーが存在しない場合も失敗（エラーメッセージは同一: 列挙攻撃対策）', async () => {
    vi.spyOn(LoginRepository, 'findByEmail').mockResolvedValue({
      success: true,
      data: null,
      error: null,
    })

    const result = await LoginService.authenticate(fakeD1, {
      email: 'unknown@example.com',
      password: 'anything',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('メールアドレスまたはパスワードが違います')
  })

  it('Repository が失敗した場合は失敗を伝播', async () => {
    vi.spyOn(LoginRepository, 'findByEmail').mockResolvedValue({
      success: false,
      data: null,
      error: 'db down',
    })

    const result = await LoginService.authenticate(fakeD1, {
      email: 'a@b',
      password: 'x',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('db down')
  })
})
