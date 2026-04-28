/**
 * RegisterService
 *
 * Dynamic Client Registration（RFC 7591）のビジネスロジック:
 *   1. デフォルト値の補完
 *   2. client_id 生成（crypto.randomUUID()）
 *   3. RegisterRepository 経由で DB 保存
 *   4. RFC 7591 §3.2.1 形式のレスポンスを組み立てる
 *
 * バリデーションは Controller 側（zod）で済んでいる前提で、ここではビジネス規則のみ扱う。
 */

import type { Result } from '@mcp-oauth/types'
import type { RegisterRequest, RegisterResponse } from '../../schemas/dto'
import { RegisterRepository } from './repository'

// ─────────────────────────────────────────────────────────
// デフォルト値
// ─────────────────────────────────────────────────────────

const DEFAULT_GRANT_TYPES: ('authorization_code' | 'refresh_token')[] = [
  'authorization_code',
  'refresh_token',
]
const DEFAULT_RESPONSE_TYPES: 'code'[] = ['code']
const DEFAULT_TOKEN_ENDPOINT_AUTH_METHOD: 'none' = 'none'
const DEFAULT_SCOPE = 'read write'
const DEFAULT_CLIENT_NAME = 'Unknown Client'

// ─────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────

export class RegisterService {
  /**
   * DCR 登録処理本体
   */
  static async register(
    d1: D1Database,
    req: RegisterRequest,
  ): Promise<Result<RegisterResponse>> {
    // 1. デフォルト値補完
    const grantTypes = req.grant_types ?? DEFAULT_GRANT_TYPES
    const responseTypes = req.response_types ?? DEFAULT_RESPONSE_TYPES
    const tokenEndpointAuthMethod = req.token_endpoint_auth_method ?? DEFAULT_TOKEN_ENDPOINT_AUTH_METHOD
    const scope = req.scope ?? DEFAULT_SCOPE
    const clientName = req.client_name ?? DEFAULT_CLIENT_NAME

    // 2. client_id 生成
    //    crypto.randomUUID() は Workers ネイティブで暗号学的に安全な乱数源を使う
    const clientId = crypto.randomUUID()
    const issuedAt = Math.floor(Date.now() / 1000)

    // 3. DB 保存
    const saved = await RegisterRepository.create(d1, {
      id: clientId,
      name: clientName,
      redirectUris: req.redirect_uris,
      tokenEndpointAuthMethod,
      scopes: scope,
      createdAt: new Date(issuedAt * 1000),
    })
    if (!saved.success) {
      return { success: false, data: null, error: saved.error }
    }

    // 4. RFC 7591 形式のレスポンス組み立て
    return {
      success: true,
      data: {
        client_id: clientId,
        client_id_issued_at: issuedAt,
        redirect_uris: req.redirect_uris,
        client_name: clientName,
        grant_types: grantTypes,
        response_types: responseTypes,
        token_endpoint_auth_method: tokenEndpointAuthMethod,
        scope,
      },
      error: null,
    }
  }
}
