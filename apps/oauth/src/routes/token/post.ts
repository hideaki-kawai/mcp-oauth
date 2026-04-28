/**
 * POST /token
 *
 * OAuth 2.1 §3.2: application/x-www-form-urlencoded で受ける。
 * grant_type で 2 系統に分岐:
 *   - authorization_code: 初回トークン取得
 *   - refresh_token:      Rotation（更新）
 *
 * エラー形式は RFC 6749 §5.2:
 *   { "error": "invalid_grant", "error_description": "..." }
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { tokenErrorSchema, tokenRequestSchema, tokenResponseSchema } from '../../schemas/dto'
import type { AppEnv } from '../../types'
import { TokenService } from './service'

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['token'],
    summary: 'トークン発行・更新',
    description:
      'grant_type=authorization_code でアクセストークン+リフレッシュトークン発行、' +
      'grant_type=refresh_token で Rotation。',
    responses: {
      200: {
        description: 'トークン発行成功',
        content: { 'application/json': { schema: resolver(tokenResponseSchema) } },
      },
      400: {
        description: 'invalid_request / invalid_grant 等',
        content: { 'application/json': { schema: resolver(tokenErrorSchema) } },
      },
    },
  }),
  validator('form', tokenRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'invalid_request',
          error_description: result.error
            .map((issue) => {
              const path = (issue.path ?? [])
                .map((p) => (typeof p === 'object' ? p.key : p))
                .join('.')
              return path ? `${path}: ${issue.message}` : issue.message
            })
            .join(', '),
        },
        400,
      )
    }
  }),
  async (c) => {
    const body = c.req.valid('form')

    // grant_type が authorization_code か refresh_token かで処理を分岐する。
    // authorization_code: ユーザー認可後に受け取った認可コードを検証し、初回のトークンセットを発行する。
    // refresh_token: 既存のリフレッシュトークンで新しいトークンセットに差し替える（Rotation）。
    // 両者は入力パラメータも検証ロジックも異なるため、Service メソッドを分けている。
    if (body.grant_type === 'authorization_code') {
      const result = await TokenService.exchangeAuthorizationCode(
        c.env.DB_OAUTH,
        {
          code: body.code,
          redirectUri: body.redirect_uri,
          clientId: body.client_id,
          codeVerifier: body.code_verifier,
        },
        c.env.JWT_SECRET,
      )

      if (!result.success) {
        return c.json(
          { error: result.errorCode ?? 'invalid_request', error_description: result.error },
          400,
        )
      }
      return c.json(result.data, 200)
    }

    // ここに到達するのは grant_type=refresh_token のみ（zod の union で 2 種に限定済み）
    const result = await TokenService.refresh(
      c.env.DB_OAUTH,
      { refreshToken: body.refresh_token, clientId: body.client_id },
      c.env.JWT_SECRET,
    )

    if (!result.success) {
      return c.json(
        { error: result.errorCode ?? 'invalid_request', error_description: result.error },
        400,
      )
    }
    return c.json(result.data, 200)
  },
)

export default route
