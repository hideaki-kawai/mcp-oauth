/**
 * 既知の OAuth クライアント ID
 *
 * 事前登録（シーダー）するクライアントの ID をハードコードしないために定義。
 * DCR で動的登録されるクライアント（Claude 等）はここに含まれない。
 */
export const OAUTH_CLIENT_IDS = {
  /** Web SPA（事前登録、シーダーで投入） */
  WEB: 'web-client',
} as const

/** OAuth スコープ定数 */
export const OAUTH_SCOPES = {
  /** Web SPA が要求するスコープ */
  WEB: 'read write',
} as const
