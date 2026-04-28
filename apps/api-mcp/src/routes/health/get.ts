/**
 * GET /api/health — ヘルスチェック
 *
 * Hono RPC + OpenAPI のパターンを示すサンプルエンドポイント。
 * 認証不要・DB アクセスなし・常に 200 を返す。
 *
 * - describeRoute(...): OpenAPI ドキュメントに載せる情報を宣言
 * - resolver(schema): zod スキーマから OpenAPI のレスポンススキーマを生成
 *
 * web 側からは以下のように呼べる（型安全）:
 *   const res = await api.api.health.$get()
 *   const data = await res.json() // → HealthResponse 型
 */

import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { healthResponseSchema } from '../../schemas/dto'
import type { AppEnv } from '../../types'

const route = new Hono<AppEnv>().get(
  '/health',
  describeRoute({
    tags: ['health'],
    summary: 'ヘルスチェック',
    description: 'サーバーが起動しているかを確認する',
    responses: {
      200: {
        description: '正常',
        content: {
          'application/json': {
            schema: resolver(healthResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      status: 'ok' as const,
      timestamp: Math.floor(Date.now() / 1000),
      environment: c.env.ENVIRONMENT,
    })
  },
)

export default route
