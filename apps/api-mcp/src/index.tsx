/**
 * api-mcp サーバー
 *
 * MCP サーバー本体 + Web フロントエンドの BFF を兼ねる Hono アプリ。
 *
 * 主な責務:
 *   - MCP プロトコル（/mcp）— Claude からのツール呼び出し
 *   - BFF API（/api/*）— Web SPA からのリクエスト
 *   - OpenAPI ドキュメント（/docs）
 *
 * Hono RPC:
 *   `routes` 変数の型を `AppType` として export し、Web 側で
 *   `hc<AppType>(BASE_URL)` として使う → 型安全な API クライアントになる。
 *   `app.route(...).route(...)` のチェーンが必須（途中で代入を挟むと型が落ちる）。
 */

import { swaggerUI } from '@hono/swagger-ui'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { openAPIRouteHandler } from 'hono-openapi'
import { renderer } from './renderer'
import healthRoute from './routes/health/get'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

// ─────────────────────────────────────────────────────────
// グローバルミドルウェア
// ─────────────────────────────────────────────────────────

// Web SPA からの credentials 付きリクエストを許可
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
        title: 'mcp-oauth api-mcp',
        version: '0.0.1',
        description: 'MCP サーバー兼 BFF（Web フロントエンド向け API）',
      },
      servers: [{ url: 'http://localhost:30001', description: 'Local' }],
      tags: [
        { name: 'health', description: 'ヘルスチェック' },
        // 今後追加: { name: 'auth', description: 'BFF: トークン交換' } など
      ],
      components: {
        securitySchemes: {
          Bearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'OAuth サーバーが発行した JWT アクセストークン',
          },
        },
      },
    },
  }),
)

// Swagger UI（GET /docs で開ける）
app.get('/docs', swaggerUI({ url: '/docs/openapi.json' }))

// ─────────────────────────────────────────────────────────
// ルート登録（Hono RPC のため .route(...).route(...) チェーンで書く）
// ─────────────────────────────────────────────────────────

app.get('/', (c) => c.render(<h1>api-mcp</h1>))

export const routes = app.route('/api', healthRoute)

export default app

/**
 * Hono RPC 用の型エクスポート
 *
 * Web 側で `import type { AppType } from '@mcp-oauth/api-mcp'` として使う。
 * 型のみの import なので、Web の bundle にサーバーコードは含まれない。
 */
export type AppType = typeof routes

/**
 * DTO スキーマも別パスで再エクスポート
 * → `@mcp-oauth/api-mcp/dto` から型・スキーマを参照できる
 */
export * from './schemas/dto'
