# 実装計画

## 全体方針

| フェーズ | 内容 | 動作確認 |
|---------|------|---------|
| 0 | 依存パッケージインストール・ローカル開発環境セットアップ | — |
| 1 | 共有パッケージ（DB・ユーティリティ） | — |
| 2 | OAuthサーバー実装 | — |
| 3 | api-mcpサーバー実装 | — |
| 4 | Cloudflareセットアップ → デプロイ → Claude接続確認 | Cloudflare |
| 5 | WebフロントエンドのBFF追加 → ローカル動作確認 → デプロイ | ローカル → Cloudflare |

**フェーズ順の理由**:
- OAuthサーバーはapi-mcpとwebの両方が依存するため先に作る
- Claudeからの接続はlocalhostに届かないため、MCPフローはCloudflareデプロイ後に確認
- WebフローはBFF（api-mcp）を経由するがブラウザからはlocalhostで完結するためローカル確認可能

---

## フェーズ0: 依存パッケージインストール・ローカル開発環境セットアップ

### 目標
`pnpm dev` で全アプリが起動し、ローカルD1が使える状態にする。

### 0-1. 依存パッケージのインストール

各アプリ・パッケージに必要なライブラリを追加する。

#### ライブラリ一覧

| ライブラリ | 用途 |
|-----------|------|
| `hono` | Cloudflare Workers 向け Web フレームワーク。ルーティング・ミドルウェア・JSX |
| `drizzle-orm` | TypeScript ORM。Cloudflare D1（SQLite）のクエリを型安全に書く |
| `drizzle-kit` | Drizzle のCLIツール。スキーマから SQL マイグレーションファイルを生成する |
| `@cloudflare/vite-plugin` | Vite で Cloudflare Workers をビルド・ローカル実行するプラグイン |
| `@cloudflare/workers-types` | Workers 環境の型定義（`Env`・`D1Database` など） |
| `wrangler` | Cloudflare Workers の CLI。ローカル開発・デプロイ・D1 操作 |
| `bcryptjs` | ❌ 不使用。Cloudflare Workers の CPU 時間制限（無料: 10ms）に bcrypt のコスト計算が収まらないため。代わりに `crypto.subtle`（PBKDF2）を使う（Workers ネイティブ、外部ライブラリ不要） |
| `nanoid` | ❌ 不使用。`crypto.randomUUID()` が Workers ネイティブで使えるため不要 |
| `tailwindcss` | ユーティリティファーストの CSS フレームワーク |
| `@tailwindcss/vite` | Tailwind CSS v4 の Vite プラグイン |
| `@hono/mcp` | Hono 向け MCP ミドルウェア。Streamable HTTP トランスポートを実装 |
| `@modelcontextprotocol/sdk` | MCP 公式 SDK。`McpServer` でツール・リソースを登録する |
| `date-fns` | 日付操作ライブラリ。トークン有効期限の計算（`addSeconds`）・期限切れ判定（`isPast`）に使用 |
| `hono/client`（`hc`） | Hono RPC クライアント。`AppType` から型安全な API クライアントを生成（`hono` に同梱） |

#### インストールコマンド

**`packages/database`**
```bash
pnpm -F @mcp-oauth/database add drizzle-orm
pnpm -F @mcp-oauth/database add -D drizzle-kit @cloudflare/workers-types
```

**`packages/constants` / `packages/types`**
```bash
# 追加ライブラリなし（TypeScriptのみ）
```

**`packages/utils`**
```bash
pnpm -F @mcp-oauth/utils add date-fns
```

**`apps/oauth`**
```bash
pnpm -F @mcp-oauth/oauth add hono drizzle-orm @mcp-oauth/database @mcp-oauth/types @mcp-oauth/constants @mcp-oauth/utils
pnpm -F @mcp-oauth/oauth add -D @cloudflare/vite-plugin @cloudflare/workers-types wrangler vite
pnpm -F @mcp-oauth/oauth add -D tailwindcss @tailwindcss/vite
# bcryptjs・nanoid は不要（後述）
```

