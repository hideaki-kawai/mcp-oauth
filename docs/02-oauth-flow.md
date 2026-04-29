# OAuthフロー詳細

## 2つのフロー

| フロー | クライアント | 説明 |
|--------|------------|------|
| **MCPフロー** | Claude / ChatGPT等 | PKCE + DCR。MCP URLを登録したときに自動実行 |
| **Webフロー** | SPAブラウザ | PKCE。ユーザーがWebアプリにログインするとき |

どちらも同じOAuthサーバー（`apps/oauth`）を使い、同じJWTを発行する。

---

## 用語説明

| 用語 | 説明 |
|------|------|
| PKCE | 認可コードを盗まれても悪用できないようにする仕組み |
| code_verifier | クライアントがランダムに生成する秘密の文字列（43〜128文字） |
| code_challenge | `BASE64URL(SHA256(code_verifier))` — サーバーに送る |
| DCR | OAuthクライアントが事前登録なしでクライアントIDを自動取得する仕組み |
| OAuthセッション | ログイン→同意画面の間だけ有効なJWT（httpOnly Cookie、7日） |
| Service Binding | Cloudflare Workers間の直接通信の仕組み。同アカウントのWorker間はfetch()では通信できないため必須 |

---

## Cloudflare Workers間の通信について（重要）

同一アカウントのWorker間は通常の `fetch()` では通信できない制限がある。
api-mcp → oauth間の通信は **Service Binding** を使う。

```jsonc
// apps/api-mcp/wrangler.jsonc
{
  "services": [
    { "binding": "OAUTH_SERVICE", "service": "oauth" }
  ]
}
```

```typescript
// api-mcp のコード内
const res = await c.env.OAUTH_SERVICE.fetch(
  new Request('https://oauth/token', { method: 'POST', body: ... })
)
```

> Claude（外部クライアント）からOAuthサーバーへの通信は通常のHTTPSなので問題なし。
> Service Bindingが必要なのは **api-mcp → oauth** の経路のみ。

---

## MCPフロー（Claude + PKCE + DCR）

### Phase 1〜3: 自動発見・クライアント登録・認可

```
Claude ──GET /mcp────────────────────────────→ api-mcpサーバー
       ←── 401 WWW-Authenticate: Bearer
             resource_metadata="https://api-mcp.example.com
                                /.well-known/oauth-protected-resource"

Claude ──GET /.well-known/oauth-protected-resource → api-mcpサーバー
       ←── 200 { "authorization_servers": ["https://oauth.example.com"] }

Claude ──GET /.well-known/oauth-authorization-server → OAuthサーバー
       ←── 200 { authorization_endpoint, token_endpoint, registration_endpoint }

Claude ──POST /register──────────────────────→ OAuthサーバー
       ←── 201 { "client_id": "abc123" }

Claude ── ブラウザを開く ──→ GET /authorize?client_id=abc123&code_challenge=...
OAuthサーバー:
  セッションなし → ログイン画面 → ユーザー認証 → OAuthセッションCookie発行
  セッションあり → 同意画面 → ユーザーが「許可」→ 認可コード発行
       ←── 302 redirect_uri?code=AUTH_CODE&state=...
```

### Phase 4: アクセストークン発行（初回）

```
                    ┌──────────────────────────────────────────────┐
                    │           アクセストークン 初回発行             │
                    └──────────────────────────────────────────────┘

Claude ──POST /token──────────────────────────→ OAuthサーバー
  {
    grant_type:    "authorization_code",
    code:          "AUTH_CODE",
    code_verifier: "元の文字列",     ← PKCEの検証キー
    client_id:     "abc123",
    redirect_uri:  "http://localhost:PORT/callback"
  }

OAuthサーバーの処理:
  ① DB_OAUTH で code を検索 → 未使用・10分以内か確認
  ② SHA256(code_verifier) == code_challenge か確認（PKCE検証）
  ③ redirect_uri が登録時と一致するか確認
  ④ code を使用済みにする（used_at を記録）
  ⑤ アクセストークン（JWT）を生成、DBには保存しない
  ⑥ リフレッシュトークンを生成し DB_OAUTH に保存

       ←── 200 {
             access_token:  "eyJ...",   ← JWT（5分）、DBに保存しない
             token_type:    "Bearer",
             expires_in:    300,
             refresh_token: "rt_xxx",  ← ランダム文字列（30日）、DB_OAUTHに保存
             scope:         "read write"
           }

Claude: access_token → メモリ管理
        refresh_token → MCPクライアントが管理
```

