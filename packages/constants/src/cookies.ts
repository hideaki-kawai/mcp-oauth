/**
 * Cookie 名定数
 *
 * アプリごとにネームスペースを分けて管理する。
 * Cookie 名のハードコードを防ぎ、set/get/clear で名前が一致することを型で保証する。
 */

/** OAuthサーバー（apps/oauth）が発行・検証する Cookie */
export const OAUTH_COOKIES = {
  /**
   * OAuth セッション JWT
   *
   * - ログイン → 同意画面の間だけ使う
   * - oauth サーバーのドメインに限定された httpOnly Cookie
   * - 値は JwtDomain.signOAuthSession で生成した JWT
   * - 有効期限は 7 日
   */
  SESSION: 'oauth_session',
} as const

/** api-mcpサーバー（apps/api-mcp）が発行・検証する Cookie */
export const API_MCP_COOKIES = {
  /**
   * リフレッシュトークン
   *
   * - Web SPA 用。BFF が /api/auth/token で受け取って httpOnly Cookie に格納
   * - 有効期限は 30 日（DB の refresh_tokens テーブルと一致）
   */
  REFRESH_TOKEN: 'refreshToken',
} as const
