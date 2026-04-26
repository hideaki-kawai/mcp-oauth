import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// 仮
/**
 * ユーザー
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/**
 * OAuthクライアント
 * Claude等の登録済みクライアント
 */
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  clientSecret: text('client_secret').notNull(),
  redirectUris: text('redirect_uris').notNull(), // JSON配列
  scopes: text('scopes').notNull(), // スペース区切り
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * 認可コード
 * OAuth 2.0 Authorization Code Flow の一時コード
 */
export const authorizationCodes = sqliteTable('authorization_codes', {
  code: text('code').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  redirectUri: text('redirect_uri').notNull(),
  scopes: text('scopes').notNull(),
  codeChallenge: text('code_challenge'), // PKCE
  codeChallengeMethod: text('code_challenge_method'), // PKCE
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * アクセストークン
 */
export const accessTokens = sqliteTable('access_tokens', {
  token: text('token').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  scopes: text('scopes').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * リフレッシュトークン
 */
export const refreshTokens = sqliteTable('refresh_tokens', {
  token: text('token').primaryKey(),
  accessToken: text('access_token')
    .notNull()
    .references(() => accessTokens.token),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  scopes: text('scopes').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
