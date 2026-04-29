/**
 * MCP Tool: get_fx_history
 */

import { z } from 'zod'
import { FxDomain } from '../../../domains/fx'

export const getFxHistoryName = 'get_fx_history'

export const getFxHistoryConfig = {
  title: '為替履歴',
  description: '過去 N 日分の為替推移を取得（最大 365 日）',
  inputSchema: {
    from: z.string().length(3),
    to: z.string().length(3),
    days: z.number().int().min(1).max(365).default(7),
  },
}

export async function getFxHistoryHandler(input: {
  from: string
  to: string
  days: number
}) {
  const result = await FxDomain.getHistory(input)

  const summary =
    result.points.length > 0
      ? `${result.from}/${result.to} 直近 ${result.points.length} 営業日: ` +
        `初値 ${result.points[0].rate}（${result.points[0].date}）→ ` +
        `最新 ${result.points[result.points.length - 1].rate}（${result.points[result.points.length - 1].date}）`
      : `${result.from}/${result.to} データなし`

  return {
    content: [{ type: 'text' as const, text: summary }],
    structuredContent: result,
  }
}
