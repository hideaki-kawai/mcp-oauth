/**
 * GET /.well-known/oauth-protected-resource
 *
 * RFC 9728 / MCP Authorization spec に従い、このリソースサーバーを保護する
 * OAuth サーバー情報を返す。Claude はこのメタデータを起点に DCR → /authorize → /token へ進む。
 *
 * 認証不要・静的レスポンス・DB アクセスなし。
 */

import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { oauthProtectedResourceMetadataSchema } from '../../schemas/dto'
import type { AppEnv } from '../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['discovery'],
    summary: 'OAuth Protected Resource Metadata',
    description: 'MCP クライアントがリソースサーバーの認証要件を知るためのメタデータ',
    responses: {
      200: {
        description: 'メタデータ',
        content: {
          'application/json': { schema: resolver(oauthProtectedResourceMetadataSchema) },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      resource: c.env.API_MCP_BASE_URL,
      authorization_servers: [c.env.OAUTH_ISSUER],
      bearer_methods_supported: ['header'] as const,
      scopes_supported: ['read', 'write'],
    })
  }
)

export default route
