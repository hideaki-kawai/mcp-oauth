/**
 * 為替（FX）の DTO スキーマ
 *
 * domain の戻り値型 = Web API のレスポンス = MCP ツールの structuredContent
 * すべてここで定義した zod スキーマから派生する（単一の真実）。
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────
// Web API のクエリ
// ─────────────────────────────────────────────────────────

/** 通貨コード（ISO 4217 を想定。3 文字英大文字） */
const currencyCodeSchema = z.string().length(3).regex(/^[A-Za-z]{3}$/, '3 文字の英字')

export const getFxRateQuerySchema = z.object({
  from: currencyCodeSchema.describe('変換元通貨コード（例: USD）'),
  to: currencyCodeSchema.describe('変換先通貨コード（例: JPY）'),
})

export const convertCurrencyQuerySchema = z.object({
  amount: z.coerce.number().positive(),
  from: currencyCodeSchema,
  to: currencyCodeSchema,
})

export const getFxHistoryQuerySchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  /** 期間（日数）— 1〜365 */
  days: z.coerce.number().int().min(1).max(365).default(7),
})

// ─────────────────────────────────────────────────────────
// レスポンス
// ─────────────────────────────────────────────────────────

export const fxRateSchema = z.object({
  rate: z.number().describe('1 単位の from を to に換算したレート'),
  from: z.string(),
  to: z.string(),
  asOf: z.string().describe('レート基準日（YYYY-MM-DD）'),
})

export const convertedAmountSchema = z.object({
  amount: z.number().describe('入力金額'),
  converted: z.number().describe('換算後金額'),
  rate: z.number(),
  from: z.string(),
  to: z.string(),
  asOf: z.string(),
})

export const fxHistoryPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  rate: z.number(),
})

export const fxHistorySchema = z.object({
  from: z.string(),
  to: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  points: z.array(fxHistoryPointSchema),
})

export type FxRate = z.infer<typeof fxRateSchema>
export type ConvertedAmount = z.infer<typeof convertedAmountSchema>
export type FxHistory = z.infer<typeof fxHistorySchema>
