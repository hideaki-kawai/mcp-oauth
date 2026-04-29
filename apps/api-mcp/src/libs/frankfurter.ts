/**
 * Frankfurter API ラッパー
 *
 * https://api.frankfurter.dev/v1/
 *   ECB（欧州中央銀行）の為替参照レートを返す。キー不要。
 *
 * このファイルは「外部 API を叩いて生データを返す」だけの最薄層。
 * 業務ロジックは `domains/fx` で行う。
 *
 * Result<T> は使わず例外で error 伝播する（呼び元の domain で try/catch）。
 */

import { z } from 'zod'

const BASE_URL = 'https://api.frankfurter.dev/v1'

// ─────────────────────────────────────────────────────────
// レスポンススキーマ（ランタイム検証）
// ─────────────────────────────────────────────────────────

const latestResponseSchema = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string(), // YYYY-MM-DD
  rates: z.record(z.string(), z.number()),
})

const timeseriesResponseSchema = z.object({
  amount: z.number(),
  base: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  rates: z.record(z.string(), z.record(z.string(), z.number())),
})

export type FrankfurterLatest = z.infer<typeof latestResponseSchema>
export type FrankfurterTimeseries = z.infer<typeof timeseriesResponseSchema>

// ─────────────────────────────────────────────────────────
// API 呼び出し
// ─────────────────────────────────────────────────────────

/**
 * 最新の為替レートを取得
 *   GET /v1/latest?base={base}&symbols={symbols.join(',')}
 *
 * @example getLatest('USD', ['JPY', 'EUR'])
 */
export async function getLatest(
  base: string,
  symbols: string[],
): Promise<FrankfurterLatest> {
  const url = new URL(`${BASE_URL}/latest`)
  url.searchParams.set('base', base)
  url.searchParams.set('symbols', symbols.join(','))

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Frankfurter /latest failed: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return latestResponseSchema.parse(json)
}

/**
 * 金額換算（任意の amount を base 通貨から symbols 通貨に変換）
 *   GET /v1/latest?amount={amount}&base={base}&symbols={symbols.join(',')}
 */
export async function convertAmount(
  amount: number,
  base: string,
  symbols: string[],
): Promise<FrankfurterLatest> {
  const url = new URL(`${BASE_URL}/latest`)
  url.searchParams.set('amount', String(amount))
  url.searchParams.set('base', base)
  url.searchParams.set('symbols', symbols.join(','))

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Frankfurter /latest failed: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return latestResponseSchema.parse(json)
}

/**
 * 期間指定の為替レート時系列を取得
 *   GET /v1/{startDate}..{endDate}?base={base}&symbols={symbols.join(',')}
 *
 * @param startDate YYYY-MM-DD
 * @param endDate   YYYY-MM-DD（省略可。省略時は最新まで）
 */
export async function getTimeseries(
  base: string,
  symbols: string[],
  startDate: string,
  endDate?: string,
): Promise<FrankfurterTimeseries> {
  const range = endDate ? `${startDate}..${endDate}` : `${startDate}..`
  const url = new URL(`${BASE_URL}/${range}`)
  url.searchParams.set('base', base)
  url.searchParams.set('symbols', symbols.join(','))

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Frankfurter timeseries failed: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return timeseriesResponseSchema.parse(json)
}
