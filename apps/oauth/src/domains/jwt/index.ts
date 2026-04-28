/**
 * JWT 生成・検証ドメイン
 *
 * docs/06-jwt-tokens.md のペイロード設計を実装する。
 *
 * このプロジェクトには 2 種類の JWT がある:
 *
 *   1. アクセストークン（type: "access"）
 *      - api-mcp で検証され、API アクセスに使われる
 *      - 短命（5 分）
 *      - oauth サーバーは sign のみ。verify は api-mcp 側で行う
 *
 *   2. OAuth セッション（type: "oauth_session"）
 *      - oauth サーバーの httpOnly Cookie に保存される
 *      - ログイン → 同意画面の間だけ使う
 *      - 中命（7 日）。複数の MCP クライアント接続で再ログインを省略するため
 *      - oauth サーバーが sign / verify する
 *
 * 署名アルゴリズム: HS256（対称鍵 / JWT_SECRET を共有）
 *
 * 設計メモ:
 *   - hono の sign/verify を使う（Workers ネイティブ crypto.subtle 経由）
 *   - 検証は payload.type を必ずチェックして、別種類のトークンが流入するのを防ぐ
 *   - 例外を投げる API（Result<T> は service 層で包む）
 */

import { sign, verify } from 'hono/utils/jwt/jwt'

const ALG = 'HS256'

/** アクセストークン有効期限: 5 分 */
const ACCESS_TOKEN_EXPIRES_IN_SEC = 5 * 60

/** OAuth セッション有効期限: 7 日 */
const OAUTH_SESSION_EXPIRES_IN_SEC = 7 * 24 * 60 * 60

// ─────────────────────────────────────────────────────────
// ペイロード型
// ─────────────────────────────────────────────────────────

export type AccessTokenPayload = {
  /** ユーザー ID */
  sub: string
  /** OAuth クライアント ID */
  client_id: string
  /** 許可されたスコープ（スペース区切り） */
  scope: string
  /** トークン種別。api-mcp が verify 時にこの値で振り分けるため必須 */
  type: 'access'
  /** 発行時刻（Unix 秒） */
  iat: number
  /** 有効期限（Unix 秒） */
  exp: number
}

export type OAuthSessionPayload = {
  /** ユーザー ID */
  sub: string
  /** トークン種別 */
  type: 'oauth_session'
  /** 発行時刻（Unix 秒） */
  iat: number
  /** 有効期限（Unix 秒） */
  exp: number
}

// ─────────────────────────────────────────────────────────
// 入力型（iat/exp/type は内部で付与するので呼び出し側は渡さない）
// ─────────────────────────────────────────────────────────

type SignAccessTokenInput = {
  sub: string
  clientId: string
  scope: string
}

type SignOAuthSessionInput = {
  sub: string
}

// ─────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────

export class JwtDomain {
  /**
   * アクセストークン JWT を生成する
   * 5 分後に失効する短命トークン。api-mcp 側で検証される。
   */
  static async signAccessToken(input: SignAccessTokenInput, secret: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const payload: AccessTokenPayload = {
      sub: input.sub,
      client_id: input.clientId,
      scope: input.scope,
      type: 'access',
      iat: now,
      exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC,
    }
    return sign(payload, secret, ALG)
  }

  /**
   * OAuth セッション JWT を生成する
   * 7 日後に失効。oauth サーバーの httpOnly Cookie に乗せる。
   */
  static async signOAuthSession(input: SignOAuthSessionInput, secret: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const payload: OAuthSessionPayload = {
      sub: input.sub,
      type: 'oauth_session',
      iat: now,
      exp: now + OAUTH_SESSION_EXPIRES_IN_SEC,
    }
    return sign(payload, secret, ALG)
  }

  /**
   * OAuth セッション JWT を検証してペイロードを返す
   *
   * 失敗時は例外を投げる:
   *   - 署名不正・形式不正・期限切れ → hono の verify が throw
   *   - type が "oauth_session" 以外 → ここで throw（アクセストークン誤流入を防ぐ）
   */
  static async verifyOAuthSession(token: string, secret: string): Promise<OAuthSessionPayload> {
    const raw = await verify(token, secret, ALG)

    // hono の verify は exp 期限切れ等を自動チェックする
    // ここでは型情報を再構築（as キャストを使わずに値を取り出す）
    if (
      typeof raw.sub !== 'string' ||
      raw.type !== 'oauth_session' ||
      typeof raw.iat !== 'number' ||
      typeof raw.exp !== 'number'
    ) {
      throw new Error('invalid oauth_session payload')
    }

    return {
      sub: raw.sub,
      type: 'oauth_session',
      iat: raw.iat,
      exp: raw.exp,
    }
  }
}
