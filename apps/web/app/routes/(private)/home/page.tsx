/**
 * / — ホーム（ログイン後のダッシュボード）
 */

import { useRouteLoaderData } from 'react-router'
import { api } from '~/shared/lib/api'
import { authStore } from '~/shared/lib/auth-store'
import type { clientLoader as layoutLoader } from '../layout'
import type { Route } from './+types/page'

export const clientLoader = async (_: Route.ClientLoaderArgs) => {
  const [fxRes, cryptoRes] = await Promise.all([
    api.api.fx.rate.$get({ query: { from: 'USD', to: 'JPY' } }),
    api.api.crypto.price.$get({ query: { symbol: 'BTC' } }),
  ])

  const fx = fxRes.ok ? await fxRes.json() : null
  const crypto = cryptoRes.ok ? await cryptoRes.json() : null

  return { fx, crypto }
}

export default function HomePage({ loaderData }: Route.ComponentProps) {
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/(private)/layout')
  const user = layoutData?.user ?? authStore.getUser()
  const { fx, crypto } = loaderData

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          {user && <p className="mt-1 text-sm text-gray-500">ログイン中: {user.email}</p>}
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-500">USD/JPY</h2>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {fx ? `¥${fx.rate.toFixed(2)}` : '---'}
            </p>
            {fx && <p className="mt-1 text-xs text-gray-400">{fx.asOf} 時点</p>}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-500">BTC/USD</h2>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {crypto ? `$${crypto.price.toLocaleString()}` : '---'}
            </p>
            {crypto && <p className="mt-1 text-xs text-gray-400">{crypto.symbol.toUpperCase()}</p>}
          </div>
        </div>
      </div>
    </main>
  )
}
