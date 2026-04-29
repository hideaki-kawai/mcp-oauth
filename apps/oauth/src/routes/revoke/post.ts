/**
 * POST /revoke — リフレッシュトークン失効（RFC 7009）
 *
 * BFF のログアウト処理から Service Binding 経由で呼ばれる。
 * トークンが存在しない・既に失効済みでも 200 を返す（RFC 7009 §2.2）。
 */

import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../../types'
import { RevokeService } from './service'

const revokeRequestSchema = z.object({
  token: z.string().min(1),
})

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['token'],
    summary: 'リフレッシュトークン失効（RFC 7009）',
    description: 'トークンが存在しない・失効済みの場合も 200 を返す。',
    responses: {
      200: { description: '失効成功（or 既に失効済み）' },
      400: { description: 'token パラメータが不足' },
    },
  }),
  validator('form', revokeRequestSchema, (result, c) => {
    if (!result.success) return c.text('Bad Request', 400)
  }),
  async (c) => {
    const { token } = c.req.valid('form')
    await RevokeService.revoke(c.env.DB_OAUTH, token)
    return c.body(null, 200)
  }
)

export default route
