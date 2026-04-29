/**
 * GET /logout — OAuth セッション終了
 *
 * oauth_session Cookie を削除して redirect パラメータの URL へリダイレクトする。
 * BFF でリフレッシュトークンを失効させた後にブラウザをここへ向けることで、
 * OAuth サーバー側のセッション Cookie も確実に消せる。
 *
 * ## なぜ GET か
 *
 * oauth_session Cookie は OAuth サーバードメイン専用なので、
 * ブラウザがこのドメインに直接リクエストを送らないと削除できない。
 * window.location.href でブラウザを誘導するため GET を使う。
 *
 * ## なぜ DB のリフレッシュトークン削除はここでやらないのか
 *
 * refreshToken Cookie は api-mcp ドメインに属しており、
 * ブラウザはこのリクエストにその Cookie を乗せてこない。
 * OAuth サーバーはどのトークンを削除すべきか知る手段がないため、
 * リフレッシュトークンの失効は BFF（POST /api/auth/logout）が担当する。
 */

import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { OAUTH_COOKIES } from '@mcp-oauth/constants'
import type { AppEnv } from '../../types'

const route = new Hono<AppEnv>().get('/', (c) => {
  deleteCookie(c, OAUTH_COOKIES.SESSION, { path: '/' })

  const redirect = c.req.query('redirect')
  let target = '/'
  if (redirect) {
    try {
      new URL(redirect)
      target = redirect
    } catch {
      // 不正な URL は無視してルートへ
    }
  }
  return c.redirect(target, 302)
})

export default route
