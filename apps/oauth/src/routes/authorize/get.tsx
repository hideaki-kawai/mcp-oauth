/**
 * GET /authorize — ログイン or 同意画面を返す
 *
 * フロー:
 *   1. zod でクエリパラメータを検証（response_type=code / S256 等の形式チェック）
 *   2. AuthorizeService で client_id 存在 / redirect_uri 一致を検証（DB 参照）
 *      → 失敗時は redirect_uri を信頼できないので**直接エラー画面**を返す
 *   3. OAuth セッション Cookie を検証
 *      - 無効/未設定 → ログイン画面
 *      - 有効       → 同意画面
 *
 * 注: フォームの submit 先（POST /authorize/login / consent）はフェーズ 2-5/2-6 で実装。
 */

import { OAUTH_COOKIES } from '@mcp-oauth/constants'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { describeRoute, validator } from 'hono-openapi'
import { JwtDomain } from '../../domains/jwt'
import { authorizeQuerySchema } from '../../schemas/dto'
import type { AppEnv } from '../../types'
import { AuthorizeService } from './service'
import { ConsentScreen, ErrorScreen, LoginScreen } from './views'

const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({
    tags: ['authorize'],
    summary: 'OAuth 認可画面を返す',
    description:
      'ログイン未済ならログイン画面、ログイン済みなら同意画面。失敗時はエラー画面 HTML（リダイレクトしない）。',
    responses: {
      200: {
        description: 'ログイン or 同意画面 HTML',
        content: { 'text/html': {} },
      },
      400: {
        description: 'パラメータ不正・client_id 不正・redirect_uri 不一致',
        content: { 'text/html': {} },
      },
    },
  }),
  validator('query', authorizeQuerySchema, (result, c) => {
    if (!result.success) {
      // クエリ形式不正は redirect_uri が信頼できないので直接エラー画面
      const detail = result.error
        .map((issue) => {
          const path = (issue.path ?? []).map((p) => (typeof p === 'object' ? p.key : p)).join('.')
          return path ? `${path}: ${issue.message}` : issue.message
        })
        .join(', ')
      return c.html(<ErrorScreen title="リクエストが不正です" message={detail} />, 400)
    }
  }),
  async (c) => {
    const query = c.req.valid('query')

    // 1. DB 検証
    const validation = await AuthorizeService.validate(c.env.DB_OAUTH, query)
    if (!validation.success) {
      const title =
        validation.errorCode === 'invalid_client'
          ? 'クライアントが登録されていません'
          : validation.errorCode === 'invalid_redirect_uri'
            ? 'リダイレクト先が登録と一致しません'
            : 'サーバーエラー'
      return c.html(<ErrorScreen title={title} message={validation.error} />, 400)
    }

    const { client } = validation.data

    // 2. OAuth セッション Cookie を検証
    const cookie = getCookie(c, OAUTH_COOKIES.SESSION)
    let isLoggedIn = false
    if (cookie) {
      try {
        await JwtDomain.verifyOAuthSession(cookie, c.env.JWT_SECRET)
        isLoggedIn = true
      } catch {
        // 期限切れ・改ざんされた Cookie → 未ログイン扱い
        isLoggedIn = false
      }
    }

    // 3. 画面振り分け
    if (!isLoggedIn) {
      return c.html(<LoginScreen query={query} />)
    }

    return c.html(
      <ConsentScreen query={query} clientName={client.name} fallbackScope={client.scopes} />
    )
  }
)

export default route