### Phase 5: MCPアクセス

```
Claude ──GET /mcp──────────────────────────→ api-mcpサーバー
         Authorization: Bearer eyJ...

api-mcpサーバー:
  JWT_SECRET でローカル検証（DB・Service Bindingなし）
  payload.type === "access" を確認

       ←── 200 MCPレスポンス
```

### Phase 6: アクセストークン再発行（リフレッシュ）

```
                    ┌──────────────────────────────────────────────┐
                    │       アクセストークン 再発行（リフレッシュ）     │
                    └──────────────────────────────────────────────┘

アクセストークンの有効期限（5分）が切れた場合に実行。

Claude ──POST /token──────────────────────────→ OAuthサーバー
  {
    grant_type:    "refresh_token",
    refresh_token: "rt_xxx",    ← 保持していたリフレッシュトークン
    client_id:     "abc123"
  }

OAuthサーバーの処理:
  ① DB_OAUTH で rt_xxx を検索 → 未失効・30日以内か確認
  ② rt_xxx を失効させる（revoked_at を記録）← Rotation
  ③ 新しいアクセストークン（JWT）を生成、DBには保存しない
  ④ 新しいリフレッシュトークンを生成し DB_OAUTH に保存

       ←── 200 {
             access_token:  "eyJ新...",  ← 新しいJWT（5分）
             expires_in:    300,
             refresh_token: "rt_yyy",   ← 新しいリフレッシュトークン（30日）
             scope:         "read write"
           }

Claude: 古いaccess_token・refresh_tokenを破棄
        新しいものを保持して再度 /mcp を呼ぶ
```

---

## Webフロー（SPA + PKCE + BFF）

SPAのリフレッシュトークンは JavaScript から触れない httpOnly Cookie で管理する。
api-mcp が BFF（Backend for Frontend）として OAuth との通信を代行し Cookie を管理する。
api-mcp → OAuth 間の通信は **Service Binding** を使用。

### アクセストークン発行（初回）

```
                    ┌──────────────────────────────────────────────┐
                    │           アクセストークン 初回発行             │
                    └──────────────────────────────────────────────┘

① ブラウザ ── / にアクセス（未ログイン）──────────────→ SPA
   SPA: 未認証を検知 → /login にリダイレクト

② ブラウザ ── /login にアクセス ─────────────────────→ SPA
   SPA:
     code_verifier・code_challenge・state を生成
     → sessionStorage に保存（ページ遷移後も残す必要があるため）
     oauth.example.com/authorize?
       response_type=code
       &client_id=web-client
       &redirect_uri=https://web.example.com/auth/callback
       &code_challenge=BASE64URL(SHA256(code_verifier))
       &code_challenge_method=S256
       &scope=read+write
       &state=<ランダム文字列（CSRF対策）>
     へリダイレクト（SPAは離脱、OAuthサーバーへ）

③ OAuthサーバーでログイン・同意（MCPフローと同じ）:
   OAuthセッションなし → ログイン画面 → 認証 → OAuthセッションCookie発行
   OAuthセッションあり → 同意画面 → 「許可する」クリック
   → https://web.example.com/auth/callback?code=AUTH_CODE&state=... へリダイレクト

④ ブラウザ ── /auth/callback?code=...&state=... ─────→ SPA
   SPA:
     state を検証（sessionStorageのものと一致するか確認）
     ↓
⑤ SPA ──POST /api/auth/token──────────────────→ api-mcp
         { code, code_verifier, redirect_uri }

⑥ api-mcp ──（Service Binding）──POST /token──→ OAuthサーバー
             { grant_type: "authorization_code", code, code_verifier, ... }

                         OAuthサーバーの処理:
                           ① PKCEの検証
                           ② アクセストークン（JWT）生成（DBに保存しない）
                           ③ リフレッシュトークン生成・DB_OAUTHに保存

⑦ OAuthサーバー ────────────────────────────→ api-mcp
   { access_token: JWT, refresh_token: rt_xxx }

⑧ api-mcp:
   refresh_token → httpOnly Cookie にセット（JSから触れない）
   access_token  → レスポンスボディで返す

⑨ api-mcp ──────────────────────────────────→ SPA
   200 { access_token: JWT }
   Set-Cookie: refresh_token=rt_xxx; HttpOnly; Secure; ...

   SPA: access_token → メモリ（React state）に保存
        / にリダイレクト（ログイン完了）
```

### アクセストークン再発行（リフレッシュ）

