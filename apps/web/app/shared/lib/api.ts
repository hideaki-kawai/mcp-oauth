/**
 * api-mcp サーバーへの型安全なクライアント（Hono RPC）
 *
 * 仕組み:
 *   api-mcp 側が `export type AppType = typeof routes` を公開しており、
 *   Hono の `hc<AppType>(BASE_URL)` がそれを受け取って型付きクライアントを生成する。
 *   API のメソッド（GET/POST 等）・パス・リクエストボディ・レスポンス型が
 *   全部 TypeScript で補完される。
 *
 *   ※ `import type { AppType }` は型だけの import なので、
 *      Web のビルドにサーバーコードは含まれない（bundle が肥大しない）。
 *
 * 使い方:
 *   import { api } from '~/shared/lib/api'
 *
 *   // GET /api/health
 *   const res = await api.api.health.$get()
 *   const data = await res.json() // → HealthResponse 型
 *
 *   // POST /api/auth/token
 *   const res = await api.api.auth.token.$post({ json: { code, code_verifier, redirect_uri } })
 *
 * 環境変数:
 *   VITE_API_BASE_URL — api-mcp の URL（ローカル: http://localhost:30001）
 *   `.env.local` に設定する。`.env.example` 参照。
 */

import { hc, type InferRequestType, type InferResponseType } from 'hono/client'
import type { AppType } from '@mcp-oauth/api-mcp'
import { authStore } from './auth-store'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:30001'

/** 型安全な API クライアント */
export type ApiClient = ReturnType<typeof hc<AppType>>

/**
 * シングルトンクライアント。
 *
 * - Cookie を含めるため `credentials: 'include'` を必ず付与（リフレッシュトークン用）
 * - アクセストークンは authStore から動的に取得して Authorization ヘッダーに注入
 */
export const api: ApiClient = hc<AppType>(API_BASE_URL, {
  headers: (): Record<string, string> => {
    const token = authStore.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input as RequestInfo, {
      ...init,
      credentials: 'include',
    }),
})

/**
 * リクエスト/レスポンスの型を個別に取り出すユーティリティを再エクスポート。
 *
 * 使い方:
 *   type HealthRes = InferResponseType<typeof api.api.health.$get>
 */
export type { InferRequestType, InferResponseType }
