/**
 * GET /api/crypto/price?symbol=BTC&vsCurrency=usd
 *
 * 暗号通貨の現在価格を返す。
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { CryptoDomain } from '../../../../domains/crypto'
import { cryptoPriceSchema, getCryptoPriceQuerySchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['crypto'],
    summary: '暗号通貨の現在価格',
    responses: {
      200: {
        description: '暗号通貨の現在価格',
        content: { 'application/json': { schema: resolver(cryptoPriceSchema) } },
      },
    },
  }),
  validator('query', getCryptoPriceQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_query', issues: result.error }, 400)
    }
  }),
  async (c) => {
    const { symbol, vsCurrency } = c.req.valid('query')
    const data = await CryptoDomain.getPrice({ symbol, vsCurrency })
    return c.json(data)
  }
)

export default route
