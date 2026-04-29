/**
 * GET /.well-known/oauth-authorization-server
 *
 * OAuth 2.0 Authorization Server Metadata（RFC 8414）を返すエンドポイント。
 *
 * このメタデータは何のためにあるか:
 *   OAuth クライアント（Claude / Web SPA）は接続する OAuth サーバーの URL から、
 *   「authorize はどこ？」「token はどこ？」「PKCE どの方式が使える？」といった情報を
 *   このエンドポイントを叩くだけで自動取得できる。
 *
 *   これにより、クライアント側に各エンドポイントを事前にハードコードする必要が無くなる。
 *   特に MCP の世界では、Claude が知らない MCP サーバーに接続する際に
 *   この Discovery が起点になる（→ 続いて DCR の /register、/authorize と進む）。
 *
 * ポイント:
 *   - 認証不要（公開エンドポイント）
 *   - 静的なメタデータ（DB アクセスなし）
 *   - 値は wrangler.jsonc の vars.OAUTH_ISSUER をベースに組み立てる
 *
 * 参考:
 *   - RFC 8414: OAuth 2.0 Authorization Server Metadata
 *     https://datatracker.ietf.org/doc/html/rfc8414
 *   - MCP Authorization spec
 *     https://modelcontextprotocol.io/specification/draft/basic/authorization
 */

import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { authorizationServerMetadataSchema } from '../../schemas/dto'
import type { AppEnv } from '../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['discovery'],
    summary: 'OAuth Authorization Server Metadata',
    description: 'RFC 8414 に従ったサーバー情報を返す。Claude / Web の Discovery 起点。',
    responses: {
      200: {
        description: 'メタデータ',
        content: {
          'application/json': {
            schema: resolver(authorizationServerMetadataSchema),
          },
        },
      },
    },
  }),
  (c) => {
    const issuer = c.env.OAUTH_ISSUER

    return c.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ['code'] as const,
      grant_types_supported: ['authorization_code', 'refresh_token'] as const,
      code_challenge_methods_supported: ['S256'] as const,
      token_endpoint_auth_methods_supported: ['none'] as const,
      scopes_supported: ['read', 'write'],
    })
  }
)

export default route
