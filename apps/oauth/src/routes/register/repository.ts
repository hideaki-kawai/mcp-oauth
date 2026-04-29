/**
 * RegisterRepository
 *
 * oauth_clients テーブルへの書き込み専用リポジトリ。
 * service 層から呼ばれ、Result<T> でエラー伝播する。
 */

import { oauthClients } from '@mcp-oauth/database/oauth'
import type { Result } from '@mcp-oauth/types'
import { drizzle } from 'drizzle-orm/d1'

export type CreateOAuthClientInput = {
  /** crypto.randomUUID() で生成した client_id */
  id: string
  /** クライアント名（DCR の client_name または "Unknown Client"） */
  name: string
  /** 登録時に申告された redirect_uris（URL の配列） */
  redirectUris: string[]
  /** OAuth 2.1 では "none" のみサポート（public client） */
  tokenEndpointAuthMethod: 'none'
  /** スペース区切りのスコープ */
  scopes: string
  /** 作成日時 */
  createdAt: Date
}

export class RegisterRepository {
  /**
   * oauth_clients に新規クライアントを INSERT する
   */
  static async create(d1: D1Database, input: CreateOAuthClientInput): Promise<Result<void>> {
    try {
      const db = drizzle(d1)
      await db.insert(oauthClients).values({
        id: input.id,
        name: input.name,
        // redirect_uris は JSON 文字列として保存（スキーマ参照）
        redirectUris: JSON.stringify(input.redirectUris),
        tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
        scopes: input.scopes,
        firstParty: false, // DCR 登録クライアントは常に false
        createdAt: input.createdAt,
      })
      return { success: true, data: undefined, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to insert oauth_client'
      return { success: false, data: null, error: message }
    }
  }
}
