/**
 * MCP Prompt: daily_market_brief（今日のマーケット概況）
 *
 * ユーザーがスラッシュコマンドで明示的に発動する日本語テンプレ。
 * 内部で複数の Tool を順に呼ぶよう Claude に依頼するメッセージを返す。
 */

import { z } from 'zod'

export const dailyMarketBriefName = 'daily_market_brief'

export const dailyMarketBriefConfig = {
  title: '今日のマーケット概況',
  description: '主要な暗号通貨と為替の今日の状況をまとめます',
  argsSchema: {
    focusCurrency: z
      .string()
      .optional()
      .describe('重点的に見たい通貨ペア（例: USD/JPY）。未指定なら主要ペアのみ'),
  },
}

export function dailyMarketBriefHandler(args: { focusCurrency?: string }) {
  const focus = args.focusCurrency
    ? `\nまた特に「${args.focusCurrency}」のレートも合わせて取得してください。`
    : ''

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: promptText(focus),
        },
      },
    ],
  }
}

function promptText(focus: string) {
  return `以下を実行して、今日のマーケット概況を日本語でまとめてください。

1. \`get_crypto_price\` で BTC と ETH の現在価格を取得（vsCurrency=usd）
2. \`get_crypto_market\` で BTC の 24h 変動率・時価総額を取得
3. \`get_fx_rate\` で USD/JPY と EUR/USD の最新レートを取得${focus}
4. 取得した数値を整理し、目立つ動き・注目ポイントがあれば指摘
5. 全体を 5 行程度で簡潔に報告（数字は読みやすい桁区切りで）`
}
