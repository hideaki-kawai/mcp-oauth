/**
 * MCP Tool: get_crypto_history
 */

import { z } from 'zod'
import { CryptoDomain } from '../../../domains/crypto'

export const getCryptoHistoryName = 'get_crypto_history'

export const getCryptoHistoryConfig = {
  title: '暗号通貨の OHLC 履歴',
  description: '過去 N 日分のローソク足データ（OHLC）を取得',
  inputSchema: {
    symbol: z.string().describe('暗号通貨シンボル（例: BTC）'),
    vsCurrency: z.string().default('usd'),
    days: z
      .enum(['1', '7', '14', '30', '90', '180', '365'])
      .default('7')
      .describe('期間（日）。CoinGecko 仕様で 1/7/14/30/90/180/365 のみ'),
  },
}

export async function getCryptoHistoryHandler(input: {
  symbol: string
  vsCurrency: string
  days: '1' | '7' | '14' | '30' | '90' | '180' | '365'
}) {
  const result = await CryptoDomain.getHistory(input)

  const summary =
    result.candles.length > 0
      ? (() => {
          const first = result.candles[0]
          const last = result.candles[result.candles.length - 1]
          const change = ((last.close - first.open) / first.open) * 100
          return `${result.symbol} 直近 ${result.days} 日: 始値 ${first.open} → 終値 ${last.close}（${change.toFixed(2)}%）/ ${result.candles.length} ローソク`
        })()
      : `${result.symbol} データなし`

  return {
    content: [{ type: 'text' as const, text: summary }],
    structuredContent: result,
  }
}
