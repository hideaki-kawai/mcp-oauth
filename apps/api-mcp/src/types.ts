/**
 * api-mcp サーバーの型定義
 *
 * - Bindings: wrangler.jsonc の vars / secrets / D1 / Service Binding
 * - Variables: ミドルウェアが c.set() で詰める値（認証ユーザー等）
 * - AppEnv: Hono ジェネリクスに渡す統合型
 */

import type { Fetcher } from '@cloudflare/workers-types'

/** 環境識別 */
export type Environment = 'production' | 'development'

/** Cloudflare Workers の env */
export type Bindings = {
  // D1: api-mcp-db（アプリ固有データ用、現在は空）
  DB_API_MCP: D1Database

  // Service Binding: oauth Worker への内部通信
  OAUTH_SERVICE: Fetcher

  // 自身の URL（OAuth Protected Resource Metadata の resource 値）
  API_MCP_BASE_URL: string

  // OAuth サーバーの URL（メタデータ・JWT issuer 検証）
  OAUTH_ISSUER: string

  // 環境識別
  ENVIRONMENT: Environment

  // JWT 署名鍵（OAuth と共有・.dev.vars / wrangler secret）
  JWT_SECRET: string
}

/** Hono のコンテキスト変数（ミドルウェアが詰める値） */
export type Variables = {
  // 認証ミドルウェアが詰める JWT ペイロード（フェーズ3 で実装）
  // user?: JwtAccessTokenPayload
}

/** Hono アプリケーションのジェネリクス用統合型 */
export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