```
                    ┌──────────────────────────────────────────────┐
                    │       アクセストークン 再発行（リフレッシュ）     │
                    └──────────────────────────────────────────────┘

アクセストークンの有効期限（5分）が切れた場合に実行。

① SPA ──POST /api/auth/refresh──────────────→ api-mcp
         Cookie: refresh_token=rt_xxx（ブラウザが自動送信）
         ※ JSはrefresh_tokenの値を知らない

② api-mcp ──（Service Binding）──POST /token──→ OAuthサーバー
             { grant_type: "refresh_token", refresh_token: rt_xxx, client_id: "web-client" }

                         OAuthサーバーの処理:
                           ① DB_OAUTH で rt_xxx を検索・検証
                           ② rt_xxx を失効（Rotation）
                           ③ 新しいアクセストークン生成（JWT）
                           ④ 新しいリフレッシュトークン生成・DB保存

③ OAuthサーバー ────────────────────────────→ api-mcp
   { access_token: 新JWT, refresh_token: rt_yyy }

④ api-mcp:
   新しいrefresh_token → Cookie を上書き
   新しいaccess_token  → レスポンスボディで返す

⑤ api-mcp ──────────────────────────────────→ SPA
   200 { access_token: 新JWT }
   Set-Cookie: refresh_token=rt_yyy; HttpOnly; Secure; ...（更新）

SPA: 新しいaccess_tokenをメモリに保存して再度APIを呼ぶ
```

---

## ログアウトフロー

完全なログアウトには2つのドメインにまたがるCookieを両方消す必要がある。

```
[1] ユーザーがログアウトボタンをクリック（apps/web）

[2] POST /api/auth/logout（BFF）
      ├─ refreshToken Cookie を読む（api-mcp ドメイン）
      ├─ OAuth /revoke を呼びDBのトークンを失効
      └─ refreshToken Cookie を削除

[3] window.location.href = oauth/logout?redirect=/login
    （React Router の navigate ではなく全画面遷移）
      ├─ oauth_session Cookie を削除（OAuthサーバードメイン）
      └─ /login へリダイレクト

[4] /login 画面が表示される（ログアウト完了）
```

> **なぜ2ステップ必要か**  
> `refreshToken` は api-mcp ドメイン専用、`oauth_session` は OAuth ドメイン専用。
> Cookie はドメインをまたいで削除できないため、それぞれのサーバーにブラウザが直接リクエストを送る必要がある。
>
> **なぜ `window.location.href` を使うか**  
> React Router の `navigate()` はSPA内遷移なので別ドメインへのHTTPリクエストが発生しない。
> `window.location.href` はブラウザの実際のナビゲーションを起こすため、OAuthサーバーがCookieを削除できる。

詳細は `docs/learning/logout-flow.md` を参照。

---

## PKCEのセキュリティ解説

```
クライアントが用意:
  code_verifier  = "abc123..."  ← 秘密にする（送らない）
  code_challenge = BASE64URL(SHA256(code_verifier))  ← これだけ送る

/authorize → code_challenge を送る
/token     → code_verifier を送る

サーバーが検証:
  SHA256(受け取ったcode_verifier) == 保存していたcode_challenge?
  → 一致 = 本物のクライアント
  → 認可コードを盗んだ第三者は code_verifier を知らないので使えない
```

---

## `code_verifier` と `state` の違い

どちらもランダム文字列だが、守る対象が異なる。

| | `code_verifier` | `state` |
|--|--|--|
| 守る対象 | 認可コードの横取り | CSRF攻撃 |
| 使うタイミング | `/token` 呼び出し時 | `/auth/callback` 受け取り時 |
| 対抗する攻撃者 | 通信を盗聴して認可コードを入手した第三者 | ユーザーを騙して偽のcallbackを踏ませる攻撃者 |

### `code_verifier` — 「俺がトークンをもらう権利がある」の証明

```
/authorize に送る: code_challenge = SHA256(code_verifier)  ← ハッシュ値のみ
/token     に送る: code_verifier（元の文字列）

検証: SHA256(code_verifier) == code_challenge?
→ code_verifier を知っているのは自分だけ
→ 認可コードを盗んだ第三者は /token を呼べない
```

### `state` — 「このレスポンスは自分が始めたフローへの返答だ」の確認

```
/authorize に送る: state=<ランダム文字列>  ← sessionStorage にも保存
/auth/callback で受け取る: ?code=...&state=<同じ値>

検証: 受け取った state == sessionStorage に保存した state?
→ 一致しない場合、自分が開始したフローではない（CSRF攻撃の疑い）→ 中断
```
