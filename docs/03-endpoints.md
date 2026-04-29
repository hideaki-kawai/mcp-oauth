# エンドポイント一覧

## OAuthサーバー（`apps/oauth`）

### `GET /.well-known/oauth-authorization-server`

OAuthサーバーのメタデータ。ClaudeがDiscovery時に取得する。

**レスポンス** `200 OK`

```json
{
  "issuer": "https://oauth.example.com",
  "authorization_endpoint": "https://oauth.example.com/authorize",
  "token_endpoint": "https://oauth.example.com/token",
  "registration_endpoint": "https://oauth.example.com/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

---

### `POST /register`

DCR。ClaudeなどMCPクライアントがクライアントIDを動的取得する。
（Webアプリは事前登録のため不使用）

**リクエスト** `application/json`

```json
{
  "client_name": "Claude",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none"
}
```

**レスポンス** `201 Created`

```json
{
  "client_id": "uuid_generated",
  "client_secret": null,
  "redirect_uris": ["http://localhost:3000/callback"],
  "token_endpoint_auth_method": "none"
}
```

---

### `GET /authorize`

OAuthセッションCookieを確認して**ログイン画面**または**同意画面**のHTMLを返す。

> **ここで返すHTMLはHonoが直接生成する。** ログイン・同意の両画面ともOAuthサーバーが担当する。

**クエリパラメータ**


| パラメータ                   | 必須  | 説明                                     |
| ----------------------- | --- | -------------------------------------- |
| `response_type`         | ✅   | `code` 固定                              |
| `client_id`             | ✅   | クライアントID                               |
| `redirect_uri`          | ✅   | コールバックURL                              |
| `code_challenge`        | ✅   | PKCE: BASE64URL(SHA256(code_verifier)) |
| `code_challenge_method` | ✅   | `S256` 固定                              |
| `scope`                 | ✅   | `read write`                           |
| `state`                 | ✅   | CSRFトークン                               |


**レスポンス**

- OAuthセッションCookieなし/無効 → `200 OK` ログイン画面（HTML）
- OAuthセッションCookie有効 → `200 OK` 同意画面（HTML）

---

### `POST /authorize/login`

ログインフォームの送信処理。メール/パスワードを検証してOAuthセッションを発行する。

**リクエスト** `application/x-www-form-urlencoded`

```
email=user@example.com
password=password
client_id=abc123
redirect_uri=...
code_challenge=E9Melhoa2Own...
code_challenge_method=S256
scope=read+write
state=csrf_token
```

**レスポンス（成功）** `302 Redirect` → `/authorize?...`（同意画面へ）

```
Set-Cookie: oauth_session=eyJ...; HttpOnly; Secure; Path=/; Max-Age=604800
```

> `oauth_session` はJWT（7日間有効）。このCookieはOAuthサーバー（`oauth.example.com`）のみで使用し、
> api-mcpやSPAとは共有しない。複数のMCPクライアントが接続するときにログインを省略するために7日にしている。

**レスポンス（失敗）** `200 OK` ログイン画面（エラーメッセージ付き）

---

### `POST /authorize/consent`

同意フォームの送信処理。認可コードを発行してクライアントにリダイレクトする。

**リクエスト** `application/x-www-form-urlencoded`

```
action=approve
client_id=abc123
redirect_uri=https://web.example.com/auth/callback
code_challenge=E9Melhoa2Own...
scope=read+write
state=csrf_token
```

**レスポンス（承認）** `302 Redirect`

```
Location: https://web.example.com/auth/callback?code=AUTH_CODE&state=csrf_token
```

**レスポンス（拒否）** `302 Redirect`

```
Location: https://web.example.com/auth/callback?error=access_denied&state=csrf_token
```

---

### `GET /logout`

OAuthセッション Cookie を削除してリダイレクトする。
BFF（`POST /api/auth/logout`）がリフレッシュトークンを失効させた後、ブラウザがここに誘導される。

> **なぜ GET か**: `window.location.href` でブラウザを直接このドメインに向けてCookieを削除するため。
> React Router の `navigate()` ではSPA内遷移になりリクエストが届かない。

**クエリパラメータ**

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `redirect` | 任意 | 削除後のリダイレクト先URL |

**レスポンス** `302 Redirect`

```
Set-Cookie: oauth_session=; HttpOnly; Max-Age=0（削除）
Location: <redirect パラメータの URL>（省略時は `/`）
```

---

### `POST /token`

認可コードをアクセストークンに交換する、またはリフレッシュトークンで更新する。

**リクエスト** `application/x-www-form-urlencoded`

*認可コード交換*

```
grant_type=authorization_code
code=AUTH_CODE
code_verifier=dBjftJeZ4CVP...
client_id=abc123
redirect_uri=...
```

*リフレッシュトークン更新*

```
grant_type=refresh_token
refresh_token=rt_xxx
client_id=abc123
```

**レスポンス（成功）** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "rt_yyy...",
  "scope": "read write"
}
```

