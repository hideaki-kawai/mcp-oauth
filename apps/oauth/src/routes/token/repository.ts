/**
 * TokenRepository
 *
 * /token の処理に必要な DB 操作:
 *   - authorization_codes: 検索 / 使用済みマーク
 *   - refresh_tokens:      検索 / 失効 / 新規発行
 */

import { authorizationCodes, refreshTokens } from '@mcp-oauth/database/oauth'
import type { Result } from '@mcp-oauth/types'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

export type AuthCodeRow = {
  code: string
  clientId: string
  userId: string
  scopes: string
  redirectUri: string
  codeChallenge: string
  expiresAt: Date
  usedAt: Date | null
}

export type RefreshTokenRow = {
  token: string
  type: 'mcp' | 'web' | 'session'
  clientId: string
  userId: string
  scopes: string
  expiresAt: Date
  revokedAt: Date | null
}

export type CreateRefreshTokenInput = {
  token: string
  type: 'mcp' | 'web'
  clientId: string
  userId: string
  scopes: string
  expiresAt: Date
}

export class TokenRepository {
  // ── authorization_codes ──────────────────────────

  static async findAuthCode(d1: D1Database, code: string): Promise<Result<AuthCodeRow | null>> {
    try {
      const db = drizzle(d1)
      const rows = await db
        .select()
        .from(authorizationCodes)
        .where(eq(authorizationCodes.code, code))
        .limit(1)
      if (rows.length === 0) return { success: true, data: null, error: null }
      const r = rows[0]
      return {
        success: true,
        data: {
          code: r.code,
          clientId: r.clientId,
          userId: r.userId,
          scopes: r.scopes,
          redirectUri: r.redirectUri,
          codeChallenge: r.codeChallenge,
          expiresAt: r.expiresAt,
          usedAt: r.usedAt,
        },
        error: null,
      }
    } catch (err) {
      return { success: false, data: null, error: errMsg(err) }
    }
  }

  static async markAuthCodeUsed(d1: D1Database, code: string): Promise<Result<void>> {
    try {
      const db = drizzle(d1)
      await db
        .update(authorizationCodes)
        .set({ usedAt: new Date() })
        .where(eq(authorizationCodes.code, code))
      return { success: true, data: undefined, error: null }
    } catch (err) {
      return { success: false, data: null, error: errMsg(err) }
    }
  }

  // ── refresh_tokens ───────────────────────────────

  static async findRefreshToken(
    d1: D1Database,
    token: string,
  ): Promise<Result<RefreshTokenRow | null>> {
    try {
      const db = drizzle(d1)
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.token, token))
        .limit(1)
      if (rows.length === 0) return { success: true, data: null, error: null }
      const r = rows[0]
      return {
        success: true,
        data: {
          token: r.token,
          type: r.type,
          clientId: r.clientId,
          userId: r.userId,
          scopes: r.scopes,
          expiresAt: r.expiresAt,
          revokedAt: r.revokedAt,
        },
        error: null,
      }
    } catch (err) {
      return { success: false, data: null, error: errMsg(err) }
    }
  }

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

  static async createRefreshToken(
    d1: D1Database,
    input: CreateRefreshTokenInput,
  ): Promise<Result<void>> {
    try {
      const db = drizzle(d1)
      await db.insert(refreshTokens).values({
        token: input.token,
        type: input.type,
        clientId: input.clientId,
        userId: input.userId,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      })
      return { success: true, data: undefined, error: null }
    } catch (err) {
      return { success: false, data: null, error: errMsg(err) }
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error'
}
