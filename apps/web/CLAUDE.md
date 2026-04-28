# apps/web

React Router v7 SPA。OAuth 認証後のユーザー向け Web UI。

ルートの `CLAUDE.md` / `AGENTS.md` をまず読むこと。ここはこのアプリ固有の事項のみ記載する。

## 役割

- React Router v7 の **SPA モード**（`ssr: false`）
- Tailwind CSS v4 + shadcn/ui（必要に応じて導入）
- ユーザーがブラウザで操作する画面
- API 通信は **Hono RPC** で `@mcp-oauth/api-mcp` の `/api/*` BFF を叩く
- デプロイ: **Cloudflare Workers Static Assets**（Pages ではない）

## 起動

```bash
pnpm -F @mcp-oauth/web dev    # http://localhost:30000
```

## エンドポイント設計

```
apps/web/app/
  root.tsx                     ← ルートレイアウト
  routes.ts                    ← React Router のルート定義
  routes/
    login/                     ← /login（フェーズ 5-3）
    auth/callback/             ← /auth/callback（フェーズ 5-3）
    (private)/                 ← 認証必須ルート（フェーズ 5-3）
  shared/
    lib/
      api.ts                   ← ✅ Hono RPC クライアント
      pkce.ts                  ← ✅ PKCE / state 生成（フェーズ 1-3 で実装済み）
      auth-store.ts            ← トークンメモリ管理（フェーズ 5-2）
    middlewares/
      auth-context.ts          ← createContext<AuthUser>（フェーズ 5-2）
      auth-middleware.ts       ← clientMiddleware（フェーズ 5-2）
```

## 規約

### API 呼び出しは必ず `~/shared/lib/api.ts` 経由

直接 `fetch` を書かず、`hc<AppType>` クライアントを使う。
これにより:
- メソッド/パス/リクエストボディ/レスポンスが**全部 TypeScript で補完される**
- API 側の変更が型エラーで即検知される

```ts
import { api } from '~/shared/lib/api'

// ✅ OK
const res = await api.api.health.$get()
const data = await res.json() // → HealthResponse 型

// ❌ NG
const res = await fetch('http://localhost:30001/api/health')
const data = await res.json() // → any 型
```

### `@mcp-oauth/api-mcp` の import は型のみ

`@mcp-oauth/api-mcp` は **devDependencies** に入っている。
ランタイム依存ではなく、`AppType` の型推論のためだけに参照する。

```ts
// ✅ OK（型のみ import）
import type { AppType } from '@mcp-oauth/api-mcp'
import type { HealthResponse } from '@mcp-oauth/api-mcp/dto'

// ❌ NG（ランタイム import すると Worker のコードが Web の bundle に混入）
import { something } from '@mcp-oauth/api-mcp'
```

### 環境変数

| 変数 | 用途 | 例 |
|-----|------|-----|
| `VITE_API_BASE_URL` | api-mcp の URL | `http://localhost:30001` |

`.env.local` に書く。`.env.example` を参照。
ビルド時に Vite が `import.meta.env.VITE_*` を埋め込むため、**実行時に値を変更できない**点に注意。

### Cookie の扱い

`api.ts` で `credentials: 'include'` を付与している。
リフレッシュトークンが httpOnly Cookie で来るため、`fetch` する全リクエストでこれが必要。

### React Router v7 SPA モード

- `ssr: false` 固定（`react-router.config.ts`）
- ビルド出力は `build/client/` のみ（`build/server/` は出ない）
- Cloudflare Workers Static Assets として配信（`wrangler.jsonc` 参照）

`@react-router/serve` / `@react-router/node` は SSR 用なので将来削除候補（現状は据え置き）。

### path alias

`tsconfig.json` で `~/*` → `./app/*` を定義。
React Router の慣例なのでそのまま使う。

```ts
// ✅
import { api } from '~/shared/lib/api'
```

## デプロイ

```bash
pnpm -F @mcp-oauth/web deploy
```

`rm -rf .wrangler build` で古いアセットをクリーンしてから build & deploy する。

## 実装フェーズ進捗

| フェーズ | 内容 | 状態 |
|---------|------|------|
| 1-3 | shared/lib/pkce.ts | ✅ |
| Hono RPC | shared/lib/api.ts | ✅ |
| 5-2 | auth-store.ts / auth-context.ts / auth-middleware.ts | ⏳ |
| 5-3 | /login / /auth/callback / (private)/* | ⏳ |

進捗の詳細は `docs/07-implementation-plan.md` を参照。

## 関連ドキュメント

- `docs/03-endpoints.md` — BFF エンドポイント設計
- `docs/05-screens.md` — 画面設計
- `docs/learning/oauth-flow-guide.md` — フロー全体
