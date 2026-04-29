/**
 * CryptoDomain — 暗号通貨の業務ロジック
 *
 * `libs/coingecko` を呼んで `schemas/dto/crypto` の型に整形する純粋関数。
 * MCP Tool / Web API どちらからもこの 1 箇所だけを呼ぶ。
 */

import * as coingecko from '../../libs/coingecko'
import type { CryptoHistory, CryptoMarket, CryptoPrice, OhlcPoint } from '../../schemas/dto'

type OhlcDays = '1' | '7' | '14' | '30' | '90' | '180' | '365'

export class CryptoDomain {
  /**
   * 現在価格を取得
   */
  static async getPrice(input: { symbol: string; vsCurrency: string }): Promise<CryptoPrice> {
    const id = coingecko.symbolToId(input.symbol)
    const vsCurrency = input.vsCurrency.toLowerCase()

    const raw = await coingecko.getSimplePrice([id], vsCurrency)
    const idData = pickProperty(raw, id)
    const price = pickNumber(idData, vsCurrency)
    if (price === null) {
      throw new Error(`price not found for ${input.symbol} in ${vsCurrency}`)
    }

    return {
      symbol: input.symbol.toUpperCase(),
      vsCurrency,
      price,
    }
  }

  /**
   * 市場データ（時価総額・24h 変動率など）
   */
  static async getMarket(input: { symbol: string; vsCurrency: string }): Promise<CryptoMarket> {
    const id = coingecko.symbolToId(input.symbol)
    const vsCurrency = input.vsCurrency.toLowerCase()

    const raw = await coingecko.getCoinById(id)
    const md = raw.market_data

    return {
      symbol: input.symbol.toUpperCase(),
      vsCurrency,
      price: pickNumber(md?.current_price, vsCurrency) ?? 0,
      marketCap: pickNumber(md?.market_cap, vsCurrency),
      totalVolume24h: pickNumber(md?.total_volume, vsCurrency),
      priceChangePercent24h:
        typeof md?.price_change_percentage_24h === 'number' ? md.price_change_percentage_24h : null,
      high24h: pickNumber(md?.high_24h, vsCurrency),
      low24h: pickNumber(md?.low_24h, vsCurrency),
      ath: pickNumber(md?.ath, vsCurrency),
      athDate: pickString(md?.ath_date, vsCurrency),
    }
  }

  /**
   * OHLC 履歴（ローソク足）
   */
  static async getHistory(input: {
    symbol: string
    vsCurrency: string
    days: OhlcDays
  }): Promise<CryptoHistory> {
    const id = coingecko.symbolToId(input.symbol)
    const vsCurrency = input.vsCurrency.toLowerCase()

    const raw = await coingecko.getCoinOhlc(id, vsCurrency, input.days)

    const candles: OhlcPoint[] = raw.map((row) => ({
      timestamp: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
    }))

    return {
      symbol: input.symbol.toUpperCase(),
      vsCurrency,
      days: input.days,
      candles,
    }
  }
}

// ─────────────────────────────────────────────────────────
// 型安全に動的キーで値を取り出すヘルパー（as キャスト不使用）
// ─────────────────────────────────────────────────────────

/**
 * 固定キー型のオブジェクトから動的なキーで値を取り出す。
 * 該当しなければ undefined を返す（呼び元で null fallback する）。
 *
 * SDK の typed Record（CurrentPrice 等）はインデックスシグネチャを持たないため
 * `obj[key]` で直接アクセスできない。Object.entries で全列挙して照合する。
 */
function pickProperty(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object') return undefined
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) return v
  }
  return undefined
}

function pickNumber(obj: unknown, key: string): number | null {
  const v = pickProperty(obj, key)
  return typeof v === 'number' ? v : null
}

function pickString(obj: unknown, key: string): string | null {
  const v = pickProperty(obj, key)
  return typeof v === 'string' ? v : null
}
