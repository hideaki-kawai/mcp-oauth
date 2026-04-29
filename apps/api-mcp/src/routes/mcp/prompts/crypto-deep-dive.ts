/**
 * MCP Prompt: crypto_deep_dive（暗号通貨の深掘り分析）
 */

import { z } from 'zod'

export const cryptoDeepDiveName = 'crypto_deep_dive'

export const cryptoDeepDiveConfig = {
  title: '暗号通貨の深掘り分析',
  description: '指定したシンボル 1 銘柄について価格・市場・履歴を多角的に分析します',
  argsSchema: {
    symbol: z.string().describe('分析対象のシンボル（例: BTC, ETH）'),
  },
}

export function cryptoDeepDiveHandler(args: { symbol: string }) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: promptText(args.symbol),
        },
      },
    ],
  }
}

function promptText(symbol: string) {
  return `以下を実行して、${symbol} について以下を分析してください。

1. \`get_crypto_price\` で ${symbol} の現在価格（USD）を取得
2. \`get_crypto_market\` で ${symbol} の 24h 変動率・時価総額・出来高・ATH を取得
3. \`get_crypto_history\` で ${symbol} の直近 7 日分の OHLC を取得
4. 取得結果から以下を分析:
   - 短期トレンド（直近 7 日の高値/安値・始値→終値の変化）
   - 24h の動き（変動率と出来高）
   - ATH からの乖離率
5. 「現状サマリー」「気になる点」「データから読み取れること」の 3 セクションで報告`
} 