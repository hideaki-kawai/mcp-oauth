# 実装計画

## 全体方針

| フェーズ | 内容 | 動作確認 |
|---------|------|---------|
| 0 | 開発環境セットアップ | — |
| 1 | 共有パッケージ（DB・ユーティリティ） | — |
| 2 | OAuthサーバー実装 | — |
| 3 | api-mcpサーバー実装 → Cloudflareデプロイ → Claude接続確認 | Cloudflare |
| 4 | WebフロントエンドのBFF追加 → ローカル動作確認 → デプロイ | ローカル → Cloudflare |

**フェーズ順の理由**:
- OAuthサーバーはapi-mcpとwebの両方が依存するため先に作る
- Claudeからの接続はlocalhostに届かないため、MCPフローはCloudflareデプロイ後に確認
- WebフローはBFF（api-mcp）を経由するがブラウザからはlocalhostで完結するためローカル確認可能

---

## フェーズ0: 開発環境セットアップ

### 目標
`pnpm dev` で全アプリが起動し、ローカルD1が使える状態にする。

### 手順

1. **ローカルD1の作成**
   ```bash
   # oauth用DB（ローカルのみ。本番はwrangler d1 createが必要）
   pnpm -F @mcp-oauth/oauth dev  # 初回起動でローカルD1が自動作成される
   ```

2. **シークレットの設定**（`.dev.vars` はgitignore済み）
   ```bash
   # apps/oauth/.dev.vars
   JWT_SECRET=<openssl rand -base64 32 で生成>

   # apps/api-mcp/.dev.vars
   JWT_SECRET=<oauthと同じ値>
   ```

3. **起動確認**
   ```bash
   pnpm dev  # 全アプリ起動
   ```

---

## フェーズ1: 共有パッケージ

### 目標
DBスキーマ・マイグレーション・シーダー・共通ユーティリティが揃った状態にする。

### 1-1. `packages/database` — DBスキーマ・マイグレーション

`docs/04-database.md` の設計をDrizzle ORMで実装する。

**DB_OAUTH テーブル**（`packages/database/src/oauth/schema.ts`）
- `users` — id, email, password_hash, created_at
- `oauth_clients` — id, client_id, client_name, redirect_uris, grant_types, token_endpoint_auth_method, created_at
- `authorization_codes` — id, code, client_id, user_id, redirect_uri, code_challenge, scope, used_at, expires_at, created_at
- `refresh_tokens` — id, token, client_id, user_id, scope, type（`"mcp"` | `"web"`）, revoked_at, expires_at, created_at

**DB_API_MCP テーブル**（`packages/database/src/api-mcp/schema.ts`）
- アプリ固有データ（初期は空でOK、マイグレーション生成だけ通す）

```bash
# 1. DrizzleスキーマからSQLファイルを生成（packages/database/migrations/ に出力）
pnpm -F @mcp-oauth/database db:generate:oauth
pnpm -F @mcp-oauth/database db:generate:mcp

# 2. ローカルD1に適用（wrangler dev のローカルD1 = .wrangler/state/v3/d1/ 以下）
pnpm -F @mcp-oauth/oauth db:migrate:local
pnpm -F @mcp-oauth/api-mcp db:migrate:local
```

### 1-2. `packages/database` — シーダー

`docs/04-database.md` の初期データを投入するシーダーを実装する。

- `admin@example.com` ユーザー（パスワードはbcryptハッシュ）
- `web-client` OAuthクライアント

```bash
pnpm -F @mcp-oauth/database db:seed
```

### 1-3. アプリ固有ユーティリティ（`libs/`）

各アプリ内の `libs/` ディレクトリに配置する。複数アプリで使うわけではないため `packages/utils` には入れない。
（`packages/utils` は date-fns を使った日付処理など、複数アプリで本当に横断的に使うものだけ置く）

**`apps/oauth/src/libs/`**

| ファイル | 関数 | 説明 |
|---------|------|------|
| `password.ts` | `hashPassword(password)` | bcryptハッシュ生成 |
| `password.ts` | `verifyPassword(password, hash)` | bcrypt照合 |
| `token.ts` | `generateAuthCode()` | 認可コード生成（nanoid） |
| `token.ts` | `generateRefreshToken()` | リフレッシュトークン生成（nanoid） |

**`apps/web/app/shared/lib/`**

| ファイル | 関数 | 説明 |
|---------|------|------|
| `pkce.ts` | `generateCodeVerifier()` | PKCEのcode_verifier生成 |
| `pkce.ts` | `generateCodeChallenge(verifier)` | BASE64URL(SHA256(verifier)) |
| `pkce.ts` | `generateState()` | stateランダム生成 |