**`apps/api-mcp`**
```bash
pnpm -F @mcp-oauth/api-mcp add hono drizzle-orm @mcp-oauth/database @mcp-oauth/types @mcp-oauth/constants
pnpm -F @mcp-oauth/api-mcp add @hono/mcp @modelcontextprotocol/sdk
pnpm -F @mcp-oauth/api-mcp add -D @cloudflare/vite-plugin @cloudflare/workers-types wrangler vite
```

**`apps/web`**
```bash
pnpm -F @mcp-oauth/web add hono @mcp-oauth/constants  # hono は hc<AppType> のために必要
pnpm -F @mcp-oauth/web add -D @mcp-oauth/api-mcp      # Hono RPC の型のみ使用（実行時依存なし）
# React Router v7・Tailwind CSS は scaffold 時にインストール済み
```

### 0-2. ローカル開発シークレットの設定

`.dev.vars` はgitignore済み。各自で作成する。

```bash
# apps/oauth/.dev.vars
JWT_SECRET=<openssl rand -base64 32 で生成>

# apps/api-mcp/.dev.vars
JWT_SECRET=<oauth と同じ値>
```

### 0-3. 起動確認

```bash
pnpm dev  # 全アプリ起動（ローカルD1 は wrangler dev 初回起動時に自動作成）
```

---

## フェーズ1: 共有パッケージ

### 目標
DBスキーマ・マイグレーション・シーダー・共通ユーティリティが揃った状態にする。

### 1-1. `packages/database` — DBスキーマ・マイグレーション

`docs/04-database.md` の設計をDrizzle ORMで実装する。

**DB_OAUTH テーブル**（`packages/database/src/oauth/schema.ts`）
- `users` — id, email, password_hash, role, created_at, updated_at
- `oauth_clients` — id, name, redirect_uris, token_endpoint_auth_method, scopes, created_at
- `authorization_codes` — code, client_id, user_id, scopes, redirect_uri, code_challenge, expires_at, used_at, created_at
- `refresh_tokens` — token, type（`"mcp"` / `"web"` / `"session"`）, client_id, user_id, scopes, expires_at, revoked_at, created_at

**DB_API_MCP テーブル**（`packages/database/src/mcp/schema.ts`）
- アプリ固有データのみ（MCP プロトコル用のテーブルは不要）
- 初期は `export {}` のみ。最初のドメインテーブルが決まってから生成する
  - 空スキーマで `db:generate:mcp` を実行するとエラーになる

#### ローカル D1 の仕組み

| 項目 | 内容 |
|------|------|
| ローカル D1 の実体 | SQLite ファイル |
| 保存先 | 各アプリの `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite` |
| いつ作られる？ | `wrangler dev` または `wrangler d1 migrations apply --local` の初回実行時に自動作成 |
| 識別キー | `wrangler.jsonc` の `database_name`（`database_id` の値はローカルでは使われない） |
| マイグレーション参照元 | `wrangler.jsonc` の `migrations_dir`（→ `packages/database/migrations/{oauth\|mcp}/`） |
| アプリごとに別ファイル | `apps/oauth` と `apps/api-mcp` でそれぞれ `.wrangler/` を持つ |

#### 手順（OAuth 側を例に）

```bash
# 1. Drizzle スキーマから SQL マイグレーションファイルを生成
#    → packages/database/migrations/oauth/0000_xxx.sql が出力される
pnpm -F @mcp-oauth/database db:generate:oauth

# 2. ローカル D1 に適用
#    初回実行時に .wrangler/state/v3/d1/ 配下に SQLite ファイルが自動生成される
pnpm -F @mcp-oauth/oauth db:migrate:local

# 3. 適用結果を確認（テーブル一覧）
cd apps/oauth
pnpm wrangler d1 execute oauth-db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table';"

# 4. 任意のクエリで中身を見る
pnpm wrangler d1 execute oauth-db --local \
  --command "SELECT * FROM users LIMIT 10;"
```

`api-mcp` 側も最初のテーブルを定義したら同じ流れ:
```bash
pnpm -F @mcp-oauth/database db:generate:mcp
pnpm -F @mcp-oauth/api-mcp db:migrate:local
```