**エラーレスポンス** `400 Bad Request`

```json
{ "error": "invalid_grant" }
```

---

## api-mcpサーバー（`apps/api-mcp`）

### `GET /.well-known/oauth-protected-resource`

MCPサーバーのメタデータ。ClaudeがDiscovery時に取得する。

**レスポンス** `200 OK`

```json
{
  "resource": "https://api-mcp.example.com",
  "authorization_servers": ["https://oauth.example.com"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["read", "write"]
}
```

---

### `GET /mcp` / `POST /mcp`

MCPエンドポイント本体。**Streamable HTTP トランスポート**（MCP v2025-03-26 以降の標準）。JWTが必須。

> **トランスポート方式について**
>
> MCP には2つのHTTPトランスポートがある。
> - **Streamable HTTP**（現行標準）: `/mcp` の1エンドポイントで POST・GET 両対応。
>   - `POST /mcp` — クライアント→サーバーへのJSON-RPCリクエスト
>   - `GET /mcp` — サーバー→クライアントへのSSEストリーム（サーバーからの通知用）
> - **HTTP+SSE**（非推奨）: `/sse`（GET）と `/messages`（POST）の2エンドポイント構成。廃止予定。
>
> 実装には **`@hono/mcp`** パッケージを使う（Cloudflare Workers 対応）。

**未認証レスポンス** `401 Unauthorized`

```
WWW-Authenticate: Bearer resource_metadata="https://api-mcp.example.com/.well-known/oauth-protected-resource"
```

**認証済みレスポンス** `200 OK` MCPプロトコルのレスポンス

**実装イメージ**

```typescript
// apps/api-mcp/src/routes/mcp/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { Hono } from 'hono'
import { authMiddleware } from '@/domains/auth/middleware'

const app = new Hono<AppEnv>()

// JWT認証ミドルウェアを適用
app.use(API_MCP_PATHS.MCP, authMiddleware)

app.on(['GET', 'POST'], API_MCP_PATHS.MCP, async (c) => {
  const server = new McpServer({ name: 'mcp-oauth', version: '1.0.0' })

  // ツール・リソースをここに登録していく
  // server.tool('tool-name', schema, handler)

  const transport = new StreamableHTTPTransport(c.req.raw)
  await server.connect(transport)
  return transport.response
})

export default app
```

---

### BFFエンドポイント（SPA向け）

> **なぜapi-mcpにBFFが必要か**
>
> SPAはブラウザ（JavaScript）で動くため、リフレッシュトークンをJSから触れる場所
> （メモリ・localStorage）に置くと XSS攻撃で盗まれるリスクがある。
> httpOnly Cookie に入れれば JS からは一切アクセスできない。
>
> しかし、OAuthサーバーが Set-Cookie しても `oauth.example.com` ドメインのCookieになり、
> SPAが API を叩く `api-mcp.example.com` には送信されない。
>
> そこで api-mcp が仲介役（BFF）としてOAuthサーバーと通信し、
> 自分のドメイン（`api-mcp.example.com`）のhttpOnly Cookieにリフレッシュトークンをセットする。
> SPAは api-mcp とだけ通信すれば済む。

#### `POST /api/auth/token`

SPAから認可コードを受け取り、api-mcpがOAuthサーバーの `/token` を呼んでトークンを取得する。
リフレッシュトークンはhttpOnly Cookieにセットし、SPAにはアクセストークンのみ返す。

**リクエスト** `application/json`

```json
{
  "code": "AUTH_CODE",
  "code_verifier": "dBjftJeZ4CVP...",
  "redirect_uri": "https://web.example.com/auth/callback"
}
```

**レスポンス** `200 OK`

```json
{ "access_token": "eyJ..." }
```

```
Set-Cookie: refresh_token=rt_xxx; HttpOnly; Secure; Path=/api/auth; SameSite=Strict; Max-Age=2592000
```

---

