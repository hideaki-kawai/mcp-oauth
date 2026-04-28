/**
 * GET /api/health のスキーマ
 *
 * Hono RPC + OpenAPI のサンプルとして配置。
 * フェーズ5 で /api/auth/* 等の本格的なエンドポイントを追加する際の参考にする。
 */

import { z } from 'zod'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.number(), // Unix タイムスタンプ（秒）
  environment: z.enum(['production', 'development']),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
