/**
 * LoginRepository — users テーブルからメールでユーザー検索
 */

import { users } from '@mcp-oauth/database/oauth'
import type { Result } from '@mcp-oauth/types'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

export type UserRecord = {
  id: string
  email: string
  passwordHash: string
  role: 'user' | 'admin'
}

export class LoginRepository {
  /**
   * メールアドレスでユーザーを 1 件取得する
   * - 見つからない: data: null
   * - DB エラー: success: false
   */
  static async findByEmail(d1: D1Database, email: string): Promise<Result<UserRecord | null>> {
    try {
      const db = drizzle(d1)
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
      if (rows.length === 0) {
        return { success: true, data: null, error: null }
      }
      const u = rows[0]
      return {
        success: true,
        data: {
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          role: u.role,
        },
        error: null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to query users'
      return { success: false, data: null, error: message }
    }
  }
}