#### スキーマ変更時のフロー

スキーマを編集した後の典型的な流れ:

```bash
# 1. schema.ts を編集
# 2. 差分マイグレーションを生成（前回からの差分のみが新しい SQL ファイルになる）
pnpm -F @mcp-oauth/database db:generate:oauth
# 3. ローカル D1 に適用
pnpm -F @mcp-oauth/oauth db:migrate:local
```

drizzle-kit は前回のマイグレーション以降の差分だけを生成するので、
既存テーブルを壊さずカラム追加などができる。

#### ローカル D1 のリセット（開発初期に便利）

スキーマをガラッと変えた / 古い状態を捨てたい時:

```bash
# OAuth 側の D1 をまるごと削除
rm -rf apps/oauth/.wrangler/state/v3/d1

# 次回マイグレーション or wrangler dev で再生成される
pnpm -F @mcp-oauth/oauth db:migrate:local
```

> ⚠️ **注意**: 本番デプロイ後は `db:migrate:remote` でしか変更を適用してはいけない。
> リセット（DB 削除）は本番では絶対にやらない。

#### よくあるトラブル

| 症状 | 原因と対処 |
|------|---------|
| `Couldn't find a D1 DB with the name or binding` | `wrangler.jsonc` の `database_name` と `db:migrate:local` のスクリプト引数（`oauth-db` など）が一致しているか確認 |
| `No migrations present at ...` | `db:generate:*` を先に実行していない or `migrations_dir` のパスが間違っている |
| 適用したはずのカラムが無い | 別アプリの `.wrangler/` を見ている可能性。各アプリは独立した D1 ファイルを持つので `cd apps/oauth` してから実行 |
| `db:generate:mcp` でエラー | mcp 側スキーマが空（`export {}` のみ）の可能性。最初のテーブルを定義してから実行する |

### 1-2. `packages/database` — シーダー

`docs/04-database.md` の初期データを投入するシーダーを実装する。

- `admin@example.com` ユーザー（パスワードはPBKDF2ハッシュ）
- `web-client` OAuthクライアント

```bash
pnpm -F @mcp-oauth/database db:seed
```

### 1-3. ユーティリティ

配置場所の方針:
- **`packages/utils/`** — 複数のパッケージ・アプリ間で共有するもの
- **`apps/<app>/src/libs/`** — そのアプリ専用のもの

**`packages/utils/src/`**

| ファイル | 関数 | 説明 | 利用元 |
|---------|------|------|------|
| `password.ts` | `hashPassword(password)` | PBKDF2ハッシュ生成（`crypto.subtle`、Workers ネイティブ） | `apps/oauth`（ログイン）+ `packages/database`（シーダー） |
| `password.ts` | `verifyPassword(password, hash)` | PBKDF2照合（`crypto.subtle`） | `apps/oauth`（ログイン） |
| `date.ts` | (date-fns ラッパー等) | 日付処理 | 全アプリ |

> シーダー（`packages/database/src/seed/oauth.ts`）が `hashPassword` を呼ぶ都合上、
> apps/oauth の libs/ ではなく packages/utils に置く。
> apps/oauth → packages/utils の依存は OK だが、その逆は不可なので。

**`apps/oauth/src/libs/`**

| ファイル | 関数 | 説明 |
|---------|------|------|
| `token.ts` | `generateAuthCode()` | 認可コード生成（`crypto.getRandomValues()` 16 バイト → 32 文字 hex） |
| `token.ts` | `generateRefreshToken()` | リフレッシュトークン生成（`crypto.getRandomValues()` 32 バイト → 64 文字 hex） |

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

- `crypto.randomUUID()` で client_id を生成
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

- `action=approve` → `crypto.randomUUID()` で認可コード生成、DB_OAUTHに保存 → `redirect_uri?code=...&state=...` へリダイレクト
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
さらに、実際に動く **MCP ツール 6 種類 + Prompt 2 種類** を実装して Claude から呼べるようにする。

### MCP プリミティブの構成

