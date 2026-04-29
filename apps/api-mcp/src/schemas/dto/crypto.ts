/**
 * 暗号通貨（Crypto）の DTO スキーマ
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────
// 共通
// ─────────────────────────────────────────────────────────

/** 暗号通貨シンボル（BTC / ETH / ...） */
const cryptoSymbolSchema = z.string().min(2).max(10)
/** 法定通貨コード（usd / jpy / eur など） */
const vsCurrencySchema = z
  .string()
  .min(3)
  .max(4)
  .transform((v) => v.toLowerCase())

const ohlcDaysSchema = z.enum(['1', '7', '14', '30', '90', '180', '365'])

// ─────────────────────────────────────────────────────────
// Web API のクエリ
// ─────────────────────────────────────────────────────────

export const getCryptoPriceQuerySchema = z.object({
  symbol: cryptoSymbolSchema.describe('暗号通貨シンボル（例: BTC, ETH）'),
  vsCurrency: vsCurrencySchema.default('usd'),
})

export const getCryptoMarketQuerySchema = z.object({
  symbol: cryptoSymbolSchema,
  vsCurrency: vsCurrencySchema.default('usd'),
})

export const getCryptoHistoryQuerySchema = z.object({
  symbol: cryptoSymbolSchema,
  vsCurrency: vsCurrencySchema.default('usd'),
  days: ohlcDaysSchema.default('7'),
})

// ─────────────────────────────────────────────────────────
// レスポンス
// ─────────────────────────────────────────────────────────

export const cryptoPriceSchema = z.object({
  symbol: z.string(),
  vsCurrency: z.string(),
  price: z.number(),
})

export const cryptoMarketSchema = z.object({
  symbol: z.string(),
  vsCurrency: z.string(),
  price: z.number(),
  marketCap: z.number().nullable(),
  totalVolume24h: z.number().nullable(),
  /** 過去 24h の変動率（%） */
  priceChangePercent24h: z.number().nullable(),
  high24h: z.number().nullable(),
  low24h: z.number().nullable(),
  /** ATH（過去最高値） */
  ath: z.number().nullable(),
  athDate: z.string().nullable(),
})

export const ohlcPointSchema = z.object({
  /** Unix ミリ秒 */
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
})

export const cryptoHistorySchema = z.object({
  symbol: z.string(),
  vsCurrency: z.string(),
  days: z.string(),
  candles: z.array(ohlcPointSchema),
})

export type CryptoPrice = z.infer<typeof cryptoPriceSchema>
export type CryptoMarket = z.infer<typeof cryptoMarketSchema>
export type CryptoHistory = z.infer<typeof cryptoHistorySchema>
export type OhlcPoint = z.infer<typeof ohlcPointSchema>
