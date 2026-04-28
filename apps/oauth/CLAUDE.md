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
  index.tsx                ← Hono アプリ定義・OpenAPI・ルート登録
  types.ts                 ← Bindings / Variables / AppEnv
  schemas/dto/             ← API リクエスト/レスポンスの zod スキーマ
  domains/
    jwt/index.ts           ← JWT 生成・検証
  libs/
    token.ts               ← 認可コード/リフレッシュトークン生成
  routes/
    well-known/get.ts      ← GET /.well-known/oauth-authorization-server
    register/              ← POST /register（DCR）
    authorize/             ← GET /authorize / POST /authorize/login / consent
    token/                 ← POST /token
```

開発時に確認できる URL:
- `GET /.well-known/oauth-authorization-server` — Discovery
- `GET /docs` — Swagger UI
- `GET /docs/openapi.json` — OpenAPI スキーマ

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

### Controller は Hono サブアプリを default export

api-mcp と同じパターンに揃えている（OpenAPI ドキュメント生成のため）。

```ts
import { describeRoute, resolver, validator } from 'hono-openapi'
import { schemaXxx } from '../../schemas/dto'
import type { AppEnv } from '../../types'

const route = new Hono<AppEnv>().post(
  '/',
  describeRoute({
    tags: ['xxx'],
    summary: '...',
    responses: {
      200: { content: { 'application/json': { schema: resolver(schemaXxx) } } },
    },
  }),
  validator('json', requestSchema, (result, c) => {
    if (!result.success) return c.json({ error: '...' }, 400)
  }),
  async (c) => {
    const body = c.req.valid('json')
    // ...
  },
)

export default route
```

### ルート登録（Hono RPC 用にチェーン）

`index.tsx` で `app.route(...).route(...)` のチェーンに繋ぐ。
途中で代入を挟むと AppType の型推論が壊れるので注意。

### OpenAPI

api-mcp と同じく:
- `describeRoute` / `resolver` / `validator` は `hono-openapi` から
- 共有 zod スキーマは `src/schemas/dto/` に置く
- `/docs/openapi.json` で OpenAPI 3.0 スキーマ自動生成
- `/docs` で Swagger UI

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

## 関連ドキュメント

- `docs/02-oauth-flow.md` — フロー全体像
- `docs/04-database.md` — DB スキーマ詳細
- `docs/06-jwt-tokens.md` — JWT 設計
- `docs/learning/oauth-flow-guide.md` — 学習用ガイド
- `docs/learning/oauth-clients.md` — DCR vs 事前登録の判断