DB を持たず、外部の公開 API（キー不要）をラップしたツールと、それらを束ねる Prompt を提供する。
学習目的に最適: 認証付き MCP の実装に集中でき、API ラッパーは薄く保てる。

#### Tools（6 種類）— LLM が自動的に呼ぶ「アクション」

| ツール | データ源 | 用途 |
|--------|---------|------|
| `get_fx_rate` | Frankfurter | 2 通貨間の最新レート（例: USD → JPY） |
| `convert_currency` | Frankfurter | 金額の通貨換算（例: 100 USD は何 JPY？） |
| `get_fx_history` | Frankfurter | 期間指定で為替推移を取得（例: 直近 7 日の USD/JPY） |
| `get_crypto_price` | CoinGecko | 暗号通貨の現在価格（例: BTC の今の値段） |
| `get_crypto_market` | CoinGecko | 時価総額・24h 変動率など市場データ |
| `get_crypto_history` | CoinGecko | OHLC チャート（例: 直近 7 日の BTC 推移） |

#### Prompts（2 種類）— ユーザーがスラッシュコマンドで明示的に発動

| Prompt | 説明 |
|--------|------|
| `daily_market_brief` | 主要な暗号通貨と為替の今日の状況をまとめる。引数 `focusCurrency`（任意）で重点通貨ペアを指定可能 |
| `crypto_deep_dive` | 1 銘柄について価格・時価総額・直近変動を多角的に分析。引数 `symbol` 必須 |

Prompt の中身は **日本語** で書く（プロジェクト規約）。
Prompt は内部で複数の Tool を順に呼ぶように Claude に指示するメッセージを返す。

#### 採用する API クライアント

| API | クライアント | 採用方針 |
|-----|------------|---------|
| **CoinGecko** | `@coingecko/coingecko-typescript`（**公式 SDK**） | Cloudflare Workers 対応公式・型完備・自動リトライ・無料枠もキー無しで使える |
| **Frankfurter** | 自前の薄い fetch ラッパー（`libs/frankfurter.ts`） | 公式 SDK が無い・API がシンプル（GET 1 本）・third-party SDK を入れる利得が無い |

```bash
pnpm -F @mcp-oauth/api-mcp add @hono/mcp @modelcontextprotocol/sdk
pnpm -F @mcp-oauth/api-mcp add @coingecko/coingecko-typescript
```

### 設計方針: 「domains/ を共通データ層」にして MCP と Web で重複を消す

api-mcp は MCP クライアント（Claude）と Web SPA の両方にデータを提供する。
同じ機能を 2 つの surface で出すため、外部 API 呼び出しを直接 Tool / Controller に書くと重複する。

これを避けるために 3 層に分ける:

```
external API (Frankfurter / CoinGecko)
   ↓
libs/        ← 外部 API ラッパー（fetch / SDK 直叩き、純粋なデータ取得）
   ↓
domains/     ← ★ プロトコル非依存の共通層（型を整形して返す）★
   ↓
   ├──→ routes/mcp/tools/*    ← domain を呼んで MCP 形式に整形
   └──→ routes/api/fx,crypto/*  ← domain を呼んで JSON で返す（Hono RPC）
```

- 「USD/JPY の今日のレート取得」というロジックは `FxDomain.getRate()` の 1 箇所だけ
- MCP Tool / Web API は domain の戻り値を MCP 形式 / JSON 形式に変換するだけの薄いアダプタ

### アーキテクチャ

