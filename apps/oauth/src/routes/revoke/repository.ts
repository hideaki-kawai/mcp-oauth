import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { refreshTokens } from '@mcp-oauth/database/oauth'
import type { Result } from '@mcp-oauth/types'

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class RevokeRepository {
  static async revokeRefreshToken(d1: D1Database, token: string): Promise<Result<void>> {
    try {
      const db = drizzle(d1)
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.token, token))
      return { success: true, data: undefined, error: null }
    } catch (err) {
      return { success: false, data: null, error: errMsg(err) }
    }
  }
}
