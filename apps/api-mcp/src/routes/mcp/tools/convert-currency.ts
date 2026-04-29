/**
 * MCP Tool: convert_currency
 */

import { z } from 'zod'
import { FxDomain } from '../../../domains/fx'

export const convertCurrencyName = 'convert_currency'

export const convertCurrencyConfig = {
  title: '通貨換算',
  description: '金額を別通貨に換算（例: 100 USD は何 JPY？）',
  inputSchema: {
    amount: z.number().positive().describe('換算したい金額'),
    from: z.string().length(3).describe('元の通貨コード（例: USD）'),
    to: z.string().length(3).describe('変換先通貨コード（例: JPY）'),
  },
}

export async function convertCurrencyHandler(input: {
  amount: number
  from: string
  to: string
}) {
  const result = await FxDomain.convert(input)
  return {
    content: [
      {
        type: 'text' as const,
        text: `${result.amount} ${result.from} = ${result.converted} ${result.to}（レート 1 ${result.from} = ${result.rate} ${result.to} / ${result.asOf} 時点）`,
      },
    ],
    structuredContent: result,
  }
}
