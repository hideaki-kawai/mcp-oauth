/**
 * ConsentRepository
 *
 * - oauth_clients を ID で検索（form データの再検証用）
 * - authorization_codes に新規行を INSERT
 *
 * authorize/repository.ts と client 検索が重複するが、
 * AGENTS.md の方針（feature group ごとに独立した repository）に従い別ファイルとして持つ。
 */

import { authorizationCodes, oauthClients } from '@mcp-oauth/database/oauth'
import type { Result } from '@mcp-oauth/types'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

export type OAuthClient = {
  id: string
  redirectUris: string[]
  scopes: string
}

export type CreateAuthCodeInput = {
  /** ランダム 32 文字 hex（generateAuthCode で生成） */
  code: string
  clientId: string
  userId: string
  scopes: string
  redirectUri: string
  codeChallenge: string
  /** 失効日時 */
  expiresAt: Date
}

export class ConsentRepository {
  /**
   * client_id で oauth_clients を検索（form データ再検証用）
   * 見つからない場合 data: null
   */
  static async findClientById(
    d1: D1Database,
    clientId: string
  ): Promise<Result<OAuthClient | null>> {
    try {
      const db = drizzle(d1)
      const rows = await db
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.id, clientId))
        .limit(1)

      if (rows.length === 0) {
        return { success: true, data: null, error: null }
      }

      const row = rows[0]
      let redirectUris: string[] = []
      try {
        const parsed = JSON.parse(row.redirectUris)
        if (Array.isArray(parsed)) {
          redirectUris = parsed.filter((v): v is string => typeof v === 'string')
        }
      } catch {
        redirectUris = []
      }

      return {
        success: true,
        data: { id: row.id, redirectUris, scopes: row.scopes },
        error: null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to query oauth_clients'
      return { success: false, data: null, error: message }
    }
  }

  /**
   * 認可コードを authorization_codes テーブルに INSERT する
   */
  static async createAuthCode(d1: D1Database, input: CreateAuthCodeInput): Promise<Result<void>> {
    try {
      const db = drizzle(d1)
      await db.insert(authorizationCodes).values({
        code: input.code,
        clientId: input.clientId,
        userId: input.userId,
        scopes: input.scopes,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      })
      return { success: true, data: undefined, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to insert auth code'
      return { success: false, data: null, error: message }
    }
  }
}