```
apps/api-mcp/src/
  index.tsx
  types.ts                          ← Bindings / Variables / AppEnv
  middlewares/                      ← trade-agent と同じ配置
    index.ts                        ← export 集約
    auth-middleware.ts              ← JWT 検証ミドルウェア
  libs/
    coingecko.ts                    ← @coingecko/coingecko-typescript の薄いラッパー
    frankfurter.ts                  ← Frankfurter API の薄い fetch ラッパー
  domains/                          ← ★ 共通データ層 ★
    fx/
      index.ts                      ← FxDomain: getRate / convert / getHistory
    crypto/
      index.ts                      ← CryptoDomain: getPrice / getMarket / getHistory
  schemas/dto/                      ← zod スキーマ（domain 戻り値 = z.infer する）
    fx.ts                           ← fxRateSchema, convertedAmountSchema, fxHistorySchema
    crypto.ts                       ← cryptoPriceSchema, cryptoMarketSchema, cryptoHistorySchema
  routes/
    well-known/
      get.ts                        ← GET /.well-known/oauth-protected-resource
    api/                            ← Web SPA 向け JSON API（Hono RPC で web から呼ぶ）
      fx/
        rate/get.ts                 ← GET /api/fx/rate
        convert/get.ts              ← GET /api/fx/convert
        history/get.ts              ← GET /api/fx/history
      crypto/
        price/get.ts                ← GET /api/crypto/price
        market/get.ts               ← GET /api/crypto/market
        history/get.ts              ← GET /api/crypto/history
    mcp/
      post.ts                       ← GET/POST /mcp（@hono/mcp）
      tools/                        ← MCP ツール定義（zod schema + handler）
        get-fx-rate.ts
        convert-currency.ts
        get-fx-history.ts
        get-crypto-price.ts
        get-crypto-market.ts
        get-crypto-history.ts
        index.ts                    ← registerTools(server) で 6 種を一括登録
      prompts/                      ← MCP Prompt 定義（日本語テンプレ）
        daily-market-brief.ts
        crypto-deep-dive.ts
        index.ts                    ← registerPrompts(server) で 2 種を一括登録
```

各層の責任:

| 層 | 役割 | 戻り値の例 |
|---|---|---|
| `libs/` | 外部 API を叩いて生レスポンスを返す | `frankfurter.getLatest('USD', ['JPY'])` → `{ rates: { JPY: 150.23 }, date: '2026-04-29' }` |
| `domains/` | 業務概念に正規化（プロトコル非依存） | `FxDomain.getRate(...)` → `{ rate: 150.23, from, to, asOf }` |
| `tools/*` (MCP) | domain を呼んで `{content:[{type:'text',text:...}]}` に整形 | テキスト「1 USD = 150.23 JPY (2026-04-29 時点)」 |
| `routes/api/*` (Web) | domain を呼んで JSON で返す（OpenAPI 化） | `{ rate: 150.23, from: 'USD', to: 'JPY', asOf: '...' }` |

`schemas/dto/` の zod スキーマは **domain と Web API の両方が共有**する（`z.infer<typeof xxx>` で domain 戻り値型を導出）。

### 実装順序

#### 3-1. `GET /.well-known/oauth-protected-resource`
静的な JSON を返すだけ（RFC 9728 / MCP Authorization spec）。

```json
{
  "resource": "<API_MCP_BASE_URL>",
  "authorization_servers": ["<OAUTH_ISSUER>"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["read", "write"]
}
```

#### 3-2. JWT 認証ミドルウェア（`middlewares/auth-middleware.ts`）

trade-agent の構成と同様に `middlewares/` 配下に配置:

```
middlewares/
  index.ts              ← export 集約
  auth-middleware.ts    ← MiddlewareHandler<AppEnv>
```

- `Authorization: Bearer <JWT>` を検証
- `payload.type === "access"` を確認（OAuth セッション JWT を拒否）
- 検証成功時: `c.set('user', payload)` で Variables に格納
- 未認証時: `401 + WWW-Authenticate: Bearer resource_metadata="..."`

**ユニットテスト対象**: 正常系・未認証・期限切れ・不正 type

#### 3-3. 外部 API クライアントラッパー（`libs/`）

**`libs/coingecko.ts`**: `@coingecko/coingecko-typescript`（公式 SDK）を初期化して使う。
無料公開 API なので key 不要（`new Coingecko({})` で初期化）。

**`libs/frankfurter.ts`**: `https://api.frankfurter.dev/v1/` への fetch を関数化。
レスポンスを zod でランタイム検証してから返す。

両方とも MCP / Web から直接は呼ばれない（必ず domain 経由）。
Result<T> は使わず例外で error 伝播（呼び元の domain で try/catch）。