#### `POST /api/auth/refresh`

Cookie内のリフレッシュトークンを使ってアクセストークンを更新する。
SPAは5分ごとにこのエンドポイントを叩く（またはリクエスト失敗時）。

**リクエスト** Cookieのみ（ボディ不要）

```
Cookie: refresh_token=rt_xxx（自動送信）
```

**レスポンス（成功）** `200 OK`

```json
{ "access_token": "新しいeyJ..." }
```

```
Set-Cookie: refresh_token=rt_yyy; HttpOnly; Secure; ...（新しいトークンに更新）
```

**レスポンス（失敗）** `401 Unauthorized` → SPAは再ログインへ

---

#### `POST /api/auth/logout`

リフレッシュトークンをOAuthサーバーで失効させ、Cookie を削除する（ログアウト2ステップの1ステップ目）。
このエンドポイントは `api-mcp` ドメインの Cookie しか削除できないため、
レスポンス後にフロントエンドが OAuth の `GET /logout` にブラウザ遷移してOAuthセッション Cookie も削除する。

**レスポンス** `200 OK`

```json
{ "success": true }
```

```
Set-Cookie: refresh_token=; HttpOnly; Secure; Max-Age=0（削除）
```

> **完全なログアウトフロー（フロントエンド実装）**
> ```
> 1. POST /api/auth/logout  → refreshToken Cookie 削除 + DB トークン失効
> 2. window.location.href = oauth/logout?redirect=/login
>    → oauth_session Cookie 削除 → /login へリダイレクト
> ```
> 詳細は `docs/learning/logout-flow.md` を参照。

---

### `GET /api/*`

SPA向けAPIエンドポイント。JWT必須。実装時に追加していく。

**未認証レスポンス** `401 Unauthorized`

---

## まとめ表

### OAuthサーバー


| メソッド | パス                                        | 種別     | 説明                          |
| ---- | ----------------------------------------- | ------ | --------------------------- |
| GET  | `/.well-known/oauth-authorization-server` | API    | メタデータ                       |
| POST | `/register`                               | API    | DCR（MCPクライアント用）             |
| GET  | `/authorize`                              | **画面** | ログイン or 同意画面                |
| POST | `/authorize/login`                        | API    | ログイン処理・OAuthセッション発行         |
| POST | `/authorize/consent`                      | API    | 同意処理・認可コード発行                |
| POST | `/token`                                  | API    | トークン発行・更新                   |
| GET  | `/logout`                                 | API    | OAuthセッション Cookie削除・リダイレクト |


### api-mcpサーバー


| メソッド     | パス                                      | 種別  | 説明                  |
| -------- | --------------------------------------- | --- | ------------------- |
| GET      | `/.well-known/oauth-protected-resource` | API | メタデータ               |
| GET/POST | `/mcp`                                  | API | MCPエンドポイント（JWT必須）   |
| POST     | `/api/auth/token`                       | BFF | コード→トークン交換・Cookie発行 |
| POST     | `/api/auth/refresh`                     | BFF | アクセストークン更新          |
| POST     | `/api/auth/logout`                      | BFF | ログアウト・Cookie削除      |
| GET/POST | `/api/`*                                | API | SPA向けAPI（JWT必須）     |


---

## SPA画面一覧（`apps/web`）

React Router v7 SPA（SSR: false）。認証はOAuthサーバーに委譲する。


| パス               | 画面名           | 認証  | 説明                                                                                             |
| ---------------- | ------------- | --- | ---------------------------------------------------------------------------------------------- |
| `/`              | ホーム / ダッシュボード | 必須  | ログイン後のメイン画面。未認証は `/login` へリダイレクト                                                              |
| `/login`         | ログイン開始        | 不要  | OAuthサーバーの `/authorize` へリダイレクトするだけ。画面なし（または「ログイン中...」表示）                                      |
| `/auth/callback` | OAuthコールバック   | 不要  | OAuthサーバーから `?code=...&state=...` を受け取り、`/api/auth/token` を呼んでトークン取得後 `/` へリダイレクト。ユーザーには見えない遷移 |
| `/*`             | その他の画面        | 必須  | アプリの機能に応じて追加                                                                                   |


### 画面遷移フロー

```
未ログイン状態で / にアクセス
  ↓
/login にリダイレクト
  ↓
oauth.example.com/authorize にリダイレクト（ログイン・同意画面はOAuthサーバー）
  ↓
同意完了 → /auth/callback?code=...&state=... に戻る
  ↓
/auth/callback: api-mcpの /api/auth/token を呼んでトークン取得
  ↓
/ にリダイレクト（ログイン完了）
```

