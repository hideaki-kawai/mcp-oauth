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
