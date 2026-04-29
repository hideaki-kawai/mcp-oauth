/**
 * POST /authorize/consent
 *
 * フロー:
 *   1. OAuth セッション Cookie を検証（無効なら未ログインなのでログインへ戻す）
 *   2. フォームを zod で検証
 *   3. ConsentService に処理委譲
 *      - approve → 認可コード発行 → redirect_uri?code=...&state=...
 *      - deny    → redirect_uri?error=access_denied&state=...
 *   4. 303 リダイレクト
 *
 * client_id / redirect_uri 不一致など form 改ざん検知時はエラー画面を直接返す
 * （リダイレクト先を信頼できないため）。
 */

import { OAUTH_COOKIES, OAUTH_PATHS } from '@mcp-oauth/constants'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { describeRoute, validator } from 'hono-openapi'
import { JwtDomain } from '../../../domains/jwt'
import { authorizeConsentFormSchema } from '../../../schemas/dto'
import type { AppEnv } from '../../../types'
import { ErrorScreen } from '../views'
import { ConsentService } from './service'

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['authorize'],
    summary: '同意処理（approve / deny）',
    description:
      'redirect_uri へリダイレクトする。approve は code、deny は error=access_denied を付与。',
    responses: {
      303: { description: 'redirect_uri へリダイレクト' },
      400: { description: 'form 不正・client/redirect_uri 不一致', content: { 'text/html': {} } },
      401: {
        description: 'OAuth セッション Cookie が無い・期限切れ',
        content: { 'text/html': {} },
      },
    },
  }),
  validator('form', authorizeConsentFormSchema, (result, c) => {
    if (!result.success) {
      return c.html(<ErrorScreen title="リクエストが不正です" message="不足/不正なフォーム" />, 400)
    }
  }),
  async (c) => {
    const form = c.req.valid('form')

    // 1. OAuth セッション Cookie 検証
    const cookie = getCookie(c, OAUTH_COOKIES.SESSION)
    if (!cookie) {
      return c.html(
        <ErrorScreen title="ログインが必要です" message="ログイン画面からやり直してください" />,
        401
      )
    }
    let userId: string
    try {
      const session = await JwtDomain.verifyOAuthSession(cookie, c.env.JWT_SECRET)
      userId = session.sub
    } catch {
      return c.html(
        <ErrorScreen title="セッションが無効です" message="再ログインしてください" />,
        401
      )
    }

    // 2. ConsentService 呼び出し
    const result = await ConsentService.handle(c.env.DB_OAUTH, { form, userId })
    if (!result.success) {
      const title =
        result.errorCode === 'invalid_client'
          ? 'クライアントが登録されていません'
          : result.errorCode === 'invalid_redirect_uri'
            ? 'リダイレクト先が登録と一致しません'
            : 'サーバーエラー'
      return c.html(<ErrorScreen title={title} message={result.error} />, 400)
    }

    // 3. redirect_uri へ 303 リダイレクト
    return c.redirect(result.data.redirectUrl, 303)
  }
)

export default route