---

### Hono RPC クライアントのセットアップ

`apps/web` から `apps/api-mcp` を型安全に呼ぶために Hono RPC を使う。

#### api-mcp 側: `AppType` をエクスポート

```typescript
// apps/api-mcp/src/index.tsx
const app = new Hono<AppEnv>()

export const routes = app
  .route('/api/auth', authTokenRoute)
  .route('/api/auth', authRefreshRoute)
  .route('/api/auth', authLogoutRoute)
  .route('/api', apiRoute)
  // ...

export default app

/** Hono RPC用の型定義。web パッケージからインポートして使う */
export type AppType = typeof routes
```

#### web 側: `api.ts`（APIクライアント）

```typescript
// app/shared/lib/api.ts
import { hc } from 'hono/client'
import type { AppType } from '@mcp-oauth/api-mcp'
import { authStore } from './auth-store'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL  // https://api-mcp.example.com

export type ApiClient = ReturnType<typeof hc<AppType>>

export const api: ApiClient = hc<AppType>(API_BASE_URL, {
  headers: (): Record<string, string> => {
    const token = authStore.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  // httpOnly Cookie（リフレッシュトークン）を自動送信するために必要
  fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
})
```

> `@mcp-oauth/api-mcp` を `apps/web/package.json` の `devDependencies` に追加する。
> 型情報だけ使うので実行時依存にはしない。

---

### アクセストークン管理（SPA: authStore）

アクセストークンはモジュールレベル変数（メモリ）で管理する。
React stateに入れるとリレンダーが発生し、localStorage/sessionStorageはXSSリスクがある。

```typescript
// app/shared/lib/auth-store.ts
let accessToken: string | null = null

export const authStore = {
  getToken: () => accessToken,
  setToken: (token: string | null) => { accessToken = token },
  clearToken: () => { accessToken = null },
}
```

---

### sessionStorage の使い方

PKCE の OAuth フローでは、SPAがOAuthサーバーへリダイレクトする際にページが離脱する。
メモリ変数はページ遷移で消えるが、sessionStorage はタブを閉じるまで保持される。
そのため `code_verifier` と `state` の一時保存に使う。


| キー                   | 保存タイミング            | 取り出しタイミング                  | 削除タイミング                  |
| -------------------- | ------------------ | -------------------------- | ------------------------ |
| `pkce_code_verifier` | `/login` でリダイレクト直前 | `/auth/callback` でトークン交換時  | `/auth/callback` で取り出し直後 |
| `pkce_state`         | `/login` でリダイレクト直前 | `/auth/callback` でstate検証時 | `/auth/callback` で検証直後   |


```typescript
// /login: 保存
sessionStorage.setItem('pkce_code_verifier', codeVerifier)
sessionStorage.setItem('pkce_state', state)

// /auth/callback: 取り出し → 使用 → 削除
const codeVerifier = sessionStorage.getItem('pkce_code_verifier')
const savedState  = sessionStorage.getItem('pkce_state')
sessionStorage.removeItem('pkce_code_verifier')
sessionStorage.removeItem('pkce_state')
```

---

### 各ページの実装

#### `/login` ページ

```typescript
// app/routes/login/page.tsx
import { redirect } from 'react-router'
import { OAUTH_PATHS, WEB_PATHS } from '@mcp-oauth/constants'

export const clientLoader = async () => {
  // 1. PKCE パラメータを生成
  const codeVerifier = generateCodeVerifier()       // ランダム43〜128文字
  const codeChallenge = await generateCodeChallenge(codeVerifier)  // BASE64URL(SHA256(codeVerifier))
  const state = generateState()                      // ランダム文字列（CSRF対策）

  // 2. sessionStorage に保存（OAuthサーバーからリダイレクトで戻ってきたときに使う）
  sessionStorage.setItem('pkce_code_verifier', codeVerifier)
  sessionStorage.setItem('pkce_state', state)

  // 3. OAuthサーバーの /authorize へリダイレクト
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'web-client',
    redirect_uri: `${import.meta.env.VITE_WEB_BASE_URL}${WEB_PATHS.AUTH_CALLBACK}`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'read write',
    state,
  })
  throw redirect(`${import.meta.env.VITE_OAUTH_BASE_URL}${OAUTH_PATHS.AUTHORIZE}?${params}`)
}

export default function LoginPage() {
  return <p>ログイン中...</p>
}
```

