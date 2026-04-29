/**
 * FxDomain — 為替（FX）の業務ロジック
 *
 * `libs/frankfurter` を呼んで、`schemas/dto/fx` の型に整形する純粋関数。
 * MCP Tool / Web API どちらからもこの 1 箇所だけを呼ぶ。
 *
 * Result<T> は使わず例外で error 伝播（呼び元の Controller / Tool handler で処理）。
 */

import { daysAgoIso, todayIso } from '@mcp-oauth/utils'
import * as frankfurter from '../../libs/frankfurter'
import type { ConvertedAmount, FxHistory, FxRate } from '../../schemas/dto'

export class FxDomain {
  /**
   * 2 通貨間の最新レートを取得
   *
   * 注: from === to の場合 Frankfurter は base と symbols が同じ通貨だとエラーを返すので、
   * その場合は API を呼ばずに 1.0 を返す。
   */
  static async getRate(input: { from: string; to: string }): Promise<FxRate> {
    const from = input.from.toUpperCase()
    const to = input.to.toUpperCase()

    if (from === to) {
      return { rate: 1, from, to, asOf: todayIso() }
    }

    const raw = await frankfurter.getLatest(from, [to])
    const rate = raw.rates[to]
    if (rate === undefined) {
      throw new Error(`rate not found for ${from} → ${to}`)
    }
    return { rate, from, to, asOf: raw.date }
  }

  /**
   * 金額を 1 通貨から別通貨に換算
   */
  static async convert(input: {
    amount: number
    from: string
    to: string
  }): Promise<ConvertedAmount> {
    const from = input.from.toUpperCase()
    const to = input.to.toUpperCase()

    if (from === to) {
      return {
        amount: input.amount,
        converted: input.amount,
        rate: 1,
        from,
        to,
        asOf: todayIso(),
      }
    }

    const raw = await frankfurter.convertAmount(input.amount, from, [to])
    const converted = raw.rates[to]
    if (converted === undefined) {
      throw new Error(`rate not found for ${from} → ${to}`)
    }
    return {
      amount: input.amount,
      converted,
      rate: converted / input.amount,
      from,
      to,
      asOf: raw.date,
    }
  }

  /**
   * 期間指定で為替推移を取得（過去 days 日分）
   */
  static async getHistory(input: { from: string; to: string; days: number }): Promise<FxHistory> {
    const from = input.from.toUpperCase()
    const to = input.to.toUpperCase()

    const endDate = todayIso()
    const startDate = daysAgoIso(input.days)

    const raw = await frankfurter.getTimeseries(from, [to], startDate, endDate)

    const points = Object.entries(raw.rates)
      .map(([date, rates]) => ({ date, rate: rates[to] }))
      .filter((p): p is { date: string; rate: number } => p.rate !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      from,
      to,
      startDate: raw.start_date,
      endDate: raw.end_date,
      points,
    }
  }
}