**ユニットテスト対象**: 全関数（純粋関数なので入出力テストが容易）

---

## フェーズ2: OAuthサーバー（`apps/oauth`）

### 目標
OAuth認可フローが全て動作し、認可コードとトークンが発行できる状態にする。

### アーキテクチャ

```
apps/oauth/src/
  routes/
    well-known/
      get.ts               ← GET /.well-known/oauth-authorization-server
    register/
      post.ts              ← POST /register（Controller）
      service.ts           ← DCRのバリデーション・登録ロジック
      repository.ts        ← DB_OAUTH: oauth_clientsへの書き込み
    authorize/
      get.ts               ← GET /authorize（ログイン or 同意画面HTML）
      login/
        post.ts            ← POST /authorize/login（Controller）
        service.ts         ← メール/パスワード検証・OAuthセッション発行
        repository.ts      ← DB_OAUTH: usersの読み取り
      consent/
        post.ts            ← POST /authorize/consent（Controller）
        service.ts         ← 認可コード生成・保存
        repository.ts      ← DB_OAUTH: authorization_codesへの書き込み
    token/
      post.ts              ← POST /token（Controller）
      service.ts           ← authorization_code / refresh_token の処理分岐
      repository.ts        ← DB_OAUTH: codes・tokensの読み書き
  domains/
    jwt/
      index.ts             ← JWT生成・検証（アクセストークン、OAuthセッション）
  index.tsx                ← Honoアプリ定義・ルート登録
```

### 実装順序

#### 2-1. `GET /.well-known/oauth-authorization-server`
静的なJSONを返すだけ。最初に作ることでClaudeのDiscovery動作を理解できる。

**確認**: `curl http://localhost:PORT/.well-known/oauth-authorization-server`

#### 2-2. `domains/jwt` — JWT生成・検証

アクセストークンとOAuthセッションのJWT生成・検証ロジック。
`docs/06-jwt-tokens.md` のペイロード設計を実装する。

```typescript
// 生成
JwtDomain.signAccessToken(payload, secret): Promise<string>
JwtDomain.signOAuthSession(payload, secret): Promise<string>

// 検証
JwtDomain.verifyOAuthSession(token, secret): Promise<OAuthSessionPayload>
```

**ユニットテスト対象**: sign/verifyの正常系・期限切れ・不正署名

#### 2-3. `POST /register` — DCR

ClaudeがクライアントIDを動的取得するエンドポイント。

- nanoidでclient_idを生成
- `redirect_uris`・`grant_types`・`token_endpoint_auth_method` を検証
- DB_OAUTHの`oauth_clients`テーブルに保存

**ユニットテスト対象**: service.ts のバリデーションロジック

**確認**:
```bash
curl -X POST http://localhost:PORT/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"test","redirect_uris":["http://localhost:3000/cb"],"grant_types":["authorization_code","refresh_token"],"token_endpoint_auth_method":"none"}'
```

#### 2-4. `GET /authorize` — ログイン・同意画面

`docs/05-screens.md` のHTML実装。

- OAuthセッションCookieなし/無効 → ログイン画面
- OAuthセッションCookieあり → 同意画面
- クエリパラメータのバリデーション（client_id存在確認、redirect_uri一致確認）

**ユニットテスト対象**: service.ts のパラメータバリデーション

**確認**: ブラウザで `http://localhost:PORT/authorize?response_type=code&client_id=...&...` を開く

#### 2-5. `POST /authorize/login` — ログイン処理

- メール/パスワードをDB_OAUTHの`users`テーブルで検証
- 成功 → OAuthセッションJWT（7日）をhttpOnly Cookieにセット → `/authorize?...`へリダイレクト
- 失敗 → ログイン画面（エラーメッセージ付き）を再表示

**ユニットテスト対象**: service.ts のパスワード検証・セッション発行ロジック

#### 2-6. `POST /authorize/consent` — 同意処理

- `action=approve` → nanoidで認可コード生成、DB_OAUTHに保存 → `redirect_uri?code=...&state=...` へリダイレクト
- `action=deny` → `redirect_uri?error=access_denied&state=...` へリダイレクト

**ユニットテスト対象**: service.ts の認可コード生成・有効期限設定

#### 2-7. `POST /token` — トークン発行

最も複雑なエンドポイント。`grant_type` で処理を分岐する。

