/**
 * MCP Tool: get_crypto_price
 */

import { z } from 'zod'
import { CryptoDomain } from '../../../domains/crypto'

export const getCryptoPriceName = 'get_crypto_price'

export const getCryptoPriceConfig = {
  title: '暗号通貨の現在価格',
  description: '指定したシンボル（BTC, ETH 等）の現在価格を取得',
  inputSchema: {
    symbol: z.string().describe('暗号通貨シンボル（例: BTC, ETH）'),
    vsCurrency: z.string().default('usd').describe('価格表示通貨（例: usd, jpy）'),
  },
}

export async function getCryptoPriceHandler(input: {
  symbol: string
  vsCurrency: string
}) {
  const result = await CryptoDomain.getPrice(input)
  return {
    content: [
      {
        type: 'text' as const,
        text: `1 ${result.symbol} = ${result.price} ${result.vsCurrency.toUpperCase()}`,
      },
    ],
    structuredContent: result,
  }
}
