/**
 * ConsentService — 認可コードの発行 or 拒否
 *
 * 入力: ユーザーの action（approve/deny）+ OAuth フロー情報 + 認証済みユーザーID
 *
 * approve のとき:
 *   1. form の client_id / redirect_uri を DB と照合（ユーザーが DevTools で書き換えうるため）
 *   2. 認可コード（32 文字 hex）を発行
 *   3. authorization_codes に保存（10 分有効）
 *   4. リダイレクト URL（redirect_uri?code=...&state=...）を返す
 *
 * deny のとき:
 *   1. リダイレクト URL（redirect_uri?error=access_denied&state=...）を返す
 *      ※ deny でも client_id / redirect_uri の検証は必要（任意 URL に飛ばさないため）
 */

import type { Result } from '@mcp-oauth/types'
import { addSecondsFromNow } from '@mcp-oauth/utils'
import { generateAuthCode } from '../../../libs/token'
import type { AuthorizeConsentForm } from '../../../schemas/dto'
import { ConsentRepository } from './repository'

/** 認可コード有効期限: 10 分 */
const AUTH_CODE_EXPIRES_IN_SEC = 10 * 60

export type ConsentInput = {
  form: AuthorizeConsentForm
  /** 認証済みユーザー ID（OAuth セッション Cookie の sub） */
  userId: string
}

export type ConsentOk = {
  /** ブラウザを飛ばすべき URL（redirect_uri?code=... or ?error=...） */
  redirectUrl: string
}

export type ConsentErrorCode = 'invalid_client' | 'invalid_redirect_uri' | 'server_error'

export class ConsentService {
  static async handle(
    d1: D1Database,
    input: ConsentInput,
  ): Promise<Result<ConsentOk> & { errorCode?: ConsentErrorCode }> {
    const { form, userId } = input

    // 1. form の client_id / redirect_uri を DB で再検証（防御的）
    const clientResult = await ConsentRepository.findClientById(d1, form.client_id)
    if (!clientResult.success) {
      return { success: false, data: null, error: clientResult.error, errorCode: 'server_error' }
    }
    if (clientResult.data === null) {
      return {
        success: false,
        data: null,
        error: `client_id not found: ${form.client_id}`,
        errorCode: 'invalid_client',
      }
    }
    if (!clientResult.data.redirectUris.includes(form.redirect_uri)) {
      return {
        success: false,
        data: null,
        error: 'redirect_uri does not match registered URIs',
        errorCode: 'invalid_redirect_uri',
      }
    }

    // 2. action に応じて分岐
    if (form.action === 'deny') {
      return {
        success: true,
        data: { redirectUrl: buildRedirectUrl(form.redirect_uri, { error: 'access_denied', state: form.state }) },
        error: null,
      }
    }

    // approve → 認可コード発行
    const code = generateAuthCode()
    const expiresAt = addSecondsFromNow(AUTH_CODE_EXPIRES_IN_SEC)

    const saved = await ConsentRepository.createAuthCode(d1, {
      code,
      clientId: form.client_id,
      userId,
      scopes: form.scope,
      redirectUri: form.redirect_uri,
      codeChallenge: form.code_challenge,
      expiresAt,
    })
    if (!saved.success) {
      return { success: false, data: null, error: saved.error, errorCode: 'server_error' }
    }

    return {
      success: true,
      data: { redirectUrl: buildRedirectUrl(form.redirect_uri, { code, state: form.state }) },
      error: null,
    }
  }
}

/** クエリパラメータを付与した URL を組み立てる */
function buildRedirectUrl(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v)
  }
  return url.toString()
}
