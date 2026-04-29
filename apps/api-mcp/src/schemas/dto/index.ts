/**
 * DTO（Data Transfer Object）スキーマ
 *
 * API のリクエスト/レスポンスを定義する zod スキーマ。
 * バックエンド（api-mcp）とフロントエンド（web）で共有される。
 *
 * - api-mcp 側: validator('json', schema) で受信時に型検証
 * - api-mcp 側: describeRoute の resolver(schema) で OpenAPI スキーマ生成
 * - web 側: `import type { ... } from '@mcp-oauth/api-mcp/dto'` で型のみ参照
 *
 * 使い方:
 *   import { z } from 'zod'
 *
 *   export const healthResponseSchema = z.object({
 *     status: z.literal('ok'),
 *     timestamp: z.number(),
 *   })
 *   export type HealthResponse = z.infer<typeof healthResponseSchema>
 *
 * フェーズ5 で /api/auth/* の DTO を追加する。
 */

export * from './crypto'
export * from './fx'
export * from './health'
export * from './well-known'
