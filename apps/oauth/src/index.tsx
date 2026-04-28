/**
 * apps/oauth — OAuth 2.1 Authorization Server
 *
 * api-mcp と同じ構成（CORS / OpenAPI / Swagger UI / routes チェーン）に揃えている。
 *
 * ルート登録のチェーン（`app.route(...).route(...)`）は AppType の型推論のために必須。
 * ここを途切れさせると Hono RPC の型がうまく出ない（oauth は web から RPC で呼ばれない
 * 想定だが、構成統一とテスト容易性のため同じ書き方にする）。
 */

import { swaggerUI } from '@hono/swagger-ui'
import { OAUTH_PATHS } from '@mcp-oauth/constants'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { openAPIRouteHandler } from 'hono-openapi'
import { renderer } from './renderer'
import authorizeRoute from './routes/authorize/get'
import authorizeConsentRoute from './routes/authorize/consent/post'
import authorizeLoginRoute from './routes/authorize/login/post'
import registerRoute from './routes/register/post'
import tokenRoute from './routes/token/post'
import wellKnownRoute from './routes/well-known/get'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

// ─────────────────────────────────────────────────────────
// グローバルミドルウェア
// ─────────────────────────────────────────────────────────

// Web SPA や別 Worker からの credentials 付きリクエストを許可
app.use(
  '*',
  cors({
    origin: (origin) => origin ?? 'http://localhost:30000',
    credentials: true,
  }),
)

app.use(renderer)

// ─────────────────────────────────────────────────────────
// OpenAPI ドキュメント（開発時の動作確認用）
// ─────────────────────────────────────────────────────────

app.get(
  '/docs/openapi.json',
  openAPIRouteHandler(app, {
    documentation: {
      openapi: '3.0.0',
      info: {
        title: 'mcp-oauth oauth',
        version: '0.0.1',
        description: 'OAuth 2.1 Authorization Server',
      },
      servers: [{ url: 'http://localhost:30002', description: 'Local' }],
      tags: [
        { name: 'discovery', description: 'OAuth Discovery（メタデータ）' },
        { name: 'dcr', description: 'Dynamic Client Registration' },
        { name: 'authorize', description: 'ログイン・同意画面' },
        { name: 'token', description: 'トークン発行・更新' },
      ],
    },
  }),
)

// Swagger UI（GET /docs で開ける）
app.get('/docs', swaggerUI({ url: '/docs/openapi.json' }))

// ─────────────────────────────────────────────────────────
// ルート登録
// ─────────────────────────────────────────────────────────

app.get('/', (c) => c.render(<h1>OAuth Server</h1>))

export const routes = app
  .route(OAUTH_PATHS.WELL_KNOWN, wellKnownRoute)
  .route(OAUTH_PATHS.REGISTER, registerRoute)
  .route(OAUTH_PATHS.AUTHORIZE, authorizeRoute)
  .route(OAUTH_PATHS.AUTHORIZE_LOGIN, authorizeLoginRoute)
  .route(OAUTH_PATHS.AUTHORIZE_CONSENT, authorizeConsentRoute)
  .route(OAUTH_PATHS.TOKEN, tokenRoute)

export default app

/**
 * Hono RPC 用の型エクスポート（api-mcp と構成統一のため）
 * web は OAuth サーバーを RPC では叩かない想定だが、テスト等で型を使える。
 */
export type AppType = typeof routes

/**
 * DTO スキーマも別パスで再エクスポート
 */
export * from './schemas/dto'
