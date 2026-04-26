# システム概要

## 何を作るか

ClaudeがMCPサーバーのツールやリソースを使えるようにする認証・認可システムと、
同じ認証基盤を使うWebアプリ。

```
Claude (MCPクライアント)
    ↓ MCPリクエスト（JWT検証）
┌─────────────────────────┐
│  apps/api-mcp           │  ← Cloudflare Workers + Hono
│  ・MCPエンドポイント      │
│  ・Web API（SPA向け）    │
│  ・BFF（トークン管理）   │
└─────────────────────────┘

apps/web  ← React Router v7 SPA（SSR: false）
    ↕ API呼び出し（JWT）

apps/oauth  ← Cloudflare Workers + Hono
    ・ログイン画面・同意画面（HTML を Hono が返す）
    ・JWT発行・リフレッシュトークン管理
    ↑ ユーザーがブラウザでログイン・許可
```

## アプリ構成

| App | Runtime | 役割 |
|-----|---------|------|
| `apps/api-mcp` | Cloudflare Workers + Hono | MCPサーバー + Web API + BFF |
| `apps/web` | React Router v7 SPA | Webフロントエンド |
| `apps/oauth` | Cloudflare Workers + Hono | OAuthサーバー（認証・認可） |

## 技術前提

| 項目 | 内容 |
|------|------|
| アクセストークン | JWT（HS256）、有効期限 **5分**、DBに保存しない |
| リフレッシュトークン | ランダム文字列、有効期限 **30日**、DBに保存 |
| 認可コード | ランダム文字列、有効期限 **10分**、DBに保存・使い捨て |
| OAuthセッション | JWT（HS256）、有効期限 **7日**、DBに保存しない |
| パスワード | PBKDF2ハッシュ（`crypto.subtle`、Workers ネイティブ） |
| 初期ユーザー | DBシーダーで投入済み |
| スコープ | `read` / `write` |

## OAuthセッションとは

OAuthサーバーの**ログイン画面 → 同意画面**の間だけ必要な認証状態。
目的は「このブラウザはログイン済み → 同意画面を表示していい」の判定のみ。

```
ログイン成功 → OAuthセッションJWT（7日）を httpOnly Cookie にセット
     ↓
次回 /authorize アクセス時にCookieを確認
  → JWT有効 → ログインをスキップして同意画面へ
  → JWT無効 → ログイン画面へ
```

**有効期限を7日にする理由：**
Claude→ChatGPT→Cursor など複数のMCPクライアントを続けて接続する際に、
毎回ログインを求めない。7日以内なら「許可するかどうか」の画面だけ表示される。

> OAuthセッションはOAuthサーバー（`oauth.example.com`）のCookieのみに存在する。
> api-mcpやSPAとは共有しない。追加インフラ（KV等）も不要。

## トークン管理の全体像

| 利用場面 | アクセストークン | リフレッシュトークン |
|---------|----------------|-------------------|
| Claude（MCP） | MCPクライアント管理 | MCPクライアント管理 |
| Webブラウザ（SPA） | メモリ（React state） | httpOnly Cookie（api-mcp発行） |
| OAuthフロー中のブラウザ | — | — |

> SPAのリフレッシュトークンは api-mcp がBFFとして httpOnly Cookie にセットする。
> SPAはJavaScriptからリフレッシュトークンに触れない。

## なぜJWT + 共有シークレットか

```
[OAuthサーバー] JWT_SECRET で署名 → アクセストークン発行
[api-mcpサーバー] JWT_SECRET で検証 → ローカルで完結（HTTPコール不要）
```

`wrangler secret put JWT_SECRET` で両Workerに同じ値を設定する。
