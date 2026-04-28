/**
 * AuthorizeService — /authorize のクエリパラメータ検証
 *
 * 役割:
 *   1. zod を通った後のさらなる業務検証（client_id 存在 / redirect_uri 一致）
 *   2. クライアント情報の取り出し（後段の画面描画で使う）
 *
 * エラー種別（OAuth 2.1 / RFC 6749 §4.1.2.1 準拠）:
 *   - "invalid_client": client_id が DB に存在しない
 *   - "invalid_redirect_uri": redirect_uri が登録された URL と一致しない
 *
 * これらは redirect_uri を信頼できないため**リダイレクトせずに直接エラー画面**を表示する。
 * （仕様要件: redirect_uri を検証する前に attacker 提示の URL へリダイレクトしてはいけない）
 */

import type { Result } from '@mcp-oauth/types'
import type { AuthorizeQuery } from '../../schemas/dto'
import { AuthorizeRepository, type OAuthClient } from './repository'

export type AuthorizeError = 'invalid_client' | 'invalid_redirect_uri' | 'server_error'

export type AuthorizeValidationOk = {
  client: OAuthClient
  query: AuthorizeQuery
}

export class AuthorizeService {
  /**
   * /authorize のリクエストパラメータを検証する
   *
   * 注: zod スキーマで通過済みの基本形式チェック（response_type=code 等）は前段で済んでいる前提。
   * ここでは DB を必要とする検証だけ行う。
   */
  static async validate(
    d1: D1Database,
    query: AuthorizeQuery,
  ): Promise<Result<AuthorizeValidationOk> & { errorCode?: AuthorizeError }> {
    // 1. client_id を DB で検索
    const clientResult = await AuthorizeRepository.findClientById(d1, query.client_id)
    if (!clientResult.success) {
      return {
        success: false,
        data: null,
        error: clientResult.error,
        errorCode: 'server_error',
      }
    }
    if (clientResult.data === null) {
      return {
        success: false,
        data: null,
        error: `client_id not found: ${query.client_id}`,
        errorCode: 'invalid_client',
      }
    }

    // 2. redirect_uri が登録時の値と完全一致するか
    const client = clientResult.data
    if (!client.redirectUris.includes(query.redirect_uri)) {
      return {
        success: false,
        data: null,
        error: `redirect_uri does not match registered URIs`,
        errorCode: 'invalid_redirect_uri',
      }
    }

    return {
      success: true,
      data: { client, query },
      error: null,
    }
  }
}
