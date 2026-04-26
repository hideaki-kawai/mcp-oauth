# OAuth フロー完全ガイド

このプロジェクトでは OAuth が「MCP フロー（Claude）」と「Web フロー（SPA）」の2種類で使われる。
どちらも同じ OAuth サーバーを使い、同じ JWT アクセストークンを発行する。
このドキュメントは上から順に読めば全体を理解できるよう書いた。

---

## 1. 登場人物の整理

まず「誰が誰と通信するか」を頭に入れる。

```
┌─────────────────────────────────────────────────────────────┐
│                        インターネット                          │
│                                                             │
│  Claude ─────────────────────────────→ api-mcp             │
│  （MCPクライアント）        HTTPS        （MCPサーバー）        │
│                                            ↕                │
│  ブラウザ ────────────────────────────→ oauth              │
│  （SPA/ユーザー）           HTTPS        （OAuthサーバー）     │
│                                            ↑                │
│  ブラウザ ───────────────────────────→ api-mcp             │
│  （SPAのJS）                HTTPS        （BFFとして動く）     │
│                                            ↕ Service Binding│
│                                           oauth             │
└─────────────────────────────────────────────────────────────┘
```

| 登場人物 | 説明 |
|---------|------|
| **Claude** | MCPクライアント。ツールを使うために api-mcp に接続したい |
| **ブラウザ（ユーザー）** | Web アプリを使うユーザー。ログイン・同意画面を操作する |
| **SPA（JavaScript）** | ブラウザ上で動く React アプリ。API を呼ぶ |
| **api-mcp** | MCPサーバー兼 BFF。JWT を検証して MCP レスポンスを返す |
| **oauth** | OAuthサーバー。ログイン・同意・トークン発行を担う |

### Service Binding とは

Cloudflare Workers は同一アカウント内でも通常の `fetch()` では相互通信できない制限がある。
`api-mcp → oauth` の通信は **Service Binding** という仕組みを使う。

```typescript
// api-mcp 内での oauth 呼び出し
const res = await c.env.OAUTH_SERVICE.fetch(
  new Request('https://oauth/token', { method: 'POST', body: ... })
)
```

Claude（外部）→ api-mcp、ブラウザ → oauth の通信は通常の HTTPS なので問題ない。

---

## 2. トークンの種類と役割

OAuth では複数のトークンが登場する。混乱しないよう先に整理する。

| トークン | 形式 | 有効期限 | 保存場所 | 役割 |
|---------|------|---------|---------|------|
| **アクセストークン** | JWT（HS256） | **5分** | クライアントのメモリ | API・MCP への認証に使う |
| **リフレッシュトークン** | ランダム文字列 | **30日** | DB + Cookie/MCPクライアント | アクセストークンを再発行する |
| **認可コード** | ランダム文字列 | **10分** | DB（使い捨て） | OAuth フロー途中の一時コード |
| **OAuthセッション** | JWT（HS256） | **7日** | httpOnly Cookie（oauth ドメイン） | ログイン済みの証明（同意画面スキップ用） |

### アクセストークン（JWT）の中身

```json
{
  "sub": "user_id_xxx",
  "client_id": "abc123",
  "scope": "read write",
  "type": "access",
  "iat": 1700000000,
  "exp": 1700000300
}
```

`type: "access"` の確認が重要。OAuthセッションの JWT が api-mcp に送られてきても弾く。

### なぜアクセストークンを DB に保存しないか

JWT は**自己完結型**のトークン。サーバー側は `JWT_SECRET` で署名を検証するだけでよく、
DB に問い合わせなくても「本物かどうか」「有効期限内かどうか」がわかる。
有効期限を 5 分と短くすることでリスクを抑えている。

```
oauth が JWT_SECRET で署名 → アクセストークン発行
api-mcp が JWT_SECRET で検証 → DB 不要・ローカルで完結
```

---

## 3. PKCE と state の役割

