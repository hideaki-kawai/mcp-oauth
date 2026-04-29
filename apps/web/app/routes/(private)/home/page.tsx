/**
 * / — ホーム（ログイン後のダッシュボード）
 */

import { Suspense } from 'react'
import { Await, useRouteLoaderData } from 'react-router'
import { api } from '~/shared/lib/api'
import { authStore } from '~/shared/lib/auth-store'
import { OAUTH_PATHS, WEB_PATHS } from '@mcp-oauth/constants'
import type { clientLoader as layoutLoader } from '../layout'
import type { Route } from './+types/page'

const OAUTH_BASE_URL = import.meta.env.VITE_OAUTH_BASE_URL ?? 'http://localhost:30002'

export const clientLoader = (_: Route.ClientLoaderArgs) => {
  // await せずに Promise を返すことでページを先に表示し、データは Suspense で遅延ロード
  const ratesPromise = Promise.all([
    api.api.fx.rate.$get({ query: { from: 'USD', to: 'JPY' } }).then((res) => (res.ok ? res.json() : null)),
    api.api.crypto.price.$get({ query: { symbol: 'BTC' } }).then((res) => (res.ok ? res.json() : null)),
  ])

  return { ratesPromise }
}

export default function HomePage({ loaderData }: Route.ComponentProps) {
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/(private)/layout')
  const user = layoutData?.user ?? authStore.getUser()
  const { ratesPromise } = loaderData

  const handleLogout = async () => {
    await api.api.auth.logout.$post()
    authStore.clearToken()
    // oauth_session Cookie は OAuth サーバードメインに属するため BFF では削除できない。
    // ブラウザを OAuth の /logout へ全画面遷移させて Cookie を削除してもらう。
    const loginUrl = `${import.meta.env.VITE_WEB_BASE_URL ?? 'http://localhost:30000'}${WEB_PATHS.LOGIN}`
    window.location.href = `${OAUTH_BASE_URL}${OAUTH_PATHS.LOGOUT}?redirect=${encodeURIComponent(loginUrl)}`
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
            {user && <p className="mt-1 text-sm text-gray-500">ログイン中: {user.email}</p>}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ログアウト
          </button>
        </header>

        <Suspense fallback={<RateCardsSkeleton />}>
          <Await resolve={ratesPromise}>
            {([fx, crypto]) => (
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
            )}
          </Await>
        </Suspense>
      </div>
    </main>
  )
}

function RateCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}
