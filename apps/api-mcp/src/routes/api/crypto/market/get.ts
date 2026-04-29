/**
 * GET /api/crypto/market?symbol=BTC&vsCurrency=usd
 *
 * 時価総額・24h 変動率など包括的な市場データを返す。
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { CryptoDomain } from '../../../../domains/crypto'
import { cryptoMarketSchema, getCryptoMarketQuerySchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['crypto'],
    summary: '暗号通貨の市場データ',
    responses: {
      200: {
        description: '暗号通貨の市場データ',
        content: { 'application/json': { schema: resolver(cryptoMarketSchema) } },
      },
    },
  }),
  validator('query', getCryptoMarketQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_query', issues: result.error }, 400)
    }
  }),
  async (c) => {
    const { symbol, vsCurrency } = c.req.valid('query')
    const data = await CryptoDomain.getMarket({ symbol, vsCurrency })
    return c.json(data)
  }
)

export default route
