/**
 * POST /api/auth/token — 認可コード交換（BFF）
 *
 * SPA から受け取った認可コードを OAuth サーバーへ転送してトークンを取得する。
 * アクセストークンは JSON で返し、リフレッシュトークンは httpOnly Cookie に格納する。
 */

import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { API_MCP_COOKIES, API_MCP_PATHS } from '@mcp-oauth/constants'
import { authTokenRequestSchema, authTokenResponseSchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'
import { AuthTokenService } from './service'

/** リフレッシュトークン Cookie の有効期限（30 日） */
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['auth'],
    summary: 'トークン交換（BFF）',
    description:
      '認可コードをアクセストークンに交換し、リフレッシュトークンを httpOnly Cookie にセットする',
    responses: {
      200: {
        description: 'トークン取得成功',
        content: { 'application/json': { schema: resolver(authTokenResponseSchema) } },
      },
      400: { description: '無効なリクエスト' },
    },
  }),
  validator('json', authTokenRequestSchema, (result, c) => {
    if (!result.success) return c.json({ error: 'invalid_request' }, 400)
  }),
  async (c) => {
    const { code, code_verifier, redirect_uri } = c.req.valid('json')

    const result = await AuthTokenService.exchangeCode(c.env.OAUTH_SERVICE, {
      code,
      codeVerifier: code_verifier,
      redirectUri: redirect_uri,
    })

    if (!result.success) {
      return c.json({ error: result.error ?? 'invalid_grant' }, 400)
    }

    setCookie(c, API_MCP_COOKIES.REFRESH_TOKEN, result.data.refreshToken, {
      httpOnly: true,
      secure: c.env.ENVIRONMENT === 'production',
      path: API_MCP_PATHS.AUTH,
      sameSite: 'Strict',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })

    return c.json({ access_token: result.data.accessToken })
  }
)

export default route