OAuth フローには `code_verifier`・`code_challenge`・`state` という3つのランダム文字列が登場する。
それぞれ**別の攻撃**から守るためのものなので混同しないこと。

### PKCE（`code_verifier` / `code_challenge`）

**守る対象**: 認可コードを盗んだ第三者がトークンを取得するのを防ぐ。

```
クライアントが用意:
  code_verifier  = "ランダム文字列（43〜128文字）"  ← 秘密。絶対に送らない
  code_challenge = BASE64URL(SHA256(code_verifier))  ← ハッシュ値。サーバーに送る

/authorize リクエストに code_challenge を含める
/token リクエストに code_verifier を含める

OAuthサーバーが検証:
  SHA256(受け取った code_verifier) == 保存していた code_challenge ?
  → 一致 = 本物のクライアント（code_verifier を知っている）
  → 不一致 = 認可コードを盗んだ第三者 → 拒否
```

認可コードが通信途中で盗まれても、`code_verifier` を知らなければ `/token` を呼べない。

### state

**守る対象**: CSRF 攻撃（ユーザーを騙して偽の callback を踏ませる攻撃）。

```
/authorize リクエストに state=<ランダム文字列> を含める
→ sessionStorage にも保存しておく

/auth/callback で受け取った state を検証:
  受け取った state == sessionStorage に保存した state ?
  → 一致 = 自分が始めた OAuth フローへの正当な返答
  → 不一致 = 攻撃の可能性 → 中断
```

| | `code_verifier` | `state` |
|--|--|--|
| 守る対象 | 認可コードの横取り | CSRF 攻撃 |
| 使うタイミング | `/token` 呼び出し時 | `/auth/callback` 受け取り時 |
| 対抗する攻撃者 | 通信を盗聴した第三者 | ユーザーを騙す攻撃者 |

---

## 4. MCPフロー（Claude）

Claude が MCP サーバーに接続するときのフロー。
**ユーザーは何も操作しない**が、ブラウザで「ログイン → 同意」する場面だけある。

### 4-1. 全体シーケンス図

```mermaid
sequenceDiagram
    actor User as ユーザー（ブラウザ）
    participant Claude as Claude（MCPクライアント）
    participant ApiMcp as api-mcp（MCPサーバー）
    participant OAuth as oauth（OAuthサーバー）

    Note over Claude,OAuth: Phase 1: Discovery（自動）
    Claude->>ApiMcp: GET /mcp
    ApiMcp-->>Claude: 401 WWW-Authenticate: Bearer resource_metadata="..."

    Claude->>ApiMcp: GET /.well-known/oauth-protected-resource
    ApiMcp-->>Claude: 200 { authorization_servers: ["https://oauth..."] }

    Claude->>OAuth: GET /.well-known/oauth-authorization-server
    OAuth-->>Claude: 200 { authorization_endpoint, token_endpoint, registration_endpoint }

    Note over Claude,OAuth: Phase 2: DCR（動的クライアント登録）（自動）
    Claude->>OAuth: POST /register
    OAuth-->>Claude: 201 { client_id: "abc123" }

    Note over Claude,User: Phase 3: 認可（ユーザー操作あり）
    Claude->>User: ブラウザで /authorize を開く
    User->>OAuth: GET /authorize?client_id=abc123&code_challenge=...
    OAuth-->>User: ログイン画面 or 同意画面（HTML）
    User->>OAuth: ログイン → 同意（「許可する」クリック）
    OAuth-->>User: 302 redirect_uri?code=AUTH_CODE&state=...
    User-->>Claude: 認可コードを受け取る

    Note over Claude,OAuth: Phase 4: トークン取得（自動）
    Claude->>OAuth: POST /token { grant_type: authorization_code, code, code_verifier, ... }
    OAuth-->>Claude: 200 { access_token, refresh_token }

    Note over Claude,ApiMcp: Phase 5: MCP アクセス
    Claude->>ApiMcp: GET /mcp（Authorization: Bearer JWT）
    ApiMcp-->>Claude: 200 MCPレスポンス

    Note over Claude,OAuth: Phase 6: トークンリフレッシュ（5分後）
    Claude->>OAuth: POST /token { grant_type: refresh_token, refresh_token: rt_xxx }
    OAuth-->>Claude: 200 { access_token: 新JWT, refresh_token: rt_yyy }
```

