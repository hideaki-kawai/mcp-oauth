import { describe, expect, it } from 'vitest'
import { cryptoDeepDiveHandler } from './crypto-deep-dive'
import { dailyMarketBriefHandler } from './daily-market-brief'

describe('dailyMarketBriefHandler', () => {
  it('focusCurrency なしでも有効な日本語メッセージを返す', () => {
    const result = dailyMarketBriefHandler({})
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('user')
    const text = result.messages[0].content.text
    expect(text).toContain('get_crypto_price')
    expect(text).toContain('get_fx_rate')
    expect(text).toContain('USD/JPY')
  })

  it('focusCurrency 指定時は本文に含まれる', () => {
    const result = dailyMarketBriefHandler({ focusCurrency: 'GBP/JPY' })
    expect(result.messages[0].content.text).toContain('GBP/JPY')
  })
})

describe('cryptoDeepDiveHandler', () => {
  it('シンボルが本文に挿入される', () => {
    const result = cryptoDeepDiveHandler({ symbol: 'BTC' })
    const text = result.messages[0].content.text
    expect(text).toContain('BTC')
    expect(text).toContain('get_crypto_price')
    expect(text).toContain('get_crypto_market')
    expect(text).toContain('get_crypto_history')
  })
})
