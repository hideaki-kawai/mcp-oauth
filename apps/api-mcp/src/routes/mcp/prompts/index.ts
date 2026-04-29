/**
 * MCP Prompt 登録
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  cryptoDeepDiveConfig,
  cryptoDeepDiveHandler,
  cryptoDeepDiveName,
} from './crypto-deep-dive'
import {
  dailyMarketBriefConfig,
  dailyMarketBriefHandler,
  dailyMarketBriefName,
} from './daily-market-brief'

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    dailyMarketBriefName,
    dailyMarketBriefConfig,
    dailyMarketBriefHandler,
  )
  server.registerPrompt(cryptoDeepDiveName, cryptoDeepDiveConfig, cryptoDeepDiveHandler)
}
