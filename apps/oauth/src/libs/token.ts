/**
 * OAuth サーバーで発行する各種トークン文字列を生成するユーティリティ
 *
 * - 認可コード（authorization_code）: /token に交換するための一時コード
 * - リフレッシュトークン（refresh_token）: アクセストークン再発行のための長寿命トークン
 *
 * 設計方針:
 *   - 外部ライブラリ（nanoid 等）は使わない
 *   - Cloudflare Workers のネイティブ API `crypto.getRandomValues()` を使う
 *   - Workers でも Node.js 22+ でも同じコードが動く（crypto はグローバル）
 *
 * crypto.getRandomValues() の中身:
 *   - 暗号学的に安全な乱数源（OS の /dev/urandom 相当）からバイト列を取得する
 *   - crypto.randomUUID() の内部もこれを使っている
 *   - 「必要な分のランダムバイトを直接得る」素直な API
 *
 * なぜ randomUUID() を使わないのか:
 *   UUID v4 は 128 bit のうち 6 bit がバージョン/バリアントの固定ビットになっており、
 *   厳密には 122 bit のランダム性しか持たない。
 *   getRandomValues() で必要な長さのバイト列を直接取れば、
 *   固定パターンなしの純粋なランダム値が手に入り、コードも短くなる。
 *
 * フォーマット:
 *   バイト列を 16 進数の文字列に変換して使う（例: 0x1f → "1f"）。
 *   - URL に乗せても安全な文字（[0-9a-f]）のみ
 *   - 1 バイト = 2 文字なので、文字数 = バイト数 × 2
 */

/**
 * バイト列を 16 進文字列に変換するヘルパー
 *
 * 例: Uint8Array([0x1f, 0x3e, 0x2c]) → "1f3e2c"
 *
 * - padStart(2, '0') で 1 桁の値（例: 0x0a）も "0a" のように 2 桁に揃える
 *   これがないと "0a" が "a" になり、文字列長が予測不能になる
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 認可コードを生成する
 *
 * 認可コードとは:
 *   OAuth 2.1 Authorization Code Flow の中盤で発行される使い捨ての文字列。
 *   ユーザーが同意画面で「許可」を押した瞬間に発行され、
 *   クライアント（web SPA / Claude）は受け取った認可コードを /token エンドポイントに
 *   送ってアクセストークン・リフレッシュトークンに交換する。
 *
 * 性質:
 *   - 1 回限り使用可能（DB の `used_at` で使用済みフラグを管理）
 *   - 短命（10 分程度の有効期限）
 *   - リダイレクト URL のクエリパラメータ（`?code=xxx`）に乗せて渡す
 *     → URL に乗っても安全な文字のみで構成する必要がある
 *
 * フォーマット: 32 文字の 16 進数（128 bit エントロピー）
 *   docs/04-database.md では「ランダム文字列（32文字）」と指定されている
 *   16 バイト × 2 = 32 文字
 *
 *   ※ 128 bit のランダム空間とは:
 *      総当たり攻撃が現実的に不可能なレベル。UUID と同等の強度。
 */
export function generateAuthCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16)) // 16 バイト = 128 bit
  return bytesToHex(bytes)
}

/**
 * リフレッシュトークンを生成する
 *
 * リフレッシュトークンとは:
 *   アクセストークン（短命: 5 分）の有効期限が切れたとき、
 *   再ログインせずに新しいアクセストークンを発行するための長寿命トークン。
 *   /token エンドポイントに `grant_type=refresh_token` で送ると、
 *   新しいアクセストークン + 新しいリフレッシュトークンが発行される（Rotation）。
 *
 * 性質:
 *   - 長命（30 日程度）
 *   - DB に保存して `revoked_at` で失効管理する（JWT ではなくランダム文字列）
 *   - 流出すると深刻な被害になるため、認可コードより長くて推測困難な文字列にする
 *
 * フォーマット: 64 文字の 16 進数（256 bit エントロピー）
 *   docs/04-database.md では「ランダム文字列（64文字）」と指定されている
 *   32 バイト × 2 = 64 文字
 *
 *   ※ 256 bit の乱数空間とは:
 *      1 秒間に 1 兆個発行しても、宇宙の年齢の何倍経っても衝突しないレベル。
 *      過剰なくらいの安全マージン。
 */
export function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32)) // 32 バイト = 256 bit
  return bytesToHex(bytes)
}