#### `/auth/callback` ページ

```typescript
// app/routes/auth/callback/page.tsx
import { redirect } from 'react-router'
import { WEB_PATHS } from '@mcp-oauth/constants'
import { authStore } from '~/shared/lib/auth-store'
import { api } from '~/shared/lib/api'
import type { Route } from './+types/page'

export const clientLoader = async ({ request }: Route.ClientLoaderArgs) => {
  const url = new URL(request.url)
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // 1. sessionStorage から検証用データを取り出してすぐ削除
  const savedState    = sessionStorage.getItem('pkce_state')
  const codeVerifier  = sessionStorage.getItem('pkce_code_verifier')
  sessionStorage.removeItem('pkce_state')
  sessionStorage.removeItem('pkce_code_verifier')

  // 2. エラー or パラメータ不足の場合はログインへ
  if (error || !code || !state || !savedState || !codeVerifier) {
    throw redirect(WEB_PATHS.LOGIN)
  }

  // 3. state を検証（CSRF対策）
  if (state !== savedState) {
    throw redirect(WEB_PATHS.LOGIN)
  }

  // 4. BFF の /api/auth/token を Hono RPC で呼ぶ
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

  // 5. アクセストークンをメモリに保存してホームへ
  authStore.setToken(access_token)
  throw redirect(WEB_PATHS.HOME)
}

export default function CallbackPage() {
  return <p>認証中...</p>
}
```

#### `(private)/layout.tsx`（認証必須レイアウト）

認証が必要な全ページをこのレイアウトで囲む。
`clientMiddleware` と `clientLoader` を置くためにファイルが必要（React Router v7 のレイアウトルートは `default export` が必須）。
実際のUI（サイドバー・ヘッダー等）はアプリ要件に応じてここに追加する。

```typescript
// app/routes/(private)/layout.tsx
import { Outlet } from 'react-router'
import { authMiddleware } from '~/shared/middlewares/auth-middleware'
import { authContext } from '~/shared/middlewares/auth-context'
import type { Route } from './+types/layout'

// 認証ミドルウェアを適用（未認証なら /login へリダイレクト）
export const clientMiddleware = [authMiddleware]

// ユーザー情報をローダーで取得し、useRouteLoaderData() で子ルートから参照できる
export const clientLoader = async ({ context }: Route.ClientLoaderArgs) => {
  const user = context.get(authContext)
  return { user }
}

// アプリ固有のUI（ヘッダー・サイドバー等）はここに追加する
export default function PrivateLayout() {
  return <Outlet />
}
```

子ルートからユーザー情報を参照する場合は `useRouteLoaderData` を使う：

```typescript
// app/routes/(private)/some-page/page.tsx
import { useRouteLoaderData } from 'react-router'
import type { clientLoader } from '../layout'

const { user } = useRouteLoaderData<typeof clientLoader>('routes/(private)/layout')
```

#### `authMiddleware`

```typescript
// app/shared/middlewares/auth-middleware.ts
import { redirect, type MiddlewareFunction } from 'react-router'
import { WEB_PATHS } from '@mcp-oauth/constants'
import { authStore } from '~/shared/lib/auth-store'
import { authContext } from './auth-context'
import { api } from '~/shared/lib/api'

export const authMiddleware: MiddlewareFunction = async ({ context, request }) => {
  if (!authStore.getToken()) {
    try {
      // httpOnly Cookie のリフレッシュトークンを使ってアクセストークンを再取得
      // Cookie は api.ts の credentials: 'include' 設定で自動送信される
      const res = await api.api.auth.refresh.$post()

      if (!res.ok) {
        const url = new URL(request.url)
        const returnTo = url.pathname + url.search
        throw redirect(`${WEB_PATHS.LOGIN}?returnTo=${encodeURIComponent(returnTo)}`)
      }

      const { access_token, user } = await res.json()
      authStore.setToken(access_token)
      context.set(authContext, user)
    } catch (error) {
      if (error instanceof Response) throw error
      throw redirect(WEB_PATHS.LOGIN)
    }
  }
}
```

#### `authContext`

```typescript
// app/shared/middlewares/auth-context.ts
import { createContext } from 'react-router'

export type AuthUser = {
  id: string
  email: string
}

export const authContext = createContext<AuthUser | null>(null)
```

