/**
 * AuthTokenService — 認可コード → トークン交換（BFF）
 *
 * SPA から受け取った認可コードを OAUTH_SERVICE 経由で OAuth サーバーの /token に渡し、
 * アクセストークンとリフレッシュトークンを受け取る。
 */

import type { Fetcher } from '@cloudflare/workers-types'
import { OAUTH_CLIENT_IDS, OAUTH_PATHS } from '@mcp-oauth/constants'
import type { Result } from '@mcp-oauth/types'

export type TokenExchangeResult = {
  accessToken: string
  refreshToken: string
}

export class AuthTokenService {
  static async exchangeCode(
    oauthService: Fetcher,
    input: { code: string; codeVerifier: string; redirectUri: string },
    oauthInternalUrl?: string
  ): Promise<Result<TokenExchangeResult>> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: OAUTH_CLIENT_IDS.WEB,
      redirect_uri: input.redirectUri,
    }).toString()
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }

    const res = await (oauthInternalUrl
      ? fetch(`${oauthInternalUrl}${OAUTH_PATHS.TOKEN}`, { method: 'POST', headers, body })
      : oauthService.fetch(`https://oauth${OAUTH_PATHS.TOKEN}`, { method: 'POST', headers, body })
    ).catch((err: unknown): never => {
      throw new Error(err instanceof Error ? err.message : 'network error')
    })

    if (!res.ok) {
      const body = await res.json<{ error?: string }>().catch((): { error?: string } => ({}))
      return { success: false, data: null, error: body.error ?? 'invalid_grant' }
    }

    const data = await res.json<{ access_token: string; refresh_token: string }>()
    return {
      success: true,
      data: { accessToken: data.access_token, refreshToken: data.refresh_token },
      error: null,
    }
  }
}
