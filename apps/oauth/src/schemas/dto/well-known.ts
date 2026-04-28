/**
 * GET /.well-known/oauth-authorization-server のレスポンス（RFC 8414）
 */

import { z } from 'zod'

export const authorizationServerMetadataSchema = z.object({
  /** issuer: このサーバー自身の URL */
  issuer: z.string(),
  /** authorize エンドポイント URL */
  authorization_endpoint: z.string(),
  /** token エンドポイント URL */
  token_endpoint: z.string(),
  /** DCR エンドポイント URL */
  registration_endpoint: z.string(),
  /** OAuth 2.1 では "code" のみ */
  response_types_supported: z.array(z.literal('code')),
  /** サポートする grant_type */
  grant_types_supported: z.array(z.enum(['authorization_code', 'refresh_token'])),
  /** PKCE method（OAuth 2.1 で plain は非推奨） */
  code_challenge_methods_supported: z.array(z.literal('S256')),
  /** クライアント認証方式（全て public client） */
  token_endpoint_auth_methods_supported: z.array(z.literal('none')),
  /** サポートする scope */
  scopes_supported: z.array(z.string()),
})

export type AuthorizationServerMetadata = z.infer<typeof authorizationServerMetadataSchema>
