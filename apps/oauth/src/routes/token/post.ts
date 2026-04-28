/**
 * POST /token — アクセストークン発行
 *
 * grant_type で処理が分岐する:
 * - authorization_code: 認可コード → アクセストークン + リフレッシュトークン
 * - refresh_token: 古いリフレッシュトークン → 新しいトークンペア（Rotation）
 *
 * TODO: フェーズ 2-7 で実装する
 */
export {}
