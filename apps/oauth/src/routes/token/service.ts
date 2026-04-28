/**
 * TokenService — /token のビジネスロジック
 *
 * 2 つのフローを提供:
 *   1. exchangeAuthorizationCode: 認可コード → アクセストークン + リフレッシュトークン
 *   2. refresh:                    既存リフレッシュトークン → 新しいトークンペア（Rotation）
 *
 * セキュリティチェック:
 *   - 認可コードは使い捨て（used_at で再利用検知）
 *   - PKCE: SHA-256(code_verifier) === 保存された code_challenge
 *   - redirect_uri / client_id が認可コード保存時と一致するか
 *   - リフレッシュトークン Rotation（使用後即失効、新しいトークンを発行）
 */

import { OAUTH_CLIENT_IDS } from '@mcp-oauth/constants'
import type { Result } from '@mcp-oauth/types'
import { addSecondsFromNow, isExpiredDate } from '@mcp-oauth/utils'
import { JwtDomain } from '../../domains/jwt'
import { verifyPkce } from '../../libs/pkce'
import { generateRefreshToken } from '../../libs/token'
import type { TokenResponse } from '../../schemas/dto'
import { TokenRepository } from './repository'

/** access_token の有効期限（秒） */
const ACCESS_TOKEN_EXPIRES_IN_SEC = 5 * 60
/** refresh_token の有効期限（秒）= 30 日 */
const REFRESH_TOKEN_EXPIRES_IN_SEC = 30 * 24 * 60 * 60

/** OAuth 2.1 / RFC 6749 §5.2 のエラーコード */
export type TokenErrorCode =
  | 'invalid_request'
  | 'invalid_grant'
  | 'invalid_client'
  | 'unauthorized_client'
  | 'unsupported_grant_type'

export type TokenServiceError = {
  code: TokenErrorCode
  message: string
}

// ─────────────────────────────────────────────────────────
// authorization_code フロー
// ─────────────────────────────────────────────────────────

export type ExchangeAuthCodeInput = {
  code: string
  redirectUri: string
  clientId: string
  codeVerifier: string
}

// ─────────────────────────────────────────────────────────
// refresh_token フロー
// ─────────────────────────────────────────────────────────

export type RefreshInput = {
  refreshToken: string
  clientId: string
}

export class TokenService {
  /**
   * 認可コード → アクセストークン + リフレッシュトークン交換
   */
  static async exchangeAuthorizationCode(
    d1: D1Database,
    input: ExchangeAuthCodeInput,
    jwtSecret: string,
  ): Promise<Result<TokenResponse> & { errorCode?: TokenErrorCode }> {
    // 1. code を検索
    const codeResult = await TokenRepository.findAuthCode(d1, input.code)
    if (!codeResult.success) {
      return { success: false, data: null, error: codeResult.error, errorCode: 'invalid_request' }
    }
    if (codeResult.data === null) {
      return invalidGrant('code not found')
    }
    const codeRow = codeResult.data

    // 2. 既に使用済み → invalid_grant（仕様: 既存トークンの一括失効までやるべきだが今回はエラーのみ）
    if (codeRow.usedAt !== null) {
      return invalidGrant('code already used')
    }

    // 3. 期限切れ
    if (isExpiredDate(codeRow.expiresAt)) {
      return invalidGrant('code expired')
    }

    // 4. client_id 一致
    if (codeRow.clientId !== input.clientId) {
      return invalidGrant('client_id does not match')
    }

    // 5. redirect_uri 一致
    if (codeRow.redirectUri !== input.redirectUri) {
      return invalidGrant('redirect_uri does not match')
    }

    // 6. PKCE 検証
    const pkceOk = await verifyPkce(input.codeVerifier, codeRow.codeChallenge)
    if (!pkceOk) {
      return invalidGrant('PKCE verification failed')
    }

    // 7. code を使用済みにする
    const markResult = await TokenRepository.markAuthCodeUsed(d1, input.code)
    if (!markResult.success) {
      return { success: false, data: null, error: markResult.error, errorCode: 'invalid_request' }
    }

    // 8. アクセストークン発行
    return issueTokens(d1, jwtSecret, {
      userId: codeRow.userId,
      clientId: codeRow.clientId,
      scopes: codeRow.scopes,
    })
  }

  /**
   * リフレッシュトークン → 新しいトークンペア発行（Rotation）
   */
  static async refresh(
    d1: D1Database,
    input: RefreshInput,
    jwtSecret: string,
  ): Promise<Result<TokenResponse> & { errorCode?: TokenErrorCode }> {
    // 1. refresh_token を検索
    const findResult = await TokenRepository.findRefreshToken(d1, input.refreshToken)
    if (!findResult.success) {
      return { success: false, data: null, error: findResult.error, errorCode: 'invalid_request' }
    }
    if (findResult.data === null) {
      return invalidGrant('refresh_token not found')
    }
    const row = findResult.data

    // 2. 既に失効
    if (row.revokedAt !== null) {
      // ※ 本番では「再利用検知 → そのユーザーの全トークン一括失効」を入れるとより安全
      return invalidGrant('refresh_token revoked')
    }

    // 3. 期限切れ
    if (isExpiredDate(row.expiresAt)) {
      return invalidGrant('refresh_token expired')
    }

    // 4. client_id 一致
    if (row.clientId !== input.clientId) {
      return invalidGrant('client_id does not match')
    }

    // 5. 旧トークンを失効（Rotation）
    const revokeResult = await TokenRepository.revokeRefreshToken(d1, input.refreshToken)
    if (!revokeResult.success) {
      return { success: false, data: null, error: revokeResult.error, errorCode: 'invalid_request' }
    }

    // 6. 新しいトークンペアを発行
    return issueTokens(d1, jwtSecret, {
      userId: row.userId,
      clientId: row.clientId,
      scopes: row.scopes,
    })
  }
}

// ─────────────────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────────────────

function invalidGrant(message: string) {
  return {
    success: false as const,
    data: null,
    error: message,
    errorCode: 'invalid_grant' as const,
  }
}

/**
 * アクセストークン JWT + リフレッシュトークンを発行し DB に保存
 */
async function issueTokens(
  d1: D1Database,
  jwtSecret: string,
  input: { userId: string; clientId: string; scopes: string },
): Promise<Result<TokenResponse>> {
  // アクセストークン（5 分）
  const accessToken = await JwtDomain.signAccessToken(
    { sub: input.userId, clientId: input.clientId, scope: input.scopes },
    jwtSecret,
  )

  // リフレッシュトークン（30 日）
  const refreshToken = generateRefreshToken()
  const refreshType: 'mcp' | 'web' = input.clientId === OAUTH_CLIENT_IDS.WEB ? 'web' : 'mcp'

  const saved = await TokenRepository.createRefreshToken(d1, {
    token: refreshToken,
    type: refreshType,
    clientId: input.clientId,
    userId: input.userId,
    scopes: input.scopes,
    expiresAt: addSecondsFromNow(REFRESH_TOKEN_EXPIRES_IN_SEC),
  })
  if (!saved.success) {
    return { success: false, data: null, error: saved.error }
  }

  return {
    success: true,
    data: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRES_IN_SEC,
      refresh_token: refreshToken,
      scope: input.scopes,
    },
    error: null,
  }
}
