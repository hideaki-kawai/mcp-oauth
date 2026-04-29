/**
 * MCP Tool: get_fx_rate
 *
 * domain を呼んで MCP 形式（content[]）に整形するだけの薄い層。
 */

import { z } from 'zod'
import { FxDomain } from '../../../domains/fx'

export const getFxRateName = 'get_fx_rate'

export const getFxRateConfig = {
  title: '為替レート取得',
  description: '指定した 2 通貨間の最新為替レートを取得（ECB 公式データ）',
  inputSchema: {
    from: z.string().length(3).describe('変換元通貨コード（例: USD）'),
    to: z.string().length(3).describe('変換先通貨コード（例: JPY）'),
  },
}

export async function getFxRateHandler({ from, to }: { from: string; to: string }) {
  const result = await FxDomain.getRate({ from, to })
  return {
    content: [
      {
        type: 'text' as const,
        text: `1 ${result.from} = ${result.rate} ${result.to}（${result.asOf} 時点・ECB 参照レート）`,
      },
    ],
    structuredContent: result,
  }
}
