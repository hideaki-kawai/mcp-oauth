/**
 * POST /register — Dynamic Client Registration（RFC 7591）
 *
 * Claude（MCP クライアント）が自分自身を OAuth サーバーに動的登録するためのエンドポイント。
 * web-client は事前登録（シーダー）なのでこれを叩かない。
 *
 * フロー:
 *   1. validator が zod スキーマでリクエスト検証（不正なら 400 を即返す）
 *   2. RegisterService.register に委譲
 *   3. 成功時: 201 Created + 登録済みメタデータ
 *   4. 失敗時: 400 + RFC 7591 §3.2.2 形式のエラー
 *
 * api-mcp と同じ describeRoute + resolver + validator のパターンを使う。
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { oauthErrorSchema, registerRequestSchema, registerResponseSchema } from '../../schemas/dto'
import type { AppEnv } from '../../types'
import { RegisterService } from './service'

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['dcr'],
    summary: 'Dynamic Client Registration',
    description:
      'Claude などの MCP クライアントが自身を動的に登録する。web-client は事前登録（シーダー）。',
    responses: {
      201: {
        description: '登録成功',
        content: {
          'application/json': { schema: resolver(registerResponseSchema) },
        },
      },
      400: {
        description: 'invalid_client_metadata',
        content: {
          'application/json': { schema: resolver(oauthErrorSchema) },
        },
      },
    },
  }),
  // バリデーション失敗時は RFC 7591 §3.2.2 形式のエラーで 400 を返す
  // hook の result.error は Standard Schema の Issue[]（zod の error.issues と同等）
  validator('json', registerRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'invalid_client_metadata',
          error_description: result.error
            .map((issue) => {
              const path = (issue.path ?? [])
                .map((p) => (typeof p === 'object' ? p.key : p))
                .join('.')
              return path ? `${path}: ${issue.message}` : issue.message
            })
            .join(', '),
        },
        400
      )
    }
  }),
  async (c) => {
    const body = c.req.valid('json')

    const result = await RegisterService.register(c.env.DB_OAUTH, body)
    if (!result.success) {
      return c.json(
        {
          error: 'invalid_client_metadata',
          error_description: result.error,
        },
        400
      )
    }

    return c.json(result.data, 201)
  }
)

export default route