**authorization_code フロー**:
1. DB_OAUTHでcodeを検索 → 未使用・10分以内か確認
2. `SHA256(code_verifier) == code_challenge` を確認（PKCE検証）
3. `redirect_uri` が登録時と一致するか確認
4. codeを使用済みにする
5. アクセストークン（JWT、5分）を生成
6. リフレッシュトークンを生成しDB_OAUTHに保存
7. レスポンス返却

**refresh_token フロー**:
1. DB_OAUTHでrefresh_tokenを検索 → 未失効・30日以内か確認
2. 既存トークンを失効（Rotation）
3. 新しいアクセストークン・リフレッシュトークンを生成・保存
4. レスポンス返却

**ユニットテスト対象**:
- service.ts: PKCE検証ロジック、有効期限チェック、Rotationロジック
- repository.ts: codeの使用済み更新、tokenのrevoke

---

## フェーズ3: api-mcpサーバー → MCPフロー確認

### 目標
Claudeからのアクセスが通り、MCPプロトコルが動作する状態にする。

### アーキテクチャ

```
apps/api-mcp/src/
  routes/
    well-known/
      get.ts               ← GET /.well-known/oauth-protected-resource
    mcp/
      get.ts               ← GET /mcp（MCPエンドポイント）
      post.ts              ← POST /mcp
  domains/
    auth/
      middleware.ts        ← JWT検証ミドルウェア（docs/06-jwt-tokens.md の実装）
  index.tsx
```

### 実装順序

#### 3-1. `GET /.well-known/oauth-protected-resource`
静的なJSONを返すだけ。

#### 3-2. JWT認証ミドルウェア

`docs/06-jwt-tokens.md` のコード例を実装する。

- `Authorization: Bearer <JWT>` ヘッダーを検証
- `payload.type === "access"` を確認（OAuthセッショントークンを拒否）
- 未認証時: `401 + WWW-Authenticate: Bearer resource_metadata="..."`

**ユニットテスト対象**: 正常系・未認証・期限切れ・不正type

#### 3-3. `GET /mcp` / `POST /mcp` — MCPエンドポイント

JWT認証ミドルウェアを適用した後、MCPプロトコルの応答を返す。
初期実装は最小限（`tools/list` に空配列を返すだけ）でOK。

### Cloudflareデプロイ

```bash
# 本番D1を作成
wrangler d1 create oauth-db
wrangler d1 create api-mcp-db

# wrangler.jsonc の database_id を更新

# シークレットをセット
wrangler secret put JWT_SECRET --name oauth
wrangler secret put JWT_SECRET --name api-mcp

# マイグレーション適用（本番D1）
pnpm -F @mcp-oauth/oauth db:migrate:remote
pnpm -F @mcp-oauth/api-mcp db:migrate:remote

# シード投入
pnpm -F @mcp-oauth/database db:seed  # リモート用コマンドを別途実装

# デプロイ
pnpm -F @mcp-oauth/oauth deploy
pnpm -F @mcp-oauth/api-mcp deploy
```

### MCPフロー動作確認（Claude web版）

1. ClaudeのMCP設定にapi-mcpのURL（`https://api-mcp.example.workers.dev/mcp`）を追加
2. Claudeが自動でDiscovery → DCR → `/authorize` を開く
3. ブラウザでログイン → 同意 → 認可コード発行
4. Claudeがトークンを取得してMCPアクセス成功を確認

---

## フェーズ4: Webフロントエンド（BFF追加 + SPA）

### 目標
ブラウザからOAuthログインしてSPAが動作する状態にする。

### 4-1. api-mcp に BFFエンドポイントを追加

`docs/03-endpoints.md` の BFFエンドポイントを実装する。

```
apps/api-mcp/src/
  routes/
    api/
      auth/
        token/
          post.ts          ← POST /api/auth/token（Controller）
          service.ts       ← OAuthサーバーへService Binding経由でトークン交換
        refresh/
          post.ts          ← POST /api/auth/refresh
          service.ts       ← OAuthサーバーへService Binding経由でリフレッシュ
        logout/
          post.ts          ← POST /api/auth/logout
          service.ts       ← リフレッシュトークン失効 + Cookie削除
```

**ポイント**: OAuthサーバーへの通信はService Bindingを使う（`c.env.OAUTH_SERVICE.fetch()`）。
ローカル開発では `wrangler dev` でService Bindingが自動的にローカルOAuthサーバーに接続される。

**ユニットテスト対象**: service.ts のCookie設定ロジック、エラーハンドリング

### 4-2. `apps/web` — 共通ライブラリ

`docs/03-endpoints.md` のコード例を実装する。

