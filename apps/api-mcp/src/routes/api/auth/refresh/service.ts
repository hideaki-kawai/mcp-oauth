/**
 * AuthRefreshService — リフレッシュトークン更新（BFF）
 *
 * httpOnly Cookie のリフレッシュトークンを OAUTH_SERVICE 経由で OAuth サーバーの /token に渡し、
 * 新しいアクセストークンとリフレッシュトークンを取得する。
 * アクセストークンの JWT を検証してユーザー情報も返す（SPA の authContext 用）。
 */

import { verify } from 'hono/utils/jwt/jwt'
import type { Fetcher } from '@cloudflare/workers-types'
import { OAUTH_CLIENT_IDS, OAUTH_PATHS } from '@mcp-oauth/constants'
import type { Result } from '@mcp-oauth/types'

export type RefreshResult = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string }
}

export class AuthRefreshService {
  static async refresh(
    oauthService: Fetcher,
    jwtSecret: string,
    refreshToken: string
  ): Promise<Result<RefreshResult>> {
    const res = await oauthService
      .fetch(`https://oauth${OAUTH_PATHS.TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: OAUTH_CLIENT_IDS.WEB,
        }).toString(),
      })
      .catch((err: unknown): never => {
        throw new Error(err instanceof Error ? err.message : 'network error')
      })

    if (!res.ok) {
      return { success: false, data: null, error: 'invalid_grant' }
    }

    const data = await res.json<{ access_token: string; refresh_token: string }>()

    // JWT をデコードしてユーザー情報（id / email）を取得
    const payload = await verify(data.access_token, jwtSecret, 'HS256')
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return { success: false, data: null, error: 'invalid token payload' }
    }

    return {
      success: true,
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: { id: payload.sub, email: payload.email as string },
      },
      error: null,
    }
  }
}
