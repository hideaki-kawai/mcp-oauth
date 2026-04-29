/**
 * /login — OAuthフロー開始
 *
 * PKCE パラメータを生成して sessionStorage に保存し、
 * OAuth サーバーの /authorize にリダイレクトする。
 * ユーザーには「ログイン中...」が一瞬見えるだけ。
 */

import { redirect } from 'react-router'
import { OAUTH_CLIENT_IDS, OAUTH_PATHS, OAUTH_SCOPES, WEB_PATHS } from '@mcp-oauth/constants'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '~/shared/lib/pkce'

export const clientLoader = async () => {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateState()

  // リダイレクト後にコールバックページで使うため sessionStorage に保存
  sessionStorage.setItem('pkce_code_verifier', codeVerifier)
  sessionStorage.setItem('pkce_state', state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_IDS.WEB,
    redirect_uri: `${import.meta.env.VITE_WEB_BASE_URL}${WEB_PATHS.AUTH_CALLBACK}`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: OAUTH_SCOPES.WEB,
    state,
  })

  throw redirect(`${import.meta.env.VITE_OAUTH_BASE_URL}${OAUTH_PATHS.AUTHORIZE}?${params}`)
}

export default function LoginPage() {
  return <p>ログイン中...</p>
}
