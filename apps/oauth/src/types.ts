/**
 * apps/oauth の型定義
 *
 * - Bindings: wrangler.jsonc の vars / secrets / D1 / Service Binding
 * - Variables: ミドルウェアが c.set() で詰める値（OAuth セッション等）
 * - AppEnv: Hono ジェネリクスに渡す統合型
 *
 * api-mcp と同じ構成（types.ts → AppEnv → Hono<AppEnv>）に揃えている。
 */

import type { OAuthSessionPayload } from './domains/jwt'

/** 環境識別 */
export type Environment = 'production' | 'development'

/** Cloudflare Workers の env */
export type Bindings = {
  // D1: oauth-db（users, oauth_clients, authorization_codes, refresh_tokens）
  DB_OAUTH: D1Database

  // 自身の URL（issuer / audience の判定に使用）
  OAUTH_ISSUER: string

  // 環境識別
  ENVIRONMENT: Environment

  // JWT 署名鍵（.dev.vars / wrangler secret put）
  JWT_SECRET: string
}

/** Hono のコンテキスト変数（ミドルウェアが詰める値） */
export type Variables = {
  // OAuth セッションミドルウェアが詰める値（フェーズ 2-4 以降）
  oauthSession?: OAuthSessionPayload
}

/** Hono アプリケーションのジェネリクス用統合型 */
export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
