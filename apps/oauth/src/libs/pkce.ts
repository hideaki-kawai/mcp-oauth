/**
 * PKCE 検証ヘルパー（OAuth サーバー側）
 *
 * /token エンドポイントで使う。
 * クライアント（web SPA / Claude）が送ってきた code_verifier を SHA-256 してから
 * Base64URL エンコードし、認可コード発行時に保存した code_challenge と一致するかを確認する。
 *
 * 署名アルゴリズム: S256 のみサポート（OAuth 2.1 で plain は非推奨）。
 */

/**
 * バイト列を Base64URL でエンコードする
 * 通常の Base64 から `+` `/` `=` を URL セーフな形へ変換
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/**
 * code_verifier をハッシュ化して、保存済み code_challenge と比較する
 *
 * 注意: タイミング攻撃対策の定数時間比較は行っていない（base64url 文字列同士の比較で
 * 攻撃成立性は低いため）。気になるなら後で timingSafeEqual を入れる。
 */
export async function verifyPkce(verifier: string, expectedChallenge: string): Promise<boolean> {
  const data = new TextEncoder().encode(verifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const challenge = bytesToBase64Url(new Uint8Array(hashBuffer))
  return challenge === expectedChallenge
}
