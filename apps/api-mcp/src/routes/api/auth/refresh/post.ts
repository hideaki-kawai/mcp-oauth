/**
 * POST /api/auth/refresh — アクセストークン更新（BFF）
 *
 * httpOnly Cookie のリフレッシュトークンを使ってアクセストークンを更新する。
 * SPA は 5 分ごと（またはリクエスト失敗時）にここを呼ぶ。
 */

import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { describeRoute, resolver } from 'hono-openapi'
import { API_MCP_COOKIES, API_MCP_PATHS } from '@mcp-oauth/constants'
import { authRefreshResponseSchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'
import { AuthRefreshService } from './service'

const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['auth'],
    summary: 'アクセストークン更新（BFF）',
    description: 'httpOnly Cookie のリフレッシュトークンを使ってアクセストークンを更新する',
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: resolver(authRefreshResponseSchema) } },
      },
      401: { description: '未認証' },
    },
  }),
  async (c) => {
    const refreshToken = getCookie(c, API_MCP_COOKIES.REFRESH_TOKEN)
    if (!refreshToken) {
      return c.json({ error: 'no_refresh_token' }, 401)
    }

    const result = await AuthRefreshService.refresh(
      c.env.OAUTH_SERVICE,
      c.env.JWT_SECRET,
      refreshToken,
      c.env.OAUTH_INTERNAL_URL
    )

    if (!result.success) {
      // リフレッシュ失敗時は無効な Cookie を削除して再ログインを促す
      deleteCookie(c, API_MCP_COOKIES.REFRESH_TOKEN, { path: '/api/auth' })
      return c.json({ error: result.error ?? 'invalid_grant' }, 401)
    }

    setCookie(c, API_MCP_COOKIES.REFRESH_TOKEN, result.data.refreshToken, {
      httpOnly: true,
      secure: c.env.ENVIRONMENT === 'production',
      path: API_MCP_PATHS.AUTH,
      sameSite: 'Strict',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })

    return c.json({
      access_token: result.data.accessToken,
      user: result.data.user,
    })
  }
)

export default route
