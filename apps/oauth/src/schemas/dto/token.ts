/**
 * POST /token のフォームスキーマとレスポンス型
 *
 * grant_type で 2 系統に分かれる:
 *   - authorization_code: 認可コードフロー（初回トークン取得）
 *   - refresh_token:      リフレッシュ（更新）
 */

import { z } from 'zod'

/** authorization_code フロー */
export const tokenAuthorizationCodeRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.string().min(1),
  client_id: z.string().min(1),
  code_verifier: z.string().min(1),
})

/** refresh_token フロー */
export const tokenRefreshRequestSchema = z.object({
  grant_type: z.literal('refresh_token'),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
})

/** /token は grant_type で分岐するので合計型は discriminated union にする */
export const tokenRequestSchema = z.discriminatedUnion('grant_type', [
  tokenAuthorizationCodeRequestSchema,
  tokenRefreshRequestSchema,
])

export type TokenRequest = z.infer<typeof tokenRequestSchema>

/** トークン発行レスポンス（OAuth 2.1 §5.1 準拠） */
export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  /** access_token の有効期限（秒）— 5 分 = 300 */
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string(),
})

export type TokenResponse = z.infer<typeof tokenResponseSchema>

/** /token のエラーレスポンス（RFC 6749 §5.2） */
export const tokenErrorSchema = z.object({
  /** invalid_request / invalid_client / invalid_grant / unauthorized_client / unsupported_grant_type / invalid_scope */
  error: z.string(),
  error_description: z.string().optional(),
})

export type TokenErrorResponse = z.infer<typeof tokenErrorSchema>
