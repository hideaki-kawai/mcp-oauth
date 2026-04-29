/**
 * MCP Tool: get_crypto_market
 */

import { z } from 'zod'
import { CryptoDomain } from '../../../domains/crypto'

export const getCryptoMarketName = 'get_crypto_market'

export const getCryptoMarketConfig = {
  title: '暗号通貨の市場データ',
  description: '時価総額・24h 変動率・最高値などの市場データを取得',
  inputSchema: {
    symbol: z.string().describe('暗号通貨シンボル（例: BTC）'),
    vsCurrency: z.string().default('usd'),
  },
}

export async function getCryptoMarketHandler(input: { symbol: string; vsCurrency: string }) {
  const result = await CryptoDomain.getMarket(input)

  const lines = [
    `${result.symbol} 市場データ（${result.vsCurrency.toUpperCase()} 建て）:`,
    `  現在価格: ${result.price}`,
    `  時価総額: ${result.marketCap ?? 'N/A'}`,
    `  24h 出来高: ${result.totalVolume24h ?? 'N/A'}`,
    `  24h 変動率: ${result.priceChangePercent24h !== null ? `${result.priceChangePercent24h.toFixed(2)}%` : 'N/A'}`,
    `  24h 高値/安値: ${result.high24h ?? 'N/A'} / ${result.low24h ?? 'N/A'}`,
    `  ATH: ${result.ath ?? 'N/A'}${result.athDate ? `（${result.athDate}）` : ''}`,
  ]

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
    structuredContent: result,
  }
}