#### 3-4. DTO スキーマ（`schemas/dto/fx.ts`, `crypto.ts`）

zod でレスポンス型を定義。これが **domain の戻り値型 = Web API のレスポンス = MCP の structuredContent** の単一の真実になる。

```typescript
// schemas/dto/fx.ts
export const fxRateSchema = z.object({
  rate: z.number(),
  from: z.string(),
  to: z.string(),
  asOf: z.string(), // YYYY-MM-DD
})
export type FxRate = z.infer<typeof fxRateSchema>

// 同様に convertedAmountSchema, fxHistorySchema
```

#### 3-5. ドメイン層（`domains/fx`, `domains/crypto`）

`libs/` を呼んで、戻り値を schemas/dto の形に整形する純粋関数。
クラス + static メソッド構成（AGENTS.md 規約）。

```typescript
// domains/fx/index.ts
export class FxDomain {
  static async getRate(input: { from: string; to: string }): Promise<FxRate> {
    const raw = await frankfurter.getLatest(input.from, [input.to])
    return {
      rate: raw.rates[input.to],
      from: input.from,
      to: input.to,
      asOf: raw.date,
    }
  }
  static async convert(...): Promise<ConvertedAmount> { ... }
  static async getHistory(...): Promise<FxHistory> { ... }
}
```

**ユニットテスト対象**: 各 method（libs を vi.mock）

#### 3-6. Web API（`routes/api/fx/*`, `routes/api/crypto/*`）

各エンドポイントは Controller のみ（service.ts なし — domain がすでに業務層なので冗長）。
`describeRoute` + `validator('query', ...)` で OpenAPI に反映、domain を直接呼んで JSON 返却。

```typescript
// routes/api/fx/rate/get.ts
const route = new Hono<AppEnv>().get(
  '/',
  describeRoute({ tags: ['fx'], responses: { 200: { ... fxRateSchema ... } } }),
  validator('query', getFxRateQuerySchema, errorHandler),
  async (c) => {
    const { from, to } = c.req.valid('query')
    const result = await FxDomain.getRate({ from, to })
    return c.json(result)
  },
)
```

#### 3-7. MCP Tool 定義（`routes/mcp/tools/`）

domain を呼んで MCP 形式（`{content:[{type:'text',text:...}]}`）に整形するだけの薄い層。

```typescript
// 例: tools/get-fx-rate.ts
export const getFxRateConfig = {
  title: '為替レート取得',
  description: '指定した 2 通貨間の最新為替レート（ECB 公式データ）',
  inputSchema: { from: z.string().length(3), to: z.string().length(3) },
}

export async function getFxRateHandler({ from, to }: { from: string; to: string }) {
  const result = await FxDomain.getRate({ from, to })
  return {
    content: [{ type: 'text', text: `1 ${result.from} = ${result.rate} ${result.to}（${result.asOf} 時点）` }],
  }
}
```

`tools/index.ts` の `registerTools(server)` で 6 種を一括登録。

#### 3-8. MCP Prompt 定義（`routes/mcp/prompts/`）

ユーザーがスラッシュコマンドで明示的に発動するテンプレ。
中身は **日本語**（プロジェクト規約）で、Tool を順に呼ぶよう Claude に依頼するメッセージを返す。

```typescript
// 例: prompts/daily-market-brief.ts
export const dailyMarketBriefConfig = {
  title: '今日のマーケット概況',
  description: '主要な暗号通貨と為替の今日の状況をまとめます',
  argsSchema: {
    focusCurrency: z.string().optional().describe('重点通貨ペア（例: USD/JPY）'),
  },
}

export function dailyMarketBriefHandler(args: { focusCurrency?: string }) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `以下を実行して今日のマーケット概況をまとめてください:
1. \`get_crypto_price\` で BTC と ETH の現在価格を取得
2. \`get_fx_rate\` で USD/JPY と EUR/USD${args.focusCurrency ? ` と ${args.focusCurrency}` : ''}の最新レートを取得
3. 数値を整理し、目立つ動きや注目点を日本語で簡潔にまとめて報告`,
      },
    }],
  }
}
```

`prompts/index.ts` の `registerPrompts(server)` で 2 種を一括登録。

**ユニットテスト対象**: handler が想定通りの日本語テキストを返すこと（純関数）

#### 3-9. `GET /mcp` / `POST /mcp` — MCP エンドポイント

`@hono/mcp` で Streamable HTTP トランスポート、`authMiddleware` で JWT 認証必須。

```typescript
app.use(API_MCP_PATHS.MCP, authMiddleware)

