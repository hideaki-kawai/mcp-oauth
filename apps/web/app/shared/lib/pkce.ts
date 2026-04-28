/**
 * PKCE（Proof Key for Code Exchange）と state のユーティリティ
 *
 * PKCE とは何か（RFC 7636）:
 *   OAuth 2.1 で必須となった、認可コード横取り攻撃を防ぐ仕組み。
 *
 *   問題: 認可コードがリダイレクトの URL クエリ（?code=xxx）に乗るため、
 *         悪意あるアプリ・ブラウザ拡張・ネットワーク中間者がこれを盗むと
 *         アクセストークンに交換できてしまう。
 *
 *   解決: クライアントが「秘密の合言葉（code_verifier）」を作り、
 *         そのハッシュ（code_challenge）を /authorize に渡す。
 *         認可コード交換時（/token）には元の合言葉を提示する。
 *         サーバーは「ハッシュ後が最初に渡された値と一致するか」を検証する。
 *
 *         認可コードを盗んだ攻撃者は code_verifier を知らないので使えない。
 *
 * フローのおさらい:
 *
 *   1. SPA が code_verifier を作る（ランダム文字列）
 *   2. SPA が code_challenge = BASE64URL(SHA256(code_verifier)) を計算
 *   3. SPA が code_verifier を sessionStorage に保存
 *   4. SPA が /authorize?...&code_challenge=XXX&code_challenge_method=S256 へリダイレクト
 *   5. ユーザーがログイン・同意 → /callback?code=YYY&state=ZZZ にリダイレクトされる
 *   6. SPA が sessionStorage から code_verifier を取り出す
 *   7. SPA が /token に code + code_verifier を送る
 *   8. サーバーが SHA256(code_verifier) == 保存していた code_challenge を検証
 *
 * state とは:
 *   OAuth フローにおける CSRF（クロスサイトリクエストフォージェリ）対策。
 *   /authorize に渡した state が /callback で同じ値で返ってくることを確認することで、
 *   「ユーザーが意図して始めたフロー」であることを保証する。
 *
 * このファイルは web SPA でのみ使う。
 * 関連: apps/oauth 側ではサーバーが受け取った code_challenge を保存し、
 *       /token で受け取った code_verifier をハッシュして照合する処理が必要になる。
 */

/**
 * PKCE の code_verifier を生成する
 *
 * RFC 7636 の仕様:
 *   - 43〜128 文字の文字列
 *   - 使用可能文字: [A-Z][a-z][0-9]-._~（unreserved characters）
 *
 * 実装:
 *   - 32 バイトの乱数を Base64URL エンコード → 43 文字になる（最低限の長さで十分強い）
 *   - 32 バイト = 256 bit の乱数 = 推測不可能
 *
 * 戻り値の例: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
 */
export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return base64UrlEncode(bytes)
}

/**
 * code_verifier から code_challenge を計算する
 *
 * code_challenge = BASE64URL(SHA-256(code_verifier))
 *
 * これを /authorize?code_challenge=... と一緒にサーバーへ送る。
 * サーバー側は元の verifier を知らないが、後で送られてくる verifier をハッシュして
 * この値と一致するかを確認することで、「フローを始めたクライアントと同一」と判定できる。
 *
 * code_challenge_method:
 *   - "S256" → SHA-256 でハッシュ（推奨・OAuth 2.1 ではこれのみ許可）
 *   - "plain" → ハッシュなし（非推奨・このプロジェクトでは未対応）
 *
 * 戻り値の例: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  // 文字列 → バイト列への変換（UTF-8）
  const data = new TextEncoder().encode(verifier)

  // crypto.subtle.digest はブラウザ・Workers・Node 22+ で使えるネイティブ API
  // SHA-256 でハッシュ化（32 バイト = 256 bit のダイジェストを返す）
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  return base64UrlEncode(new Uint8Array(hashBuffer))
}

/**
 * CSRF 対策用の state 値を生成する
 *
 * 用途:
 *   /authorize に渡した値が /callback で同じ値で返ってくることを確認する。
 *   攻撃者が偽の認可コードでコールバックを叩こうとしても、state を知らないので失敗する。
 *
 * 実装:
 *   - 16 バイトの乱数（128 bit）を Base64URL エンコード → 22 文字
 *   - これを sessionStorage に保存し、/callback 受信時に比較して破棄する
 *
 * 戻り値の例: "k7N2gQXfL_aBcD9eF1g2H3"
 */
export function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return base64UrlEncode(bytes)
}

// ─────────────────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────────────────

/**
 * バイト列を Base64URL でエンコードする
 *
 * 通常の Base64 との違い（RFC 4648 §5）:
 *   - "+" → "-"
 *   - "/" → "_"
 *   - 末尾のパディング "=" を削除
 *
 * → URL クエリやファイル名に使っても問題ない安全な文字だけになる。
 *    PKCE / state / JWT 等、URL に乗せる用途では必ず Base64URL を使う。
 */
function base64UrlEncode(bytes: Uint8Array): string {
  // バイト列 → 通常の Base64 文字列
  // String.fromCharCode は引数が多いとスタックオーバーフローするので 1 バイトずつ処理する
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  const base64 = btoa(str)

  // Base64URL に変換（URL セーフな文字のみに）
  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
