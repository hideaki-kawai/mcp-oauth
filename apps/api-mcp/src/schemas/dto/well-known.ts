/**
 * GET /.well-known/oauth-protected-resource のレスポンス
 *
 * RFC 9728 / MCP Authorization spec に従ったメタデータ。
 * Claude が「この MCP サーバーはどの OAuth サーバーで認証すればいいか」を
 * 知るために最初に叩くエンドポイント。
 */

import { z } from 'zod'

export const oauthProtectedResourceMetadataSchema = z.object({
  /** このリソースサーバー自身の URL */
  resource: z.string(),
  /** このリソースを保護する OAuth サーバーの URL（複数可） */
  authorization_servers: z.array(z.string()),
  /** Bearer トークンの送信方法 */
  bearer_methods_supported: z.array(z.literal('header')),
  /** サポートする scope */
  scopes_supported: z.array(z.string()),
})

export type OAuthProtectedResourceMetadata = z.infer<typeof oauthProtectedResourceMetadataSchema>
