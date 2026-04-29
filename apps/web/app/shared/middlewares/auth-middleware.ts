/**
 * 認証ミドルウェア（React Router v7 clientMiddleware）
 *
 * (private)/layout.tsx の clientMiddleware に登録して、
 * 認証が必要な全ルートに適用する。
 *
 * 動作:
 *   1. アクセストークンが authStore にある → 既存ユーザーをコンテキストにセット
 *   2. トークンなし → /api/auth/refresh で httpOnly Cookie からトークンを再取得
 *   3. リフレッシュ失敗 → /login へリダイレクト
 */

import { redirect, type MiddlewareFunction } from 'react-router'
import { WEB_PATHS } from '@mcp-oauth/constants'
import { api } from '~/shared/lib/api'
import { authStore } from '~/shared/lib/auth-store'
import { authContext } from './auth-context'

export const authMiddleware: MiddlewareFunction = async ({ context, request }) => {
  const existingToken = authStore.getToken()
  const existingUser = authStore.getUser()

  if (existingToken && existingUser) {
    // 既にトークンあり → コンテキストにセットして通過
    context.set(authContext, existingUser)
    return
  }

  try {
    // httpOnly Cookie のリフレッシュトークンでアクセストークンを再取得
    const res = await api.api.auth.refresh.$post()

    if (!res.ok) {
      const url = new URL(request.url)
      const returnTo = url.pathname + url.search
      throw redirect(`${WEB_PATHS.LOGIN}?returnTo=${encodeURIComponent(returnTo)}`)
    }

    const { access_token, user } = await res.json()
    authStore.setToken(access_token, user)
    context.set(authContext, user)
  } catch (error) {
    if (error instanceof Response) throw error
    throw redirect(WEB_PATHS.LOGIN)
  }
}