app.on(['GET', 'POST'], API_MCP_PATHS.MCP, async (c) => {
  const server = new McpServer({ name: 'mcp-oauth', version: '1.0.0' })
  registerTools(server)    // 6 ツール
  registerPrompts(server)  // 2 Prompt
  const transport = new StreamableHTTPTransport(c.req.raw)
  await server.connect(transport)
  return transport.response
})
```

---

## フェーズ4: Cloudflareセットアップ → デプロイ → Claude接続確認

### 目標
oauth と api-mcp を Cloudflare にデプロイし、Claude から MCP 接続できる状態にする。

### 4-1. Cloudflare アカウント・wrangler セットアップ

```bash
# wrangler にログイン（ブラウザが開く）
wrangler login

# ログイン確認
wrangler whoami
```

### 4-2. D1 データベース作成

```bash
# D1 データベースを作成（Cloudflare ダッシュボードに作成される）
wrangler d1 create oauth-db
wrangler d1 create api-mcp-db
```

出力される `database_id` を各 `wrangler.jsonc` に設定する：

```jsonc
// apps/oauth/wrangler.jsonc
{ "database_id": "<出力されたID>" }

// apps/api-mcp/wrangler.jsonc
{ "database_id": "<出力されたID>" }
```

### 4-3. シークレットの設定（本番）

```bash
# oauth と api-mcp に同じ JWT_SECRET を設定
wrangler secret put JWT_SECRET --name oauth
wrangler secret put JWT_SECRET --name api-mcp
```

### 4-4. マイグレーション適用（本番D1）

```bash
pnpm -F @mcp-oauth/oauth db:migrate:remote
pnpm -F @mcp-oauth/api-mcp db:migrate:remote
```

### 4-5. シード投入（本番D1）

```bash
pnpm -F @mcp-oauth/database db:seed  # リモート用コマンドを別途実装（wrangler d1 execute 経由）
```

### 4-6. デプロイ

```bash
pnpm -F @mcp-oauth/oauth deploy
pnpm -F @mcp-oauth/api-mcp deploy
```

デプロイ後のURL例:
- `https://oauth.<subdomain>.workers.dev`
- `https://api-mcp.<subdomain>.workers.dev`

### 4-7. MCPフロー動作確認（Claude web版）

1. ClaudeのMCP設定に `https://api-mcp.<subdomain>.workers.dev/mcp` を追加
2. Claudeが自動でDiscovery → DCR → `/authorize` を開く
3. ブラウザでログイン → 同意 → 認可コード発行
4. Claudeがトークンを取得してMCPアクセス成功を確認

---

## フェーズ5: Webフロントエンド（BFF追加 + SPA）

### 目標
ブラウザからOAuthログインしてSPAが動作する状態にする。

### 5-1. api-mcp に BFFエンドポイントを追加

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

### 5-2. `apps/web` — 共通ライブラリ

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

### 5-3. `apps/web` — ルーティング

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

### 5-4. ローカル動作確認

```bash
# OAuthサーバーとapi-mcpをローカル起動
pnpm -F @mcp-oauth/oauth dev      # http://localhost:8787
pnpm -F @mcp-oauth/api-mcp dev    # http://localhost:8788

# webを起動
pnpm -F @mcp-oauth/web dev        # http://localhost:5173
```

ブラウザで `http://localhost:5173` にアクセスし、OAuthフローが完結することを確認する。

