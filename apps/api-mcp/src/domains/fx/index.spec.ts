import { afterEach, describe, expect, it, vi } from 'vitest'
import * as frankfurter from '../../libs/frankfurter'
import { FxDomain } from './index'

afterEach(() => vi.restoreAllMocks())

describe('FxDomain.getRate', () => {
  it('Frankfurter の戻り値を整形して返す', async () => {
    vi.spyOn(frankfurter, 'getLatest').mockResolvedValue({
      amount: 1,
      base: 'USD',
      date: '2026-04-29',
      rates: { JPY: 150.23 },
    })

    const result = await FxDomain.getRate({ from: 'USD', to: 'JPY' })

    expect(result).toEqual({
      rate: 150.23,
      from: 'USD',
      to: 'JPY',
      asOf: '2026-04-29',
    })
  })

  it('from === to のときは API を叩かず 1.0 を返す', async () => {
    const spy = vi.spyOn(frankfurter, 'getLatest')

    const result = await FxDomain.getRate({ from: 'USD', to: 'USD' })

    expect(result.rate).toBe(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('小文字入力でも大文字に正規化する', async () => {
    vi.spyOn(frankfurter, 'getLatest').mockResolvedValue({
      amount: 1,
      base: 'USD',
      date: '2026-04-29',
      rates: { JPY: 150 },
    })

    const result = await FxDomain.getRate({ from: 'usd', to: 'jpy' })
    expect(result.from).toBe('USD')
    expect(result.to).toBe('JPY')
  })
})

describe('FxDomain.convert', () => {
  it('金額換算とレートを返す', async () => {
    vi.spyOn(frankfurter, 'convertAmount').mockResolvedValue({
      amount: 100,
      base: 'USD',
      date: '2026-04-29',
      rates: { JPY: 15023 },
    })

    const result = await FxDomain.convert({ amount: 100, from: 'USD', to: 'JPY' })

    expect(result.amount).toBe(100)
    expect(result.converted).toBe(15023)
    expect(result.rate).toBe(150.23)
  })

  it('同一通貨は API を叩かず amount をそのまま返す', async () => {
    const spy = vi.spyOn(frankfurter, 'convertAmount')
    const result = await FxDomain.convert({ amount: 100, from: 'USD', to: 'USD' })
    expect(result.converted).toBe(100)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('FxDomain.getHistory', () => {
  it('日付昇順に並び替えた points 配列を返す', async () => {
    vi.spyOn(frankfurter, 'getTimeseries').mockResolvedValue({
      amount: 1,
      base: 'USD',
      start_date: '2026-04-22',
      end_date: '2026-04-29',
      rates: {
        '2026-04-25': { JPY: 150.5 },
        '2026-04-22': { JPY: 150.1 },
        '2026-04-29': { JPY: 150.23 },
      },
    })

    const result = await FxDomain.getHistory({ from: 'USD', to: 'JPY', days: 7 })

    expect(result.points.map((p) => p.date)).toEqual([
      '2026-04-22',
      '2026-04-25',
      '2026-04-29',
    ])
    expect(result.points[0].rate).toBe(150.1)
  })
})
