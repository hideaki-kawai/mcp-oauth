/**
 * GET /.well-known/oauth-authorization-server
 *
 * OAuth 2.0 Authorization Server Metadata（RFC 8414）を返すエンドポイント。
 *
 * このメタデータは何のためにあるか:
 *   OAuth クライアント（Claude / Web SPA）は接続する OAuth サーバーの URL から、
 *   「authorize はどこ？」「token はどこ？」「PKCE どの方式が使える？」といった情報を
 *   このエンドポイントを叩くだけで自動取得できる。
 *
 *   これにより、クライアント側に各エンドポイントを事前にハードコードする必要が無くなる。
 *   特に MCP の世界では、Claude が知らない MCP サーバーに接続する際に
 *   この Discovery が起点になる（→ 続いて DCR の /register、/authorize と進む）。
 *
 * ポイント:
 *   - 認証不要（公開エンドポイント）
 *   - 静的なメタデータ（DB アクセスなし）
 *   - 値は wrangler.jsonc の vars.OAUTH_ISSUER をベースに組み立てる
 *
 * 参考:
 *   - RFC 8414: OAuth 2.0 Authorization Server Metadata
 *     https://datatracker.ietf.org/doc/html/rfc8414
 *   - MCP Authorization spec
 *     https://modelcontextprotocol.io/specification/draft/basic/authorization
 */

import type { Context } from 'hono'
import type { Bindings } from '../../types'

/**
 * Authorization Server Metadata の型
 *
 * 必須フィールドは RFC 8414 §2 で定義されている。
 * このプロジェクトでサポートする機能だけを返す（他の値は省略）。
 */
type AuthorizationServerMetadata = {
  /** issuer: このサーバー自身の URL（クライアントは JWT の iss クレームと照合する） */
  issuer: string
  /** authorize エンドポイントの URL */
  authorization_endpoint: string
  /** token エンドポイントの URL */
  token_endpoint: string
  /** DCR エンドポイントの URL（Claude が動的にクライアント登録する） */
  registration_endpoint: string
  /** サポートする response_type（OAuth 2.1 では "code" のみ） */
  response_types_supported: ['code']
  /** サポートする grant_type */
  grant_types_supported: ['authorization_code', 'refresh_token']
  /** PKCE の code_challenge_method（OAuth 2.1 で plain は非推奨なので S256 のみ） */
  code_challenge_methods_supported: ['S256']
  /** クライアント認証方式（全クライアント public client なので "none" のみ） */
  token_endpoint_auth_methods_supported: ['none']
  /** サポートする scope */
  scopes_supported: string[]
}

/**
 * Authorization Server Metadata を返すコントローラー
 */
export class WellKnownController {
  /**
   * GET /.well-known/oauth-authorization-server
   */
  static getAuthorizationServerMetadata(c: Context<{ Bindings: Bindings }>) {
    const issuer = c.env.OAUTH_ISSUER

    const metadata: AuthorizationServerMetadata = {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read', 'write'],
    }

    return c.json(metadata)
  }
}
