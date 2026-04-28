/**
 * 共通エラーレスポンススキーマ
 *
 * OAuth 2.1 / RFC 7591 のエラー形式に準拠する。
 *   { "error": "<code>", "error_description": "<readable message>" }
 */

import { z } from 'zod'

export const oauthErrorSchema = z.object({
  /**
   * RFC 7591 §3.2.2 のエラーコード:
   *   - invalid_redirect_uri
   *   - invalid_client_metadata
   *   - invalid_software_statement
   *   - unapproved_software_statement
   *
   * /token などその他エンドポイントでは別のコードも使う（仕様参照）。
   */
  error: z.string(),
  /** 人間向けの補足メッセージ（任意） */
  error_description: z.string().optional(),
})

export type OAuthErrorResponse = z.infer<typeof oauthErrorSchema>
