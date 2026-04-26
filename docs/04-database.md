# データベース設計

api-mcpサーバーとOAuthサーバーでそれぞれ別のCloudflare D1データベースを使用する。

## OAuthサーバー DB（`DB_OAUTH`）

### `users` テーブル
初期ユーザーはシーダーで投入する。

| カラム | 型 | 説明 |
|-------|-----|------|
| `id` | TEXT PK | nanoid |
| `email` | TEXT UNIQUE NOT NULL | メールアドレス |
| `password_hash` | TEXT NOT NULL | bcryptハッシュ |
| `created_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |
| `updated_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |

---

### `oauth_clients` テーブル
DCRで自動登録（Claude）、またはシーダーで登録（Webアプリ）。

| カラム | 型 | 説明 |
|-------|-----|------|
| `id` | TEXT PK | nanoid（client_id として使用） |
| `name` | TEXT NOT NULL | クライアント名（例: "Claude", "web"） |
| `redirect_uris` | TEXT NOT NULL | JSON配列 |
| `token_endpoint_auth_method` | TEXT NOT NULL | `"none"`（public client） |
| `scopes` | TEXT NOT NULL | スペース区切り（`"read write"`） |
| `created_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |

---

### `authorization_codes` テーブル
使い捨て・10分有効。使用後は削除せず `used_at` を記録する。

| カラム | 型 | 説明 |
|-------|-----|------|
| `code` | TEXT PK | ランダム文字列（32文字） |
| `client_id` | TEXT NOT NULL | → oauth_clients.id |
| `user_id` | TEXT NOT NULL | → users.id |
| `scopes` | TEXT NOT NULL | 許可されたスコープ |
| `redirect_uri` | TEXT NOT NULL | コールバックURL |
| `code_challenge` | TEXT NOT NULL | PKCE用ハッシュ |
| `expires_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |
| `used_at` | INTEGER | 使用日時（null = 未使用） |
| `created_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |

> `used_at` を記録することで、認可コード再利用攻撃を検知できる。
> 既に使用済みのコードが再度使われた場合は、不正アクセスの可能性があるため
> 発行済みトークンをすべて失効させる対応が可能。

---

### `refresh_tokens` テーブル
MCP用（Claude）、Web用（SPA）、同意フロー用（セッション）をすべて格納する。
`type` カラムで区別する。

| カラム | 型 | 説明 |
|-------|-----|------|
| `token` | TEXT PK | ランダム文字列（64文字） |
| `type` | TEXT NOT NULL | `"mcp"` / `"web"` / `"session"` |
| `client_id` | TEXT NOT NULL | → oauth_clients.id |
| `user_id` | TEXT NOT NULL | → users.id |
| `scopes` | TEXT NOT NULL | スコープ |
| `expires_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |
| `revoked_at` | INTEGER | 失効日時（null = 有効） |
| `created_at` | INTEGER NOT NULL | Unix タイムスタンプ（秒） |

> **Rotation**: リフレッシュトークンは使用のたびに新しいものに差し替える。
> 古いトークンが再利用された場合は盗難の可能性があるため、
> 同じユーザー・クライアントのトークンをすべて失効させる。

---

## api-mcpサーバー DB（`DB_API_MCP`）

MCPサーバーはJWTをローカル検証するためOAuth DBにアクセスしない。
このDBはapi-mcpサーバーが提供するアプリ固有のデータを格納する用途。

> 現時点では仮のテーブルのみ。実装内容に応じて追加する。

---

## シーダー設計

`pnpm -F @mcp-oauth/database db:seed` で実行する。

```typescript
// 投入されるユーザー
users: [
  { email: "admin@example.com", password: "password" }  // bcryptハッシュ化
]

// 投入されるOAuthクライアント（Webアプリ用・事前登録）
oauth_clients: [
  {
    id: "web-client",
    name: "web",
    redirect_uris: ["http://localhost:5173/auth/callback"],
    token_endpoint_auth_method: "none",
    scopes: "read write"
  }
]
```

---

## DBマイグレーション手順

```bash
# マイグレーションファイルを生成
pnpm -F @mcp-oauth/database db:generate:mcp
pnpm -F @mcp-oauth/database db:generate:oauth

# ローカルのD1に適用
npx wrangler d1 migrations apply api-mcp-db --local
npx wrangler d1 migrations apply oauth-db --local

# 本番D1に適用
npx wrangler d1 migrations apply api-mcp-db
npx wrangler d1 migrations apply oauth-db

# シーダー実行（初期ユーザー・Webクライアント投入）
pnpm -F @mcp-oauth/database db:seed
```
