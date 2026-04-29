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
  HEALTH: '/api/health',
  // BFF（フェーズ 5 で実装）
  AUTH_TOKEN: '/api/auth/token',
  AUTH_REFRESH: '/api/auth/refresh',
  AUTH_LOGOUT: '/api/auth/logout',
  // FX（Web SPA / MCP 共通データソース）
  FX_RATE: '/api/fx/rate',
  FX_CONVERT: '/api/fx/convert',
  FX_HISTORY: '/api/fx/history',
  // Crypto
  CRYPTO_PRICE: '/api/crypto/price',
  CRYPTO_MARKET: '/api/crypto/market',
  CRYPTO_HISTORY: '/api/crypto/history',
} as const

/** Webフロントエンド（apps/web）のパス */
export const WEB_PATHS = {
  HOME: '/',
  LOGIN: '/login',
  AUTH_CALLBACK: '/auth/callback',
} as const
