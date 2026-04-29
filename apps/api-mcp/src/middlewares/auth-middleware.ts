/**
 * 認証ミドルウェア
 *
 * `Authorization: Bearer <JWT>` ヘッダーを検証し、認証済みユーザー情報を
 * `c.var.user` にセットする。
 *
 * - access_token（type=access）以外を拒否（OAuth セッション JWT が紛れ込まないように）
 * - 未認証時は `WWW-Authenticate` ヘッダーを付けて 401（MCP / OAuth 仕様準拠）
 */

import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/utils/jwt/jwt'
import type { AccessTokenPayload, AppEnv } from '../types'

const ALG = 'HS256'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(c, 'missing or malformed Authorization header')
  }

  const token = authHeader.substring(7).trim()
  if (token.length === 0) {
    return unauthorized(c, 'empty token')
  }

  let raw: Awaited<ReturnType<typeof verify>>
  try {
    raw = await verify(token, c.env.JWT_SECRET, ALG)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid token'
    return unauthorized(c, `invalid_token: ${msg}`)
  }

  // type=access 以外を拒否（OAuth セッション JWT 等の誤流入防止）
  if (raw.type !== 'access') {
    return unauthorized(c, 'invalid_token: wrong token type')
  }

  // ペイロードを型安全に再構築（as キャスト不使用）
  if (
    typeof raw.sub !== 'string' ||
    typeof raw.client_id !== 'string' ||
    typeof raw.scope !== 'string' ||
    typeof raw.iat !== 'number' ||
    typeof raw.exp !== 'number'
  ) {
    return unauthorized(c, 'invalid_token: malformed payload')
  }

  const payload: AccessTokenPayload = {
    sub: raw.sub,
    client_id: raw.client_id,
    scope: raw.scope,
    type: 'access',
    iat: raw.iat,
    exp: raw.exp,
  }

  c.set('user', payload)
  await next()
}

/**
 * 401 Unauthorized レスポンス（WWW-Authenticate ヘッダー付き）
 *
 * MCP 仕様（Authorization Spec）に従い、resource_metadata で discovery URL を示す。
 */
function unauthorized(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  description: string,
) {
  const resourceMetadata = `${c.env.API_MCP_BASE_URL}/.well-known/oauth-protected-resource`
  c.header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadata}"`)
  return c.json({ error: 'unauthorized', error_description: description }, 401)
}
