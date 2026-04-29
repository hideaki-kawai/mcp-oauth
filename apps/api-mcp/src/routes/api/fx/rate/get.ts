/**
 * GET /api/fx/rate?from=USD&to=JPY
 *
 * 2 通貨間の最新レートを返す。Web SPA からも MCP Tool（get_fx_rate）からも
 * 同じ FxDomain.getRate() を呼ぶ。
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { FxDomain } from '../../../../domains/fx'
import { fxRateSchema, getFxRateQuerySchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['fx'],
    summary: '為替レート取得',
    responses: {
      200: {
        description: '為替レート',
        content: { 'application/json': { schema: resolver(fxRateSchema) } },
      },
    },
  }),
  validator('query', getFxRateQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_query', issues: result.error }, 400)
    }
  }),
  async (c) => {
    const { from, to } = c.req.valid('query')
    const data = await FxDomain.getRate({ from, to })
    return c.json(data)
  },
)

export default route
