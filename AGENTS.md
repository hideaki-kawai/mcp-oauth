# AGENTS.md

このファイルはAIエージェント（GitHub Copilot、Cursor、Claude等）向けの指示書です。

## コーディング規約（最重要）

- **アーキテクチャ**: バーティカルスライスアーキテクチャ（Controller → Service → Repository）
- **Class + static メソッド**: 全レイヤーで統一使用
- **Result型**: service/repository の戻り値は必ず `Result<T>` 型（`@mcp-oauth/types`）
- **日本語**: コメント・ドキュメントは日本語で記述

## Build & Dev Commands

```bash
pnpm dev                                         # 全アプリ起動
pnpm -F @mcp-oauth/api-mcp dev                  # api-mcpサーバーのみ
pnpm -F @mcp-oauth/oauth dev                    # OAuthサーバーのみ
pnpm -F @mcp-oauth/web dev                      # Webフロントエンドのみ
pnpm build && pnpm format && pnpm lint:check
pnpm -F @mcp-oauth/database db:generate:mcp     # api-mcp DB マイグレーションSQL生成
pnpm -F @mcp-oauth/database db:generate:oauth   # OAuth DB マイグレーションSQL生成
pnpm -F @mcp-oauth/api-mcp db:migrate:local     # api-mcp DB マイグレーション適用（ローカルD1）
pnpm -F @mcp-oauth/api-mcp db:migrate:remote    # api-mcp DB マイグレーション適用（Cloudflare D1）
pnpm -F @mcp-oauth/oauth db:migrate:local       # OAuth DB マイグレーション適用（ローカルD1）
pnpm -F @mcp-oauth/oauth db:migrate:remote      # OAuth DB マイグレーション適用（Cloudflare D1）
pnpm -F @mcp-oauth/database db:seed             # 初期データ投入
```

## プロジェクト構成

**Monorepo** (pnpm workspaces + Turborepo)

| App | Runtime | Purpose |
|-----|---------|---------|
| `apps/api-mcp` (`@mcp-oauth/api-mcp`) | Cloudflare Workers | MCPサーバー + Web API |
| `apps/oauth` (`@mcp-oauth/oauth`) | Cloudflare Workers | OAuth 認証・認可サーバー |
| `apps/web` (`@mcp-oauth/web`) | React Router v7 SPA | Webフロントエンド |

| Package | Purpose |
|---------|---------|
| `packages/database` | Drizzle ORM + Cloudflare D1 |
| `packages/types` | `Result<T>` 型 |
| `packages/constants` | 共通定数 |
| `packages/utils` | 共通ユーティリティ |

### バックエンド: バーティカルスライス

```
routes/v1/auth/login/
  post.ts        ← Controller (Hono, validator)
  service.ts     ← Business logic (static class)
  repository.ts  ← DB ops (static class)
```

- Controller → Service → Repository（スキップ禁止）
- 横断ロジックは `domains/`、外部API wrapperは `libs/`

### トークン管理

| 利用場面 | アクセストークン | リフレッシュトークン |
|---------|----------------|-------------------|
| Claude（MCP） | MCPクライアント管理 | MCPクライアント管理 |
| Webブラウザ | メモリ（React state） | httpOnly Cookie |
| OAuth同意フロー | httpOnly Cookie | httpOnly Cookie + DB |

### パスエイリアス

| App | Alias | 解決先 |
|-----|-------|--------|
| api-mcp | `@/` | `src/` |
| oauth | `@/` | `src/` |
| web | `~/` | `app/` |

## 禁止事項

- `as` による型キャスト
- Controller から Repository の直接呼び出し
- 異なる機能グループ間での service/repository 共有
- パスのハードコード（`PATHS` 定数を使用）

## 推奨事項

- 日本語でコメント・ドキュメントを記述
- 不明点は推測せず質問する
