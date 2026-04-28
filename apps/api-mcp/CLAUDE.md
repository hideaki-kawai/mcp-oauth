# apps/api-mcp

MCP サーバー兼 Web SPA の BFF（Backend For Frontend）。

ルートの `CLAUDE.md` / `AGENTS.md` をまず読むこと。ここはこのアプリ固有の事項のみ記載する。

## 役割

- **MCP サーバー**: Claude からのツール/リソース呼び出しを `/mcp` で受ける（@hono/mcp）
- **BFF**: Web SPA の `/api/*` リクエストを受けて oauth Worker と連携
- **OAuth Resource Server**: JWT 検証で認証されたリクエストのみ処理
- DB: `api-mcp-db`（アプリ固有データ。現在は空）

## 起動

```bash
pnpm -F @mcp-oauth/api-mcp dev    # http://localhost:30001
```

開発時に確認できる URL:
- `GET /api/health` — ヘルスチェック
- `GET /docs` — Swagger UI
- `GET /docs/openapi.json` — OpenAPI スキーマ

## エンドポイント設計

```
apps/api-mcp/src/
  index.tsx                ← Hono アプリ・OpenAPI 設定・AppType export
  types.ts                 ← Bindings / Variables / AppEnv
  schemas/
    dto/                   ← API リクエスト/レスポンスの zod スキーマ（Web と共有）
  routes/
    health/get.ts          ← GET /api/health（サンプル）
    api/auth/              ← BFF: /api/auth/{token,refresh,logout}
    mcp/                   ← MCP プロトコル
    well-known/            ← /.well-known/oauth-protected-resource
  domains/
    auth/middleware.ts     ← JWT 検証ミドルウェア
```

## 規約

### Hono RPC のためのルート登録

Web からこのサーバーを `hc<AppType>(BASE_URL)` で型安全に叩けるようにするため、
**`app.route(...)` のチェーンを途切れさせない**。

```ts
// ✅ OK（チェーンが繋がっているので AppType の型が完全に通る）
export const routes = app
  .route('/api', healthRoute)
  .route('/api/auth', tokenRoute)
  .route('/mcp', mcpRoute)

export type AppType = typeof routes

// ❌ NG（途中で代入を挟むと型情報が失われる）
app.route('/api', healthRoute)
app.route('/api/auth', tokenRoute)
export type AppType = typeof app  // ← 型が空になる
```

### コントローラーは Hono サブアプリを export

各 `*.ts`（get/post）は `new Hono<AppEnv>().get(...)` の形でサブアプリを返し、
`index.tsx` の `app.route()` でマウントする。

```ts
const route = new Hono<AppEnv>().get(
  '/health',
  describeRoute({ /* OpenAPI */ }),
  validator('json', schema),  // POST 等で使う
  (c) => { /* ... */ },
)
export default route
```

### OpenAPI（hono-openapi）

`describeRoute` でドキュメント情報を宣言、`resolver(zodSchema)` で OpenAPI スキーマ自動生成。

```ts
import { describeRoute, resolver, validator } from 'hono-openapi'

describeRoute({
  tags: ['health'],
  summary: '...',
  responses: {
    200: {
      description: '...',
      content: { 'application/json': { schema: resolver(healthResponseSchema) } },
    },
  },
})
```

zod-openapi ではなく **hono-openapi** を使うことに注意。

### DTO スキーマの共有

Web と共通で使う zod スキーマは `src/schemas/dto/` に置き、`index.ts` から re-export。
`package.json` で `"./dto": "./src/schemas/dto/index.ts"` を export しているので、
Web からは `import type { ... } from '@mcp-oauth/api-mcp/dto'` で型のみ参照できる。

### import パス: 相対パス必須

apps/oauth と同じ理由で routes/ 配下は相対パス。

```ts
// ✅ OK
import type { AppEnv } from '../../types'

// ❌ NG
import type { AppEnv } from '@/types'
```

### Bindings

`src/types.ts` で定義:

| キー | ソース | 用途 |
|-----|-------|------|
| `DB_API_MCP` | wrangler.jsonc | D1（アプリ固有データ用） |
| `OAUTH_SERVICE` | wrangler.jsonc | oauth Worker への Service Binding |
| `API_MCP_BASE_URL` | vars | 自身の URL |
| `OAUTH_ISSUER` | vars | OAuth サーバー URL（JWT issuer 検証） |
| `JWT_SECRET` | secret | OAuth と共有 |

### oauth Worker への通信

直接 fetch ではなく **Service Binding 経由**。

```ts
// ✅ OK（同アカウント Worker 間通信）
const res = await c.env.OAUTH_SERVICE.fetch('http://oauth/token', { ... })

// ❌ NG（同アカウント Worker への HTTPS fetch は不可）
const res = await fetch('https://oauth.workers.dev/token', { ... })
```

ローカル開発時も `wrangler dev` が自動でローカル oauth に繋いでくれる。

## 関連ドキュメント

- `docs/03-endpoints.md` — エンドポイント設計
- `docs/06-jwt-tokens.md` — JWT 検証ロジック
- `docs/learning/oauth-flow-guide.md` — 全体フロー
