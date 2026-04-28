/**
 * LoginService — メール/パスワード認証
 *
 * 1. メールでユーザー取得（無ければ "認証失敗"）
 * 2. PBKDF2 ハッシュで照合
 * 3. 成功なら user.id を返す
 *
 * セキュリティ:
 *   - 「ユーザーが存在しない」と「パスワードが間違っている」のエラーメッセージは同じ。
 *     攻撃者にメール存在の有無を漏らさないため。
 */

import type { Result } from '@mcp-oauth/types'
import { verifyPassword } from '@mcp-oauth/utils'
import { LoginRepository } from './repository'

export type LoginInput = {
  email: string
  password: string
}

export type LoginOk = {
  userId: string
  role: 'user' | 'admin'
}

export class LoginService {
  static async authenticate(d1: D1Database, input: LoginInput): Promise<Result<LoginOk>> {
    const userResult = await LoginRepository.findByEmail(d1, input.email)
    if (!userResult.success) {
      return { success: false, data: null, error: userResult.error }
    }

    if (userResult.data === null) {
      return { success: false, data: null, error: 'メールアドレスまたはパスワードが違います' }
    }

    const ok = await verifyPassword(input.password, userResult.data.passwordHash)
    if (!ok) {
      return { success: false, data: null, error: 'メールアドレスまたはパスワードが違います' }
    }

    return {
      success: true,
      data: { userId: userResult.data.id, role: userResult.data.role },
      error: null,
    }
  }
}
