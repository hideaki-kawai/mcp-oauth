/**
 * MCP ツール登録
 *
 * `McpServer` に 6 種類のツールを一括登録するヘルパー。
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  convertCurrencyConfig,
  convertCurrencyHandler,
  convertCurrencyName,
} from './convert-currency'
import {
  getCryptoHistoryConfig,
  getCryptoHistoryHandler,
  getCryptoHistoryName,
} from './get-crypto-history'
import {
  getCryptoMarketConfig,
  getCryptoMarketHandler,
  getCryptoMarketName,
} from './get-crypto-market'
import { getCryptoPriceConfig, getCryptoPriceHandler, getCryptoPriceName } from './get-crypto-price'
import { getFxHistoryConfig, getFxHistoryHandler, getFxHistoryName } from './get-fx-history'
import { getFxRateConfig, getFxRateHandler, getFxRateName } from './get-fx-rate'

export function registerTools(server: McpServer): void {
  server.registerTool(getFxRateName, getFxRateConfig, getFxRateHandler)
  server.registerTool(convertCurrencyName, convertCurrencyConfig, convertCurrencyHandler)
  server.registerTool(getFxHistoryName, getFxHistoryConfig, getFxHistoryHandler)
  server.registerTool(getCryptoPriceName, getCryptoPriceConfig, getCryptoPriceHandler)
  server.registerTool(getCryptoMarketName, getCryptoMarketConfig, getCryptoMarketHandler)
  server.registerTool(getCryptoHistoryName, getCryptoHistoryConfig, getCryptoHistoryHandler)
}
