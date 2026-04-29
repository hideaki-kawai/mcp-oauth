/**
 * POST /authorize/login
 *
 * フロー:
 *   1. フォームから email/password + OAuth フローパラメータを受け取る
 *   2. LoginService で認証
 *   3. 成功時:
 *      - OAuth セッション JWT（7 日）を httpOnly Cookie に設定
 *      - /authorize?<元の OAuth パラメータ> へ 303 リダイレクト → 同意画面が表示される
 *   4. 失敗時:
 *      - ログイン画面を再表示（エラーメッセージ付き）
 */

import { OAUTH_COOKIES, OAUTH_PATHS } from '@mcp-oauth/constants'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { describeRoute, validator } from 'hono-openapi'
import { JwtDomain } from '../../../domains/jwt'
import { type AuthorizeLoginForm, authorizeLoginFormSchema } from '../../../schemas/dto'
import type { AppEnv } from '../../../types'
import { LoginScreen } from '../views'
import { LoginService } from './service'

/** OAuth セッション Cookie の有効期限（秒）— JwtDomain の OAUTH_SESSION_EXPIRES_IN_SEC と同じ */
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60

/** 元の OAuth クエリ文字列を再構築する（成功時のリダイレクト先で使う） */
function buildAuthorizeQuery(form: AuthorizeLoginForm): string {
  const params = new URLSearchParams()
  params.set('response_type', form.response_type)
  params.set('client_id', form.client_id)
  params.set('redirect_uri', form.redirect_uri)
  params.set('code_challenge', form.code_challenge)
  params.set('code_challenge_method', form.code_challenge_method)
  if (form.scope !== undefined) params.set('scope', form.scope)
  if (form.state !== undefined) params.set('state', form.state)
  return params.toString()
}

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['authorize'],
    summary: 'ログイン処理',
    description: '認証成功で OAuth セッション Cookie を発行し /authorize へリダイレクトする。',
    responses: {
      303: { description: '/authorize へリダイレクト（成功）' },
      200: { description: 'ログイン画面を再表示（失敗）', content: { 'text/html': {} } },
    },
  }),
  validator('form', authorizeLoginFormSchema, (result, c) => {
    if (!result.success) {
      // フォームの形式不正は通常起きない（hidden 入力 + email/password）
      // 万一発生した場合はそのままシンプルに 400 を返す（攻撃者が叩いた場合）
      return c.text('Bad Request', 400)
    }
  }),
  async (c) => {
    const form = c.req.valid('form')

    const result = await LoginService.authenticate(c.env.DB_OAUTH, {
      email: form.email,
      password: form.password,
    })

    if (!result.success) {
      // 失敗 → ログイン画面再表示（OAuth パラメータは保持）
      return c.html(<LoginScreen query={form} errorMessage={result.error} />)
    }

    // 成功 → OAuth セッション JWT を発行して Cookie へ
    const sessionJwt = await JwtDomain.signOAuthSession(
      { sub: result.data.userId },
      c.env.JWT_SECRET
    )

    setCookie(c, OAUTH_COOKIES.SESSION, sessionJwt, {
      httpOnly: true,
      secure: c.env.ENVIRONMENT === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE,
    })

    // /authorize へ戻すと同意画面が表示される
    const query = buildAuthorizeQuery(form)
    return c.redirect(`${OAUTH_PATHS.AUTHORIZE}?${query}`, 303)
  }
)

export default route
