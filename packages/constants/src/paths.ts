/**
 * パス定数
 *
 * アプリごとにネームスペースを分けて管理する。
 * ハードコードを防ぎ、どのアプリのパスかを明示する。
 */

/** OAuthサーバー（apps/oauth）のパス */
export const OAUTH_PATHS = {
  WELL_KNOWN: '/.well-known/oauth-authorization-server', // OAuth メタデータ
  REGISTER: '/register', // DCR
  AUTHORIZE: '/authorize', // OAuth 同意フロー
  AUTHORIZE_LOGIN: '/authorize/login', // OAuth ログイン
  AUTHORIZE_CONSENT: '/authorize/consent', // OAuth 同意
  TOKEN: '/token', // OAuth 認可コードからアクセストークン発行
  REVOKE: '/revoke', // OAuth リフレッシュトークン失効
} as const

/** api-mcpサーバー（apps/api-mcp）のパス */
export const API_MCP_PATHS = {
  WELL_KNOWN: '/.well-known/oauth-protected-resource', // OAuth メタデータ
  MCP: '/mcp', // MCP エンドポイント
  HEALTH: '/api/health',
  // BFF
  AUTH: '/api/auth', // Cookie の path スコープ用（エンドポイントではない）
  AUTH_TOKEN: '/api/auth/token', // BFF 認証コードからアクセストークン発行
  AUTH_REFRESH: '/api/auth/refresh', // BFF アクセストークン更新
  AUTH_LOGOUT: '/api/auth/logout', // BFF ログアウト
  // リソースサーバー
  // FX（Web SPA / MCP 共通データソース）
  FX_RATE: '/api/fx/rate', // FX レート取得
  FX_CONVERT: '/api/fx/convert', // FX 通貨換算
  FX_HISTORY: '/api/fx/history', // FX 履歴取得
  // Crypto
  CRYPTO_PRICE: '/api/crypto/price', // Crypto 価格取得
  CRYPTO_MARKET: '/api/crypto/market', // Crypto 市場取得
  CRYPTO_HISTORY: '/api/crypto/history', // Crypto 履歴取得
} as const

/** Webフロントエンド（apps/web）のパス */
export const WEB_PATHS = {
  HOME: '/', // 認証後のホーム
  LOGIN: '/login', // ログイン
  AUTH_CALLBACK: '/auth/callback', // OAuth 認証コールバック
} as const
