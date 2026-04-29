/**
 * GET /api/fx/convert?amount=100&from=USD&to=JPY
 *
 * 金額を別通貨に換算する。
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { FxDomain } from '../../../../domains/fx'
import { convertCurrencyQuerySchema, convertedAmountSchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['fx'],
    summary: '通貨換算',
    responses: {
      200: {
        description: '換算結果',
        content: { 'application/json': { schema: resolver(convertedAmountSchema) } },
      },
    },
  }),
  validator('query', convertCurrencyQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_query', issues: result.error }, 400)
    }
  }),
  async (c) => {
    const { amount, from, to } = c.req.valid('query')
    const data = await FxDomain.convert({ amount, from, to })
    return c.json(data)
  }
)

export default route