### 5-5. Cloudflareデプロイ（web）

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
| 高 | `apps/oauth/src/libs/` と `apps/web/.../pkce.ts` の全関数 | 純粋関数・副作用なし・テストが容易 |
| 高 | `token/service.ts` | PKCE検証・Rotationなど複雑なロジック |
| 高 | JWT生成・検証（`domains/jwt`） | セキュリティ上重要 |
| 中 | 各 service.ts のバリデーション | ビジネスロジックの保護 |
| 低 | repository.ts | D1モックが複雑になるため結合テストで代替 |

### テストコマンド

```bash
pnpm -F @mcp-oauth/oauth test
pnpm -F @mcp-oauth/api-mcp test
pnpm -F @mcp-oauth/web test
```

---

## 実装チェックリスト

### フェーズ0: 環境セットアップ
- [ ] 各アプリ・パッケージの依存パッケージインストール
- [ ] `.dev.vars` に JWT_SECRET を設定
- [ ] `pnpm dev` で全アプリが起動する

### フェーズ1: 共有パッケージ
- [ ] DB_OAUTH スキーマ定義
- [ ] DB_API_MCP スキーマ定義
- [ ] マイグレーション生成・ローカル適用
- [ ] シーダー実装・実行
- [ ] `apps/oauth/src/libs/` ユーティリティ実装・テスト
- [ ] `apps/web/app/shared/lib/pkce.ts` 実装・テスト

### フェーズ2: OAuthサーバー
- [ ] `GET /.well-known/oauth-authorization-server`
- [ ] `domains/jwt` 実装・テスト
- [ ] `POST /register` 実装・テスト
- [ ] `GET /authorize` ログイン・同意画面HTML
- [ ] `POST /authorize/login` 実装・テスト
- [ ] `POST /authorize/consent` 実装・テスト
- [ ] `POST /token` (authorization_code) 実装・テスト
- [ ] `POST /token` (refresh_token) 実装・テスト

### フェーズ3: api-mcpサーバー
- [ ] `GET /.well-known/oauth-protected-resource`
- [ ] `middlewares/auth-middleware.ts`（JWT 検証）実装・テスト
- [ ] `libs/coingecko.ts`（公式 SDK ラッパー）
- [ ] `libs/frankfurter.ts`（fetch ラッパー + zod 検証）
- [ ] `schemas/dto/fx.ts`, `schemas/dto/crypto.ts`（zod スキーマ）
- [ ] `domains/fx`, `domains/crypto`（共通データ層）実装・テスト
- [ ] Web API: `GET /api/fx/rate`
- [ ] Web API: `GET /api/fx/convert`
- [ ] Web API: `GET /api/fx/history`
- [ ] Web API: `GET /api/crypto/price`
- [ ] Web API: `GET /api/crypto/market`
- [ ] Web API: `GET /api/crypto/history`
- [ ] MCP Tool: `get_fx_rate`
- [ ] MCP Tool: `convert_currency`
- [ ] MCP Tool: `get_fx_history`
- [ ] MCP Tool: `get_crypto_price`
- [ ] MCP Tool: `get_crypto_market`
- [ ] MCP Tool: `get_crypto_history`
- [ ] MCP Prompt: `daily_market_brief`（日本語）
- [ ] MCP Prompt: `crypto_deep_dive`（日本語）
- [ ] `GET /mcp` / `POST /mcp` 実装（`@hono/mcp` + Tool/Prompt 登録）

### フェーズ4: Cloudflareセットアップ・デプロイ
- [ ] `wrangler login`
- [ ] `wrangler d1 create oauth-db` → `wrangler.jsonc` に `database_id` を設定
- [ ] `wrangler d1 create api-mcp-db` → `wrangler.jsonc` に `database_id` を設定
- [ ] `wrangler secret put JWT_SECRET` （oauth・api-mcp 両方）
- [ ] 本番D1にマイグレーション適用
- [ ] 本番D1にシード投入
- [ ] oauth・api-mcp デプロイ
- [ ] Claude web版からMCP接続確認

### フェーズ5: Webフロントエンド
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
- [ ] api-mcp 再デプロイ（BFF追加分）・web デプロイ
