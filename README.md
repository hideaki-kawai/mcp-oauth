# mcp-oauth

MCPサーバー + WebAPI（`apps/api-mcp`）とOAuthサーバー（`apps/oauth`）、
Webフロントエンド（`apps/web`）のモノレポ。

ClaudeからMCPサーバーへのアクセスと、通常のWebアプリを同一のOAuth認証基盤で管理する。
OAuth 2.1 準拠（PKCE + DCR + リフレッシュトークン Rotation）。

## 構成

```
apps/
  api-mcp/  - MCPサーバー + Web API + BFF (Cloudflare Workers + Hono)
  oauth/    - OAuth 2.1 認証・認可サーバー (Cloudflare Workers + Hono)
  web/      - Webフロントエンド (React Router v7 SPA)
packages/
  database/   - Drizzle ORM + Cloudflare D1（DB_OAUTH / DB_API_MCP）
  types/      - 共通型定義 (Result<T>)
  constants/  - 共通定数（OAUTH_PATHS / API_MCP_PATHS / WEB_PATHS）
  utils/      - 共通ユーティリティ（複数アプリ横断のみ）
```

## ローカル開発セットアップ

### 1. 依存パッケージインストール

```bash
pnpm install
```

### 2. シークレット設定

`apps/oauth/.dev.vars` と `apps/api-mcp/.dev.vars` を作成する（gitignore済み）。
両ファイルに **同じ** `JWT_SECRET` を設定すること。

```bash
# JWT_SECRET を生成してコピーする
openssl rand -base64 32
```

```bash
# apps/oauth/.dev.vars
JWT_SECRET=<上で生成した値>

# apps/api-mcp/.dev.vars
JWT_SECRET=<同じ値>
```

### 3. ローカルDBのマイグレーション

```bash
# OAuthサーバーのDB（users / oauth_clients / authorization_codes / refresh_tokens）
pnpm -F @mcp-oauth/oauth db:migrate:local

# api-mcpのDB
pnpm -F @mcp-oauth/api-mcp db:migrate:local
```

> マイグレーションSQLが存在しない場合は先に生成する:
> ```bash
> pnpm -F @mcp-oauth/database db:generate:oauth
> pnpm -F @mcp-oauth/database db:generate:mcp
> ```

### 4. 初期データ投入（シード）

```bash
pnpm -F @mcp-oauth/database db:seed
# 投入される内容:
#   ユーザー: admin@example.com / password
#   OAuthクライアント: web-client
```

### 5. Web の環境変数

`apps/web/.env.local` を作成する（gitignore済み）:

```bash
VITE_API_BASE_URL=http://localhost:30001
VITE_OAUTH_BASE_URL=http://localhost:30002
VITE_WEB_BASE_URL=http://localhost:30000
```

### 6. 起動

```bash
pnpm dev
# web      → http://localhost:30000
# api-mcp  → http://localhost:30001
# oauth    → http://localhost:30002
```

ブラウザで `http://localhost:30000` を開き、`admin@example.com` / `password` でログインできれば完了。

## コマンド

```bash
# 開発
pnpm dev                                          # 全アプリ起動
pnpm -F @mcp-oauth/api-mcp dev                   # api-mcpのみ
pnpm -F @mcp-oauth/oauth dev                     # OAuthサーバーのみ
pnpm -F @mcp-oauth/web dev                       # Webフロントエンドのみ

# ビルド・品質チェック
pnpm build && pnpm format && pnpm lint:check

# DBマイグレーション（SQLファイル生成）
pnpm -F @mcp-oauth/database db:generate:oauth
pnpm -F @mcp-oauth/database db:generate:mcp

# DBマイグレーション適用
pnpm -F @mcp-oauth/oauth db:migrate:local        # ローカルD1
pnpm -F @mcp-oauth/oauth db:migrate:remote       # Cloudflare D1（本番）
pnpm -F @mcp-oauth/api-mcp db:migrate:local
pnpm -F @mcp-oauth/api-mcp db:migrate:remote

# シード投入
pnpm -F @mcp-oauth/database db:seed

# デプロイ
pnpm -F @mcp-oauth/oauth deploy
pnpm -F @mcp-oauth/api-mcp deploy
pnpm -F @mcp-oauth/web deploy
```

## 技術スタック

- **Runtime**: Cloudflare Workers
- **Backend Framework**: Hono v4（Hono RPC で型安全なAPI通信）
- **Frontend**: React Router v7 SPA（SSR: false）+ Tailwind CSS v4
- **Database**: Cloudflare D1 (SQLite) + Drizzle ORM
- **Auth**: OAuth 2.1 + PKCE + DCR（JWT / HS256、アクセストークン5分）
- **Build**: Turborepo + pnpm workspaces
- **Lint/Format**: Biome

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/01-overview.md](./docs/01-overview.md) | システム概要 |
| [docs/02-oauth-flow.md](./docs/02-oauth-flow.md) | OAuthフロー（PKCE + DCR） |
| [docs/03-endpoints.md](./docs/03-endpoints.md) | エンドポイント一覧・SPA実装ガイド |
| [docs/04-database.md](./docs/04-database.md) | DB設計 |
| [docs/05-screens.md](./docs/05-screens.md) | 画面設計（Tailwind CSS） |
| [docs/06-jwt-tokens.md](./docs/06-jwt-tokens.md) | JWTトークン設計 |
| [docs/07-implementation-plan.md](./docs/07-implementation-plan.md) | 実装計画・チェックリスト |

`docs/learning/` — OAuth フローや仕様の学習用メモ
