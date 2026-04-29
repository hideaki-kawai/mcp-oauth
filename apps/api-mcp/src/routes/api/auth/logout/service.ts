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
  static async logout(oauthService: Fetcher, refreshToken: string): Promise<Result<void>> {
    // OAuth サーバーの /revoke を呼び、リフレッシュトークンを失効させる
    const res = await oauthService
      .fetch(`https://oauth${OAUTH_PATHS.REVOKE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      })
      .catch((err: unknown): never => {
        throw new Error(err instanceof Error ? err.message : 'network error')
      })

    if (!res.ok) {
      return { success: false, data: null, error: `revoke failed: ${res.status}` }
    }

    return { success: true, data: undefined, error: null }
  }
}
