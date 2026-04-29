import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * ユーザー
 *
 * - 初期ユーザーはシーダーで投入する
 * - 管理画面は OAuth セッション Cookie の `sub` からユーザーを特定し、
 *   `role = "admin"` のみアクセスを許可する（スコープではなくロールで制御）
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // crypto.randomUUID()
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // PBKDF2ハッシュ（crypto.subtle）
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/**
 * OAuthクライアント
 *
 * - DCRで自動登録（Claude）、またはシーダーで登録（Webアプリ）
 * - すべて public client（`token_endpoint_auth_method = "none"`）
 */
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey(), // crypto.randomUUID()（client_id として使用）
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').notNull(), // JSON配列
  tokenEndpointAuthMethod: text('token_endpoint_auth_method', {
    enum: ['none'],
  }).notNull(),
  scopes: text('scopes').notNull(), // スペース区切り（"read write"）
  firstParty: integer('first_party', { mode: 'boolean' }).notNull().default(false), // true = 自分たちのアプリ（同意画面スキップ）
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * 認可コード
 *
 * - 使い捨て・10分有効
 * - 使用後は削除せず `used_at` を記録する（再利用攻撃の検知用）
 */
export const authorizationCodes = sqliteTable('authorization_codes', {
  code: text('code').primaryKey(), // ランダム文字列（32文字）
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  scopes: text('scopes').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(), // PKCE
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }), // null = 未使用
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * リフレッシュトークン
 *
 * - MCP用（Claude）/ Web用（SPA）/ 同意フロー用（セッション）を `type` で区別
 * - **Rotation**: 使用のたびに新しいものに差し替える
 *   （古いトークンが再利用された場合は盗難の可能性があるため、
 *    同じユーザー・クライアントのトークンをすべて失効させる）
 */
export const refreshTokens = sqliteTable('refresh_tokens', {
  token: text('token').primaryKey(), // ランダム文字列（64文字）
  type: text('type', { enum: ['mcp', 'web', 'session'] }).notNull(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  scopes: text('scopes').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }), // null = 有効
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
