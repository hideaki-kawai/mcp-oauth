/**
 * GET /api/fx/history?from=USD&to=JPY&days=7
 *
 * 過去 N 日分の為替推移を返す。
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { FxDomain } from '../../../../domains/fx'
import { fxHistorySchema, getFxHistoryQuerySchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['fx'],
    summary: '為替履歴',
    responses: {
      200: {
        description: '為替履歴',
        content: { 'application/json': { schema: resolver(fxHistorySchema) } },
      },
    },
  }),
  validator('query', getFxHistoryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_query', issues: result.error }, 400)
    }
  }),
  async (c) => {
    const { from, to, days } = c.req.valid('query')
    const data = await FxDomain.getHistory({ from, to, days })
    return c.json(data)
  }
)

export default route
