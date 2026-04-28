# apps/oauth

OAuth 2.1 認可サーバー（Authorization Server）。

ルートの `CLAUDE.md` / `AGENTS.md` をまず読むこと。ここはこのアプリ固有の事項のみ記載する。

## 役割

- OAuth 2.1 Authorization Server（RFC 6749 / 7636 / 8414）
- Claude (MCP)・Web SPA の両方を 1 つのサーバーで捌く
- 全ユーザー認証・トークン発行・DCR を担当
- DB: `oauth-db`（users / oauth_clients / authorization_codes / refresh_tokens）

## 起動

```bash
pnpm -F @mcp-oauth/oauth dev    # http://localhost:30002
```

## エンドポイント設計

```
apps/oauth/src/
  index.tsx                ← Hono アプリ定義・ルート登録
  types.ts                 ← Bindings 型定義
  domains/
    jwt/index.ts           ← JWT 生成・検証（フェーズ 2-2）
  libs/
    token.ts               ← 認可コード/リフレッシュトークン生成
  routes/
    well-known/get.ts      ← ✅ GET /.well-known/oauth-authorization-server
    register/              ← POST /register（DCR、フェーズ 2-3）
    authorize/             ← GET /authorize / POST /authorize/login / consent（フェーズ 2-4〜6）
    token/                 ← POST /token（フェーズ 2-7）
```

## 規約

### import パス: 相対パス必須

`@/` エイリアスは tsconfig には定義されているが、**vite-plugin-cloudflare の workerd ランナーが解決できない**。
routes/ 配下からの import は必ず相対パスにする。

```ts
// ✅ OK
import type { Bindings } from '../../types'

// ❌ NG（dev 時にランタイムエラー）
import type { Bindings } from '@/types'
```

### Controller は static class

`AGENTS.md` の「Class + static メソッド」方針に従う。Hono の handler も class の static メソッドとして書く。

```ts
export class WellKnownController {
  static getAuthorizationServerMetadata(c: Context<{ Bindings: Bindings }>) {
    return c.json({ /* ... */ })
  }
}
```

### ルート登録

`index.tsx` で `app.get(path, Controller.method)` を直接呼ぶ。
（api-mcp のような Hono RPC 用の `app.route(...).route(...)` チェーンは不要。
oauth は Web から Hono RPC で呼ばれない＝OAuth 標準仕様の HTTP エンドポイント）

### Bindings

`src/types.ts` で定義:

| キー | ソース | 用途 |
|-----|-------|------|
| `DB_OAUTH` | wrangler.jsonc | D1 |
| `OAUTH_ISSUER` | wrangler.jsonc vars | issuer/audience |
| `ENVIRONMENT` | wrangler.jsonc vars | 環境識別 |
| `JWT_SECRET` | .dev.vars / wrangler secret | JWT 署名鍵 |

新しい Binding を追加するときは `src/types.ts` も忘れず更新。

### DB アクセス

- Repository から `c.env.DB_OAUTH` 経由でアクセス
- スキーマは `@mcp-oauth/database/oauth` から import

### パスワードハッシュ

`@mcp-oauth/utils` の `hashPassword` / `verifyPassword`（PBKDF2 + SHA-256）を使う。
シーダーと同じ実装を共有しているため、フォーマット差異が出ない。

## 実装フェーズ進捗

| フェーズ | 内容 | 状態 |
|---------|------|------|
| 2-1 | GET /.well-known/oauth-authorization-server | ✅ |
| 2-2 | JWT 生成・検証（domains/jwt） | ⏳ |
| 2-3 | POST /register（DCR） | ⏳ |
| 2-4 | GET /authorize | ⏳ |
| 2-5 | POST /authorize/login | ⏳ |
| 2-6 | POST /authorize/consent | ⏳ |
| 2-7 | POST /token（authorization_code / refresh_token） | ⏳ |

進捗の詳細は `docs/07-implementation-plan.md` を参照。

## 関連ドキュメント

- `docs/02-oauth-flow.md` — フロー全体像
- `docs/04-database.md` — DB スキーマ詳細
- `docs/06-jwt-tokens.md` — JWT 設計
- `docs/learning/oauth-flow-guide.md` — 学習用ガイド
- `docs/learning/oauth-clients.md` — DCR vs 事前登録の判断
