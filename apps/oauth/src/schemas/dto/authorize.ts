/**
 * /authorize 関連の DTO スキーマ
 *
 * GET /authorize のクエリパラメータ（OAuth 2.1 + PKCE）
 */

import { z } from 'zod'

/**
 * GET /authorize のクエリパラメータ
 *
 * - response_type: OAuth 2.1 では "code" のみ
 * - client_id: oauth_clients テーブルの id
 * - redirect_uri: 登録時の redirect_uris のいずれかと一致する必要あり
 * - scope: 任意のスペース区切り文字列。省略時はクライアントの登録スコープを使う
 * - state: CSRF 対策のためクライアントが付与（任意だが推奨）
 * - code_challenge: PKCE。SHA-256(verifier) を Base64URL したもの
 * - code_challenge_method: OAuth 2.1 では "S256" のみ
 */
export const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal('S256'),
})

export type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>
