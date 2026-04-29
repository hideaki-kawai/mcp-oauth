/**
 * /auth/callback — OAuthコールバック処理
 *
 * OAuth サーバーから ?code=...&state=... で戻ってきたときに:
 *   1. state を検証（CSRF 対策）
 *   2. BFF の /api/auth/token を呼んでトークンを取得
 *   3. JWT をデコードしてユーザー情報を取り出す
 *   4. アクセストークン + ユーザー情報をメモリに保存
 *   5. ホームへリダイレクト
 *
 * ユーザーには「認証中...」が一瞬見えるだけ。
 */

import { redirect } from 'react-router'
import { WEB_PATHS } from '@mcp-oauth/constants'
import { api } from '~/shared/lib/api'
import { authStore } from '~/shared/lib/auth-store'
import type { Route } from './+types/page'

/** JWT のペイロードをデコードする（署名検証なし・クライアント専用） */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(b64))
}

export const clientLoader = async ({ request }: Route.ClientLoaderArgs) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // sessionStorage から検証用データを取り出してすぐ削除
  const savedState = sessionStorage.getItem('pkce_state')
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier')
  sessionStorage.removeItem('pkce_state')
  sessionStorage.removeItem('pkce_code_verifier')

  // エラー・パラメータ不足はログインへ
  if (error || !code || !state || !savedState || !codeVerifier) {
    throw redirect(WEB_PATHS.LOGIN)
  }

  // state 検証（CSRF 対策）
  if (state !== savedState) {
    throw redirect(WEB_PATHS.LOGIN)
  }

  // BFF の /api/auth/token を呼んでトークン取得
  const res = await api.api.auth.token.$post({
    json: {
      code,
      code_verifier: codeVerifier,
      redirect_uri: `${import.meta.env.VITE_WEB_BASE_URL}${WEB_PATHS.AUTH_CALLBACK}`,
    },
  })

  if (!res.ok) {
    throw redirect(WEB_PATHS.LOGIN)
  }

  const { access_token } = await res.json()

  // JWT をデコードしてユーザー情報を取得（クライアントは署名検証不要）
  const payload = decodeJwtPayload(access_token)
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw redirect(WEB_PATHS.LOGIN)
  }

  authStore.setToken(access_token, { id: payload.sub, email: payload.email })
  throw redirect(WEB_PATHS.HOME)
}

export default function CallbackPage() {
  return <p>認証中...</p>
}
