/**
 * GET /api/crypto/history?symbol=BTC&vsCurrency=usd&days=7
 *
 * OHLC（ローソク足）データを返す。CoinGecko の許可する days 値: 1/7/14/30/90/180/365
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { CryptoDomain } from '../../../../domains/crypto'
import { cryptoHistorySchema, getCryptoHistoryQuerySchema } from '../../../../schemas/dto'
import type { AppEnv } from '../../../../types'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['crypto'],
    summary: '暗号通貨の OHLC 履歴',
    responses: {
      200: {
        description: '暗号通貨の OHLC 履歴',
        content: { 'application/json': { schema: resolver(cryptoHistorySchema) } },
      },
    },
  }),
  validator('query', getCryptoHistoryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_query', issues: result.error }, 400)
    }
  }),
  async (c) => {
    const { symbol, vsCurrency, days } = c.req.valid('query')
    const data = await CryptoDomain.getHistory({ symbol, vsCurrency, days })
    return c.json(data)
  }
)

export default route
