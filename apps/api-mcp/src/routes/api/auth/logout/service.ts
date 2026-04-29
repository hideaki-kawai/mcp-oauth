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
    const body = new URLSearchParams({ token: refreshToken }).toString()
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }

    // OAuth サーバーの /revoke を呼び、リフレッシュトークンを失効させる
    const res = await (oauthInternalUrl
      ? fetch(`${oauthInternalUrl}${OAUTH_PATHS.REVOKE}`, { method: 'POST', headers, body })
      : oauthService.fetch(`https://oauth${OAUTH_PATHS.REVOKE}`, { method: 'POST', headers, body })
    ).catch((err: unknown): never => {
      throw new Error(err instanceof Error ? err.message : 'network error')
    })

    if (!res.ok) {
      return { success: false, data: null, error: `revoke failed: ${res.status}` }
    }

    return { success: true, data: undefined, error: null }
  }
}
