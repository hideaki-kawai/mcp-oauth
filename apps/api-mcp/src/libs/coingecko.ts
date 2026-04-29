/**
 * CoinGecko API ラッパー
 *
 * 公式 SDK `@coingecko/coingecko-typescript` を使用。
 * 無料公開 API なので APIKey 不要（new Coingecko({}) で初期化可能）。
 *
 * このファイルは「外部 API を叩いて生データを返す」だけの最薄層。
 * 業務ロジックは `domains/crypto` で行う。
 *
 * シンボル → ID マッピング:
 *   CoinGecko のエンドポイントは "bitcoin" / "ethereum" 等の id を要求するが、
 *   ユーザーは "BTC" / "ETH" のシンボルで叩きたいので変換テーブルを内部に持つ。
 *   学習目的なので主要 10 銘柄のみ対応。実運用するなら /search/coins API 経由がよい。
 */

import Coingecko from '@coingecko/coingecko-typescript'

/**
 * SDK インスタンス（モジュール内 lazy init）
 *
 * Workers の環境では複数リクエストで使い回す（通常の Workers 動作）。
 */
let _client: Coingecko | null = null
function getClient(): Coingecko {
  if (_client === null) {
    _client = new Coingecko({
      // 無料公開エンドポイント（api.coingecko.com）を使う
      environment: 'demo',
      // x-cg-demo-api-key ヘッダーを明示的に省略（null を指定すると SDK が送信しない）
      defaultHeaders: { 'x-cg-demo-api-key': null },
    })
  }
  return _client
}

// ─────────────────────────────────────────────────────────
// シンボル → CoinGecko ID マッピング
// ─────────────────────────────────────────────────────────

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  USDC: 'usd-coin',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
}

/** シンボル（BTC 等）から CoinGecko ID（bitcoin 等）に変換。未対応なら例外 */
export function symbolToId(symbol: string): string {
  const id = SYMBOL_TO_ID[symbol.toUpperCase()]
  if (!id) {
    throw new Error(
      `unsupported crypto symbol: ${symbol}. Supported: ${Object.keys(SYMBOL_TO_ID).join(', ')}`,
    )
  }
  return id
}

// ─────────────────────────────────────────────────────────
// API 呼び出し
// ─────────────────────────────────────────────────────────

/**
 * 簡易価格取得
 *   GET /simple/price?ids={ids}&vs_currencies={vsCurrency}
 */
export async function getSimplePrice(ids: string[], vsCurrency: string) {
  return getClient().simple.price.get({
    ids: ids.join(','),
    vs_currencies: vsCurrency,
  })
}

/**
 * コイン詳細（時価総額・24h 変動率など）
 *   GET /coins/{id}
 */
export async function getCoinById(id: string) {
  return getClient().coins.getID(id, {
    localization: false,
    tickers: false,
    market_data: true,
    community_data: false,
    developer_data: false,
    sparkline: false,
  })
}

/** CoinGecko OHLC API が許可する days 値 */
export type OhlcDays = '1' | '7' | '14' | '30' | '90' | '180' | '365'

/**
 * OHLC（ローソク足データ）
 *   GET /coins/{id}/ohlc?vs_currency={vsCurrency}&days={days}
 *
 * @returns Array<[timestamp, open, high, low, close]>
 */
export async function getCoinOhlc(id: string, vsCurrency: string, days: OhlcDays) {
  return getClient().coins.ohlc.get(id, {
    vs_currency: vsCurrency,
    days,
  })
}