```
apps/web/app/
  shared/
    lib/
      auth-store.ts        ← アクセストークンのメモリ管理
      api.ts               ← Hono RPCクライアント（hc<AppType>）
    middlewares/
      auth-context.ts      ← createContext<AuthUser>
      auth-middleware.ts   ← clientMiddleware: リフレッシュ試行 or /loginへ
```

### 4-3. `apps/web` — ルーティング

```
apps/web/app/routes/
  login/
    page.tsx               ← PKCE生成 → sessionStorage保存 → /authorizeへリダイレクト
  auth/
    callback/
      page.tsx             ← state検証 → /api/auth/token呼び出し → /へリダイレクト
  (private)/
    layout.tsx             ← clientMiddleware = [authMiddleware]
    home/
      page.tsx             ← ログイン後のホーム画面
```

### ローカル動作確認

```bash
# OAuthサーバーとapi-mcpをローカル起動
pnpm -F @mcp-oauth/oauth dev      # http://localhost:8787
pnpm -F @mcp-oauth/api-mcp dev    # http://localhost:8788

# webを起動
pnpm -F @mcp-oauth/web dev        # http://localhost:5173
```

ブラウザで `http://localhost:5173` にアクセスし、OAuthフローが完結することを確認する。

### Cloudflareデプロイ（web）

```bash
pnpm -F @mcp-oauth/api-mcp deploy  # BFFエンドポイント追加分を再デプロイ
pnpm -F @mcp-oauth/web deploy
```

---

## ユニットテスト方針

### テストファイルの配置

コロケーション（同ディレクトリ）に配置する。

```
routes/token/
  post.ts
  service.ts
  service.test.ts    ← service のユニットテスト
  repository.ts
  repository.test.ts ← repository のユニットテスト（D1モック）
```

### テストの優先度

| 優先度 | 対象 | 理由 |
|-------|------|------|
| 高 | `packages/utils` の全関数 | 純粋関数・副作用なし・テストが容易 |
| 高 | `token/service.ts` | PKCE検証・Rotationなど複雑なロジック |
| 高 | JWT生成・検証（`domains/jwt`） | セキュリティ上重要 |
| 中 | 各 service.ts のバリデーション | ビジネスロジックの保護 |
| 低 | repository.ts | D1モックが複雑になるため結合テストで代替 |

### テストコマンド

```bash
pnpm -F @mcp-oauth/utils test
pnpm -F @mcp-oauth/oauth test
pnpm -F @mcp-oauth/api-mcp test
```

---

## 実装チェックリスト

### フェーズ0
- [ ] `.dev.vars` に JWT_SECRET を設定
- [ ] `pnpm dev` で全アプリが起動する

### フェーズ1
- [ ] DB_OAUTH スキーマ定義
- [ ] DB_API_MCP スキーマ定義
- [ ] マイグレーション生成・適用（ローカル）
- [ ] シーダー実装・実行
- [ ] `packages/utils` の関数実装
- [ ] `packages/utils` のユニットテスト

### フェーズ2
- [ ] `GET /.well-known/oauth-authorization-server`
- [ ] `domains/jwt` 実装・テスト
- [ ] `POST /register` 実装・テスト
- [ ] `GET /authorize` ログイン・同意画面HTML
- [ ] `POST /authorize/login` 実装・テスト
- [ ] `POST /authorize/consent` 実装・テスト
- [ ] `POST /token` (authorization_code) 実装・テスト
- [ ] `POST /token` (refresh_token) 実装・テスト

### フェーズ3
- [ ] `GET /.well-known/oauth-protected-resource`
- [ ] JWT認証ミドルウェア 実装・テスト
- [ ] `GET /mcp` / `POST /mcp` 実装
- [ ] Cloudflare D1作成・マイグレーション
- [ ] Cloudflareデプロイ（oauth・api-mcp）
- [ ] Claude web版からMCP接続確認

### フェーズ4
- [ ] `POST /api/auth/token` 実装・テスト
- [ ] `POST /api/auth/refresh` 実装・テスト
- [ ] `POST /api/auth/logout` 実装・テスト
- [ ] `auth-store.ts` 実装
- [ ] `api.ts`（Hono RPCクライアント）実装
- [ ] `auth-context.ts` 実装
- [ ] `auth-middleware.ts` 実装
- [ ] `/login` ページ実装
- [ ] `/auth/callback` ページ実装
- [ ] `(private)/layout.tsx` 実装
- [ ] ホームページ実装
- [ ] ローカル動作確認（ブラウザでOAuthフロー完結）
- [ ] Cloudflareデプロイ（api-mcp再デプロイ・web）
