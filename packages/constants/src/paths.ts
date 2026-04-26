/**
 * パス定数
 *
 * アプリごとにネームスペースを分けて管理する。
 * ハードコードを防ぎ、どのアプリのパスかを明示する。
 */

/** OAuthサーバー（apps/oauth）のパス */
export const OAUTH_PATHS = {
  WELL_KNOWN: '/.well-known/oauth-authorization-server',
  REGISTER: '/register',
  AUTHORIZE: '/authorize',
  AUTHORIZE_LOGIN: '/authorize/login',
  AUTHORIZE_CONSENT: '/authorize/consent',
  TOKEN: '/token',
} as const

/** api-mcpサーバー（apps/api-mcp）のパス */
export const API_MCP_PATHS = {
  WELL_KNOWN: '/.well-known/oauth-protected-resource',
  MCP: '/mcp',
  AUTH_TOKEN: '/api/auth/token',
  AUTH_REFRESH: '/api/auth/refresh',
  AUTH_LOGOUT: '/api/auth/logout',
} as const

/** Webフロントエンド（apps/web）のパス */
export const WEB_PATHS = {
  HOME: '/',
  LOGIN: '/login',
  AUTH_CALLBACK: '/auth/callback',
} as const