### 4-2. Phase 1: Discovery（自動発見）

Claude が「このMCPサーバーはどの OAuth サーバーを使っているか」を自動的に調べる。

#### ① まず認証なしで /mcp を叩く

```http
GET /mcp HTTP/1.1
Host: api-mcp.example.com
```

**レスポンス**: 401 — 「認証が必要。ここを見て」という情報が返る

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://api-mcp.example.com/.well-known/oauth-protected-resource"
```

#### ② Protected Resource Metadata を取得

```http
GET /.well-known/oauth-protected-resource HTTP/1.1
Host: api-mcp.example.com
```

**レスポンス**: 200 — 「この OAuth サーバーを使え」

```json
{
  "resource": "https://api-mcp.example.com",
  "authorization_servers": ["https://oauth.example.com"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["read", "write"]
}
```

#### ③ OAuth サーバーのメタデータを取得

```http
GET /.well-known/oauth-authorization-server HTTP/1.1
Host: oauth.example.com
```

**レスポンス**: 200 — 「各エンドポイントはここだ」

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

### 4-3. Phase 2: DCR（動的クライアント登録）

Claude は「事前登録されていない外部クライアント」なので、ここで自分のクライアント ID を取得する。
Web アプリ（`web-client`）はシーダーで事前登録済みなので DCR は使わない。

```http
POST /register HTTP/1.1
Host: oauth.example.com
Content-Type: application/json

{
  "client_name": "Claude",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none"
}
```

**レスポンス**: 201 — 以降のリクエストで使う `client_id` が発行される

```json
{
  "client_id": "abc123",
  "client_secret": null,
  "redirect_uris": ["http://localhost:3000/callback"],
  "token_endpoint_auth_method": "none"
}
```

`client_secret: null` = パブリッククライアント（シークレットを持たない）。
だからこそ PKCE が必要。

### 4-4. Phase 3: 認可（ユーザーがブラウザで操作）

Claude が PKCE パラメータを生成して、ブラウザで `/authorize` を開く。

**Claude が生成するもの:**

```
code_verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_..."  （ランダム文字列）
code_challenge = BASE64URL(SHA256(code_verifier))
state          = "af0ifjsldkj"  （CSRF対策のランダム文字列）
```

**ブラウザで開く URL:**

```
https://oauth.example.com/authorize
  ?response_type=code
  &client_id=abc123
  &redirect_uri=http://localhost:3000/callback
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
  &scope=read+write
  &state=af0ifjsldkj
```

**OAuthサーバーの動作:**

OAuthセッション Cookie がない場合:
1. ログイン画面（HTML）を返す
2. ユーザーがメール・パスワードを入力して送信（`POST /authorize/login`）
3. 認証成功 → OAuthセッション JWT を httpOnly Cookie にセット（7日間有効）
4. 同意画面にリダイレクト

OAuthセッション Cookie がある場合（ログイン済み）:
1. いきなり同意画面を表示（ログインスキップ）

**同意画面でユーザーが「許可する」を押すと:**

```http
HTTP/1.1 302 Found
Location: http://localhost:3000/callback?code=AUTH_CODE_XYZ&state=af0ifjsldkj
```

認可コードが発行され、`redirect_uri` へリダイレクトされる。
認可コードは DB に保存され、**10分以内・1回限り**有効。

### 4-5. Phase 4: アクセストークン取得（初回）

Claude が認可コードをアクセストークンに交換する。

```http
POST /token HTTP/1.1
Host: oauth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE_XYZ
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_...
&client_id=abc123
&redirect_uri=http://localhost:3000/callback
```

**OAuthサーバーの検証ステップ:**

```
① DB で AUTH_CODE_XYZ を検索
  → 存在する？ → YES
  → used_at が null（未使用）？ → YES
  → 発行から10分以内？ → YES

② PKCE 検証
  → SHA256(受け取った code_verifier) == DB の code_challenge ?
  → 一致 → OK

③ redirect_uri の照合
  → 登録時の redirect_uri と完全一致？ → YES

④ code を使用済みにする（used_at を記録）

⑤ アクセストークン（JWT）を生成
  → DB には保存しない
  → 有効期限: 5分

⑥ リフレッシュトークンを生成し DB に保存
  → 有効期限: 30日
```

**レスポンス:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyX3h4eCIsInR5cGUiOiJhY2Nlc3MiLCJleHAiOjE3MDAwMDAzMDB9.xxx",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "rt_a1b2c3d4e5f6...",
  "scope": "read write"
}
```

Claude はこの2つを保持する:
- `access_token` → メモリで管理
- `refresh_token` → MCPクライアントが安全に管理

### 4-6. Phase 5: MCP アクセス

```http
GET /mcp HTTP/1.1
Host: api-mcp.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

**api-mcp の検証（DB 問い合わせなし）:**

```
① Authorization ヘッダから Bearer トークンを取り出す
② JWT_SECRET でローカル検証（署名・有効期限）
③ payload.type === "access" を確認
④ 問題なければリクエストを通す
```

**レスポンス:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "result": { "tools": [...] }
}
```

### 4-7. Phase 6: トークンリフレッシュ（5分後）

アクセストークンの有効期限が切れたら、リフレッシュトークンで新しいトークンを取得する。

```http
POST /token HTTP/1.1
Host: oauth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=rt_a1b2c3d4e5f6...
&client_id=abc123
```

**OAuthサーバーの処理（Rotation）:**

```
① DB で rt_a1b2c3d4e5f6 を検索
  → revoked_at が null（未失効）？ → YES
  → 発行から30日以内？ → YES

② rt_a1b2c3d4e5f6 を失効させる（revoked_at を記録）← これが Rotation

③ 新しいアクセストークン（JWT）を生成（DB に保存しない）

④ 新しいリフレッシュトークンを生成して DB に保存
```

**レスポンス:**

```json
{
  "access_token": "eyJ新しいJWT...",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "rt_新しいトークン...",
  "scope": "read write"
}
```

**Rotation とは**: リフレッシュトークンを使うたびに新しいものに差し替える仕組み。
古いリフレッシュトークンが盗まれていた場合、正規ユーザーが先に使えば攻撃者のトークンは無効になる。

---

## 5. Webフロー（SPA + BFF）

ブラウザの SPA（JavaScript）がログインするフロー。
MCP フローとの主な違いは以下の2点:

1. **DCR がない** — `web-client` はシーダーで事前登録済み
2. **BFF 経由でトークンを管理** — SPA は `refresh_token` を直接持たない

### なぜ SPA は refresh_token を直接持てないか

```
localStorage や sessionStorage → XSS 攻撃でスクリプトから読み取られる → 危険

httpOnly Cookie → JavaScript から一切アクセスできない → 安全
```

ただし、`oauth.example.com` が Set-Cookie しても、そのCookieは `oauth.example.com` ドメインにしか送られない。
SPA が使う `api-mcp.example.com` には届かない。

**解決策: BFF（Backend for Frontend）**

api-mcp が仲介者として OAuth サーバーと通信し、自分のドメイン（`api-mcp.example.com`）の
httpOnly Cookie に refresh_token をセットする。SPA は api-mcp とだけ通信すればよい。

### 5-1. 全体シーケンス図（初回ログイン）

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ（SPA）
    participant ApiMcp as api-mcp（BFF）
    participant OAuth as oauth

    User->>Browser: / にアクセス
    Browser->>Browser: 未認証を検知
    Browser->>Browser: /login にリダイレクト

    Note over Browser: PKCE生成・sessionStorageに保存
    Browser->>Browser: code_verifier, code_challenge, state を生成
    Browser->>Browser: sessionStorage に保存
    Browser->>OAuth: GET /authorize?response_type=code&client_id=web-client&...

    OAuth-->>User: ログイン画面（HTML）
    User->>OAuth: POST /authorize/login（メール・パスワード）
    OAuth-->>User: 302 /authorize（OAuthセッションCookie発行）

    OAuth-->>User: 同意画面（HTML）
    User->>OAuth: POST /authorize/consent（action=approve）
    OAuth-->>Browser: 302 /auth/callback?code=AUTH_CODE&state=...

    Note over Browser: state検証・sessionStorage削除
    Browser->>Browser: sessionStorage の state と照合
    Browser->>ApiMcp: POST /api/auth/token { code, code_verifier, redirect_uri }

    ApiMcp->>OAuth: POST /token（Service Binding）{ grant_type: authorization_code, ... }
    OAuth-->>ApiMcp: 200 { access_token, refresh_token }

    Note over ApiMcp: Cookie にセット
    ApiMcp-->>Browser: 200 { access_token } + Set-Cookie: refresh_token（HttpOnly）

    Browser->>Browser: access_token をメモリに保存
    Browser->>User: / にリダイレクト（ログイン完了）
```

### 5-2. ステップ詳細（初回ログイン）

#### ① 未ログイン状態で `/` にアクセス

SPA の `authMiddleware`（clientMiddleware）が動く。

```
メモリに access_token がない
→ POST /api/auth/refresh を呼んでリフレッシュ試行
→ Cookie も存在しない（初回）→ 401
→ /login にリダイレクト
```

#### ② `/login` ページ

SPA が PKCE パラメータを生成し、sessionStorage に保存してから OAuth サーバーへリダイレクトする。

```typescript
const codeVerifier  = generateCodeVerifier()   // ランダム 43〜128 文字
const codeChallenge = await generateCodeChallenge(codeVerifier)
const state         = generateState()

sessionStorage.setItem('pkce_code_verifier', codeVerifier)
sessionStorage.setItem('pkce_state', state)
```

**sessionStorage を使う理由**: SPA が OAuth サーバーへリダイレクトするとページが離脱する。
メモリ変数はページ遷移で消えるが、sessionStorage はタブを閉じるまで残る。

リダイレクト先 URL:

```
https://oauth.example.com/authorize
  ?response_type=code
  &client_id=web-client
  &redirect_uri=https://web.example.com/auth/callback
  &code_challenge=BASE64URL(SHA256(code_verifier))
  &code_challenge_method=S256
  &scope=read+write
  &state=<ランダム文字列>
```

#### ③ OAuth サーバーでのログイン・同意

**ログイン処理（`POST /authorize/login`）:**

```http
POST /authorize/login HTTP/1.1
Host: oauth.example.com
Content-Type: application/x-www-form-urlencoded

email=admin@example.com
&password=password
&client_id=web-client
&redirect_uri=https://web.example.com/auth/callback
&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
&code_challenge_method=S256
&scope=read+write
&state=af0ifjsldkj
```

**レスポンス（成功）:**

```http
HTTP/1.1 302 Found
Location: /authorize?client_id=web-client&...（同意画面へ）
Set-Cookie: oauth_session=eyJ...; HttpOnly; Secure; Path=/; Max-Age=604800
```

`oauth_session` Cookie（7日間）がセットされる。次回 `/authorize` に来たときにログインをスキップする。

**同意処理（`POST /authorize/consent`）:**

```http
POST /authorize/consent HTTP/1.1
Host: oauth.example.com
Content-Type: application/x-www-form-urlencoded

action=approve
&client_id=web-client
&redirect_uri=https://web.example.com/auth/callback
&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
&scope=read+write
&state=af0ifjsldkj
```

**レスポンス:**

```http
HTTP/1.1 302 Found
Location: https://web.example.com/auth/callback?code=AUTH_CODE_XYZ&state=af0ifjsldkj
```

#### ④ `/auth/callback` ページ

SPA が戻ってきた。まず sessionStorage から取り出して **すぐ削除**する。

```typescript
const savedState   = sessionStorage.getItem('pkce_state')
const codeVerifier = sessionStorage.getItem('pkce_code_verifier')
sessionStorage.removeItem('pkce_state')          // 使い終わったら即削除
sessionStorage.removeItem('pkce_code_verifier')  // 使い終わったら即削除
```

**state の検証（CSRF 対策）:**

```typescript
const state = url.searchParams.get('state')
if (state !== savedState) {
  // 自分が始めたフローではない → 攻撃の可能性 → 中断
  redirect('/login')
}
```

#### ⑤ SPA → api-mcp（BFF）へトークン取得依頼

```http
POST /api/auth/token HTTP/1.1
Host: api-mcp.example.com
Content-Type: application/json

{
  "code": "AUTH_CODE_XYZ",
  "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_...",
  "redirect_uri": "https://web.example.com/auth/callback"
}
```

#### ⑥ api-mcp → OAuth（Service Binding 経由）

```http
POST /token HTTP/1.1
Host: oauth（Service Binding 内部通信）
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE_XYZ
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_...
&client_id=web-client
&redirect_uri=https://web.example.com/auth/callback
```

OAuth サーバーの検証は MCP フローと同じ（PKCE検証・認可コード照合・redirect_uri照合）。

**OAuth → api-mcp レスポンス:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "rt_a1b2c3d4e5f6...",
  "scope": "read write"
}
```

#### ⑦ api-mcp が Cookie をセットして SPA に返す

```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: refresh_token=rt_a1b2c3d4e5f6...; HttpOnly; Secure; Path=/api/auth; SameSite=Strict; Max-Age=2592000

{
  "access_token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

- `refresh_token` → httpOnly Cookie → JavaScript からは一切読めない
- `access_token` → レスポンスボディ → SPA がメモリに保存

SPA は `access_token` をメモリに保存して `/` へリダイレクト。ログイン完了。

### 5-3. 全体シーケンス図（トークンリフレッシュ）

```mermaid
sequenceDiagram
    participant Browser as ブラウザ（SPA）
    participant ApiMcp as api-mcp（BFF）
    participant OAuth as oauth

    Note over Browser: access_token が期限切れ or 存在しない
    Browser->>ApiMcp: POST /api/auth/refresh（Cookie自動送信）
    ApiMcp->>OAuth: POST /token（Service Binding）grant_type=refresh_token
    OAuth-->>ApiMcp: 200 { access_token: 新JWT, refresh_token: rt_yyy }

    Note over ApiMcp: Cookie を更新
    ApiMcp-->>Browser: 200 { access_token: 新JWT } + Set-Cookie: refresh_token（HttpOnly）

    Browser->>Browser: access_token をメモリに更新
    Browser->>ApiMcp: 元のリクエストを再送
```

### 5-4. ステップ詳細（トークンリフレッシュ）

#### ① SPA → api-mcp

Cookie は**ブラウザが自動で送信する**。SPA の JavaScript は `refresh_token` の値を知らない。

```http
POST /api/auth/refresh HTTP/1.1
Host: api-mcp.example.com
Cookie: refresh_token=rt_a1b2c3d4e5f6...  ← ブラウザが自動送信
```

#### ② api-mcp → OAuth（Service Binding）

```http
POST /token HTTP/1.1
Host: oauth（Service Binding 内部通信）
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=rt_a1b2c3d4e5f6...
&client_id=web-client
```

OAuth サーバーで Rotation 処理:
1. DB で `rt_a1b2c3d4e5f6` を検索 → 未失効・30日以内を確認
2. `rt_a1b2c3d4e5f6` を失効させる（revoked_at を記録）
3. 新しいアクセストークン（JWT）を生成
4. 新しいリフレッシュトークンを生成して DB に保存

#### ③ api-mcp → SPA

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=rt_新しいトークン...; HttpOnly; Secure; ...

{
  "access_token": "eyJ新しいJWT..."
}
```

**失敗した場合（リフレッシュトークン期限切れ等）:**

```http
HTTP/1.1 401 Unauthorized
```

SPA はこれを受け取ったら `/login` にリダイレクトして再ログインを促す。

---

## 6. authMiddleware の動き

SPA の認証が必要な全ページに適用されるクライアントミドルウェア。
ページ表示のたびに動作し、アクセストークンの有無を確認する。

```
ページ遷移
  ↓
authMiddleware 実行
  ↓
メモリに access_token がある？
  → YES → そのまま通過
  → NO  → POST /api/auth/refresh を呼ぶ
              ↓
           成功 → access_token をメモリに保存 → 通過
           失敗（401） → /login にリダイレクト
```

**なぜページ遷移のたびに確認するか**

アクセストークンはメモリに保存されるので、**ページをリロードすると消える**。
そのとき Cookie の refresh_token を使って自動的に再取得する。ユーザーには再ログインを求めない。

---

## 7. MCPフロー vs Webフロー 比較

| | MCPフロー | Webフロー |
|--|---------|---------|
| クライアント登録 | DCR で動的取得 | シーダーで事前登録 |
| access_token 保管 | MCPクライアントのメモリ | SPA のメモリ |
| refresh_token 保管 | MCPクライアントが管理 | httpOnly Cookie（api-mcp ドメイン） |
| トークン取得経路 | Claude → OAuth 直接 | SPA → api-mcp（BFF）→ OAuth |
| api-mcp → OAuth 通信 | 不要（Claudeが直接呼ぶ） | Service Binding |
| OAuthセッション | 初回ログイン時に発行・以降スキップ | 同左 |
| PKCE | あり（Claude が生成） | あり（SPA が生成） |
| state | あり（Claude が管理） | あり（sessionStorage で管理） |

---

## 8. よくある疑問

### Q. OAuthセッション Cookie はなぜ必要か

認可コードを取得するまでに複数のリクエスト（ログイン → 同意）がある。
HTTP はステートレスなので「このブラウザはさっきログインした人だ」を覚えておく手段が必要。
それが OAuthセッション Cookie。

JWT なのでサーバー側に保存せず、Cookie の中身を検証するだけでわかる（ステートレス）。

### Q. なぜアクセストークンは 5 分しか有効でないか

JWT は DB に保存しないため、一度発行したら**失効させる方法がない**。
盗まれた場合のリスクを最小化するために有効期限を短くしている。

5 分切れても refresh_token があれば自動更新されるので、ユーザーには影響しない。

### Q. なぜ refresh_token の有効期限は 30 日か

ユーザーが「ログインしたまま使い続けられる」期間。
30 日以上アクセスしなければ再ログインを求める。

### Q. Rotation で何が嬉しいか

```
① 攻撃者が refresh_token を盗む
② 正規ユーザーが先に使う → 新しい refresh_token に差し替わる（古いものは失効）
③ 攻撃者が古い refresh_token を使おうとする → 失効済みで拒否される
```

盗まれた refresh_token が使われる前に正規ユーザーが使えば被害ゼロ。
また、**失効済みのトークンが使われた場合は不正アクセスの兆候**なので、
全トークンを無効化する処理を入れることもできる（このプロジェクトでは省略）。
