/**
 * AuthLogoutService — ログアウト（BFF）
 *
 * OAUTH_SERVICE 経由で OAuth サーバーの /revoke を呼び、
 * リフレッシュトークンを DB から失効させる。
 */

import type { Fetcher } from '@cloudflare/workers-types'
import { OAUTH_PATHS } from '@mcp-oauth/constants'
import type { Result } from '@mcp-oauth/types'

export class AuthLogoutService {
  static async logout(
    oauthService: Fetcher,
    refreshToken: string,
    oauthInternalUrl?: string
  ): Promise<Result<void>> {
    const url = `${oauthInternalUrl ?? 'https://oauth'}${OAUTH_PATHS.REVOKE}`
    const doFetch = oauthInternalUrl
      ? (u: string, init: RequestInit) => fetch(u, init)
      : (u: string, init: RequestInit) => oauthService.fetch(u, init)

    // OAuth サーバーの /revoke を呼び、リフレッシュトークンを失効させる
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    }).catch((err: unknown): never => {
      throw new Error(err instanceof Error ? err.message : 'network error')
    })

    if (!res.ok) {
      return { success: false, data: null, error: `revoke failed: ${res.status}` }
    }

    return { success: true, data: undefined, error: null }
  }
}
