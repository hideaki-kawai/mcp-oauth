/**
 * Cloudflare Workers の env に注入される値の型定義。
 *
 * - vars: wrangler.jsonc の "vars" セクション（公開可能な値）
 * - secrets: .dev.vars / wrangler secret put（秘匿値）
 * - bindings: D1, KV, Service Binding 等
 *
 * Hono の Context で `c.env.XXX` として参照できるようにするため、
 * 各 Controller は `Hono<{ Bindings: Bindings }>` でジェネリクスを指定する。
 */
export type Bindings = {
  // D1: oauth-db（users, oauth_clients, authorization_codes, refresh_tokens）
  DB_OAUTH: D1Database

  // 自身の URL（issuer / audience 判定に使用）
  OAUTH_ISSUER: string

  // 環境識別（"production" / "development"）
  ENVIRONMENT: 'production' | 'development'

  // JWT 署名鍵（.dev.vars / wrangler secret put）
  JWT_SECRET: string
}
