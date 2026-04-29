/**
 * POST /api/auth/logout — ログアウト（BFF）
 *
 * 1. httpOnly Cookie からリフレッシュトークンを取得
 * 2. OAuth サーバーの /revoke でDBのトークンを失効
 * 3. Cookie を削除してセッションを終了
 *
 * リフレッシュトークンが Cookie にない場合も 200 を返す（冪等）。
 */

import { Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { describeRoute, resolver } from 'hono-openapi'
import { API_MCP_COOKIES, API_MCP_PATHS } from '@mcp-oauth/constants'
import { authLogoutResponseSchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'
import { AuthLogoutService } from './service'

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['auth'],
    summary: 'ログアウト（BFF）',
    description: 'OAuth サーバーのリフレッシュトークンを失効させ、Cookie を削除する',
    responses: {
      200: {
        description: 'ログアウト成功',
        content: { 'application/json': { schema: resolver(authLogoutResponseSchema) } },
      },
    },
  }),
  async (c) => {
    const refreshToken = getCookie(c, API_MCP_COOKIES.REFRESH_TOKEN)

    // リフレッシュトークンが Cookie にない場合も 200 を返す（冪等）。
    if (refreshToken) {
      await AuthLogoutService.logout(c.env.OAUTH_SERVICE, refreshToken, c.env.OAUTH_INTERNAL_URL)
    }

    deleteCookie(c, API_MCP_COOKIES.REFRESH_TOKEN, { path: API_MCP_PATHS.AUTH })
    return c.json({ success: true as const })
  }
)

export default route
