/**
 * api-mcp サーバー
 *
 * MCP サーバー本体 + Web フロントエンドの BFF を兼ねる Hono アプリ。
 *
 * 主な責務:
 *   - MCP プロトコル（/mcp）— Claude からのツール呼び出し（authMiddleware で保護）
 *   - 共通 API（/api/fx, /api/crypto）— Web SPA & MCP の両方が使う
 *   - OpenAPI ドキュメント（/docs）
 *
 * Hono RPC:
 *   `routes` 変数の型を `AppType` として export し、Web 側で
 *   `hc<AppType>(BASE_URL)` として使う → 型安全な API クライアントになる。
 *   `app.route(...).route(...)` のチェーンが必須（途中で代入を挟むと型が落ちる）。
 */

import { swaggerUI } from '@hono/swagger-ui'
import { API_MCP_PATHS } from '@mcp-oauth/constants'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { openAPIRouteHandler } from 'hono-openapi'
import { authMiddleware } from './middlewares/auth-middleware'
import cryptoHistoryRoute from './routes/api/crypto/history/get'
import cryptoMarketRoute from './routes/api/crypto/market/get'
import cryptoPriceRoute from './routes/api/crypto/price/get'
import fxConvertRoute from './routes/api/fx/convert/get'
import fxHistoryRoute from './routes/api/fx/history/get'
import fxRateRoute from './routes/api/fx/rate/get'
import healthRoute from './routes/health/get'
import mcpRoute from './routes/mcp/post'
import wellKnownRoute from './routes/well-known/get'
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

// ─────────────────────────────────────────────────────────
// 認証必須エンドポイント（/mcp と /api/* の業務 API）
// ─────────────────────────────────────────────────────────
app.use(`${API_MCP_PATHS.MCP}/*`, authMiddleware)
app.use(API_MCP_PATHS.MCP, authMiddleware)
app.use('/api/fx/*', authMiddleware)
app.use('/api/crypto/*', authMiddleware)

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
        { name: 'discovery', description: 'OAuth Protected Resource Metadata' },
        { name: 'fx', description: '為替（FX）— Frankfurter / ECB' },
        { name: 'crypto', description: '暗号通貨 — CoinGecko' },
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

app.get('/', (c) => c.text('api-mcp'))

export const routes = app
  .route(API_MCP_PATHS.WELL_KNOWN, wellKnownRoute)
  .route('/api', healthRoute)
  // FX
  .route(API_MCP_PATHS.FX_RATE, fxRateRoute)
  .route(API_MCP_PATHS.FX_CONVERT, fxConvertRoute)
  .route(API_MCP_PATHS.FX_HISTORY, fxHistoryRoute)
  // Crypto
  .route(API_MCP_PATHS.CRYPTO_PRICE, cryptoPriceRoute)
  .route(API_MCP_PATHS.CRYPTO_MARKET, cryptoMarketRoute)
  .route(API_MCP_PATHS.CRYPTO_HISTORY, cryptoHistoryRoute)
  // MCP プロトコル
  .route(API_MCP_PATHS.MCP, mcpRoute)

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
