/**
 * AuthorizeRepository — oauth_clients テーブルの読み取り
 *
 * /authorize でクライアント検証に使う。書き込みは行わない。
 */

import { oauthClients } from '@mcp-oauth/database/oauth'
import type { Result } from '@mcp-oauth/types'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'

/**
 * アプリケーション層で扱う OAuth クライアント表現
 *
 * DB 上の redirect_uris は JSON 文字列だが、ここでは配列として扱う（パース済み）。
 */
export type OAuthClient = {
  id: string
  name: string
  redirectUris: string[]
  tokenEndpointAuthMethod: 'none'
  scopes: string
  createdAt: Date
}

export class AuthorizeRepository {
  /**
   * client_id で oauth_clients を 1 件検索する
   *
   * 戻り値:
   *   - 見つかった場合: { success: true, data: OAuthClient }
   *   - 見つからない場合: { success: true, data: null }
   *   - DB エラー: { success: false, error: '...' }
   *
   * 「見つからない」と「DB エラー」を区別するため data: null と error を使い分ける。
   */
  static async findClientById(
    d1: D1Database,
    clientId: string,
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
      const redirectUris = parseRedirectUris(row.redirectUris)

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          redirectUris,
          tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
          scopes: row.scopes,
          createdAt: row.createdAt,
        },
        error: null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to query oauth_clients'
      return { success: false, data: null, error: message }
    }
  }
}

/**
 * DB に JSON 文字列で保存されている redirect_uris を配列に戻す
 * パースに失敗したり配列でなかったりした場合は空配列扱い
 */
function parseRedirectUris(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}
