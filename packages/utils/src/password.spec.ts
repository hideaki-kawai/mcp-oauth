import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('hashPassword', () => {
  it('pbkdf2 形式のフォーマットで返す', async () => {
    const hash = await hashPassword('password')

    // 形式: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
    const parts = hash.split('$')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('pbkdf2')
    expect(Number(parts[1])).toBeGreaterThan(0) // iterations は正の数
    expect(parts[2]).toMatch(/^[A-Za-z0-9+/]+={0,2}$/) // salt は Base64
    expect(parts[3]).toMatch(/^[A-Za-z0-9+/]+={0,2}$/) // hash は Base64
  })

  it('同じパスワードでも salt がランダムなため毎回異なるハッシュになる', async () => {
    const hash1 = await hashPassword('password')
    const hash2 = await hashPassword('password')
    expect(hash1).not.toBe(hash2)
  })

  it('日本語・記号・長文も扱える', async () => {
    const hash1 = await hashPassword('日本語パスワード🔒')
    const hash2 = await hashPassword('!@#$%^&*()_+{}[]|:";<>?,./')
    const hash3 = await hashPassword('a'.repeat(1000))
    expect(hash1.startsWith('pbkdf2$')).toBe(true)
    expect(hash2.startsWith('pbkdf2$')).toBe(true)
    expect(hash3.startsWith('pbkdf2$')).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('正しいパスワードで true を返す', async () => {
    const hash = await hashPassword('correct-password')
    const ok = await verifyPassword('correct-password', hash)
    expect(ok).toBe(true)
  })

  it('間違ったパスワードで false を返す', async () => {
    const hash = await hashPassword('correct-password')
    const ok = await verifyPassword('wrong-password', hash)
    expect(ok).toBe(false)
  })

  it('空文字を間違ったパスワードとして拒否する', async () => {
    const hash = await hashPassword('correct-password')
    const ok = await verifyPassword('', hash)
    expect(ok).toBe(false)
  })

  it('形式不正なハッシュを拒否する', async () => {
    expect(await verifyPassword('password', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('password', 'pbkdf2$only-one-part')).toBe(false)
    expect(await verifyPassword('password', 'pbkdf2$abc$salt$hash')).toBe(false) // iterations が NaN
    expect(await verifyPassword('password', '')).toBe(false)
  })

  it('別スキームのハッシュ（bcrypt 等）を拒否する', async () => {
    const bcryptLike = '$2b$10$saltsaltsaltsaltsaltsaltsaltsaltsaltsaltsalt'
    expect(await verifyPassword('password', bcryptLike)).toBe(false)
  })

  it('日本語・記号・長文のラウンドトリップが成功する', async () => {
    const passwords = ['日本語パスワード🔒', '!@#$%^&*()_+{}[]|:";<>?,./', 'a'.repeat(1000)]
    for (const pw of passwords) {
      const hash = await hashPassword(pw)
      expect(await verifyPassword(pw, hash)).toBe(true)
      expect(await verifyPassword(`${pw}x`, hash)).toBe(false)
    }
  })
})
