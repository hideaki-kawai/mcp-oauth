# Hono の AppEnv パターン（Bindings / Variables の使い分け）

Hono の `new Hono<AppEnv>()` に渡す型が何をしているかを整理する。
このプロジェクトでは `apps/oauth` と `apps/api-mcp` の両方で同じパターンを使っている。

関連: `apps/oauth/src/types.ts` / `apps/api-mcp/src/types.ts`

---

## 1. 一言で言うと

`Bindings` は「外から注入される環境変数」、`Variables` は「リクエスト処理中にミドルウェアが詰める値」。
両方を `AppEnv` にまとめて `Hono<AppEnv>` に渡すと、アプリ全体で型安全にアクセスできるようになる。

---

## 2. Bindings と Variables の違い

| 観点 | `Bindings` | `Variables` |
|------|-----------|-------------|
| **誰がセットするか** | Cloudflare（wrangler.jsonc / `.dev.vars` / シークレット） | ミドルウェアが `c.set()` で詰める |
| **いつ決まるか** | Worker 起動時（デプロイ時点で確定） | リクエストごと（ハンドラー実行中に動的） |
| **アクセス方法** | `c.env.XXX` | `c.get('xxx')` |
| **値の性質** | DB 接続・シークレット等のインフラ資源 | 認証情報・パース結果等のリクエスト固有データ |
| **可変性** | 不変（リクエスト中に変わらない） | ミドルウェアが動的にセット |

### リクエストのライフサイクルで見ると

```
リクエスト着信
  │
  ├─ c.env.DB_OAUTH        ← Bindings: 最初から使える
  ├─ c.env.JWT_SECRET       ← Bindings: 最初から使える
  │
  ▼
[認証ミドルウェア]
  │  JWT を検証 → c.set('oauthSession', payload)
  │
  ▼
[ハンドラー]
     c.get('oauthSession')  ← Variables: ミドルウェアの後から使える
```

---

## 3. このプロジェクトでの具体例

### 3-1. apps/oauth

```ts
// apps/oauth/src/types.ts
type Bindings = {
  DB_OAUTH: D1Database      // OAuth 用 D1 データベース
  OAUTH_ISSUER: string      // 自身の URL（issuer / audience 判定）
  ENVIRONMENT: Environment  // production / development
  JWT_SECRET: string        // JWT 署名鍵
}

type Variables = {
  oauthSession?: OAuthSessionPayload  // 認証ミドルウェアが JWT を検証して詰める
}
```

### 3-2. apps/api-mcp

```ts
// apps/api-mcp/src/types.ts
type Bindings = {
  DB_API_MCP: D1Database    // アプリ固有データ用 D1
  OAUTH_SERVICE: Fetcher    // oauth Worker への Service Binding
  API_MCP_BASE_URL: string  // 自身の URL
  OAUTH_ISSUER: string      // OAuth サーバーの URL
  ENVIRONMENT: Environment  // production / development
  JWT_SECRET: string        // JWT 署名鍵（OAuth と共有）
}

type Variables = {
  user?: AccessTokenPayload  // authMiddleware が JWT 検証成功時にセット
}
```

### 共通点と違い

| | `apps/oauth` | `apps/api-mcp` |
|---|---|---|
| **DB** | `DB_OAUTH`（OAuth 関連） | `DB_API_MCP`（アプリ固有） |
| **Service Binding** | なし | `OAUTH_SERVICE`（oauth Worker への内部通信） |
| **Variables の中身** | `oauthSession`（OAuth セッション） | `user`（認証済みユーザー情報） |

Worker ごとに Bindings も Variables も異なるが、パターン（`types.ts → AppEnv → Hono<AppEnv>`）は統一されている。

---

## 4. なぜこの設計なのか

### 理由 1: 型安全

`Bindings` と `Variables` を型で宣言しておくと、以下がコンパイル時に検査される:

- `c.env.DB_OAUTH` のタイポ → 型エラー
- `c.get('oauthSession')` の戻り値型 → 自動推論
- 存在しないキーへのアクセス → 型エラー

型を宣言しないと `c.env` が `any` になり、ランタイムまでミスに気づけない。

### 理由 2: Cloudflare Workers のアーキテクチャに沿っている

従来のサーバー（Express / Node.js）では `process.env` でグローバルに環境変数を読めるが、
Cloudflare Workers は **リクエストハンドラーの引数で `env` が渡される**設計:

```ts
// Workers のネイティブ API
export default {
  async fetch(request: Request, env: Env) {
    // ← env はここで渡される（グローバル変数ではない）
  }
}
```

Hono はこれを `c.env` にマッピングしてくれる。`Bindings` はこの `env` の型宣言にあたる。

### 理由 3: ミドルウェアチェーンの型伝播

Hono では `c.set()` で詰めた値が後続のハンドラーで `c.get()` できるが、
`Variables` で型宣言しておかないと何が入っているかわからない。
「このルートに到達する時点で `oauthSession` が必ずある」という前提を型で表現できる。

---

## 5. Express / Fastify との対比

| Hono | Express | Fastify | 説明 |
|------|---------|---------|------|
| `c.env` (Bindings) | `process.env` | `fastify.config` | 環境変数・外部リソース |
| `c.get/set` (Variables) | `req.user` 等の拡張 | `request.user` | リクエストスコープの付加情報 |
| `AppEnv` ジェネリクス | `@types/express` 拡張 | TypeBox / JSON Schema | 型安全の仕組み |

Express では `req` オブジェクトにプロパティを直接生やすのが慣例だが、型安全ではない（`@types/express` の declaration merging が必要）。
Hono は最初からジェネリクスで設計されているため、追加の型定義なしに `c.set/get` が型安全になる。

---

## 6. 新しい Binding / Variable を追加するときの手順

### Binding を追加する場合

1. `wrangler.jsonc` に変数 / シークレット / D1 / Service Binding を追加
2. `src/types.ts` の `Bindings` 型にプロパティを追加
3. 開発用は `.dev.vars` にも追加（シークレット系）

### Variable を追加する場合

1. `src/types.ts` の `Variables` 型にプロパティを追加
2. ミドルウェアで `c.set('key', value)` するコードを実装
3. ハンドラーで `c.get('key')` で取り出す

いずれの場合も **`src/types.ts` の更新を忘れると型安全が壊れる**ので注意。

---

## まとめ

| 問い | 答え |
|------|------|
| Bindings とは？ | Cloudflare が注入する環境変数・DB 接続などのインフラ資源（`c.env` でアクセス） |
| Variables とは？ | ミドルウェアがリクエスト処理中に `c.set()` で詰めるリクエストスコープの値（`c.get()` でアクセス） |
| なぜ分かれているのか？ | ライフサイクルが異なる（デプロイ時確定 vs リクエストごと動的） |
| AppEnv の役割は？ | 両方を束ねて `Hono<AppEnv>` に渡すことでアプリ全体を型安全にする |
| Express との違いは？ | Express は `req` に直接プロパティを生やすが、Hono はジェネリクスで最初から型安全 |
| 追加時の注意は？ | `wrangler.jsonc` だけでなく `src/types.ts` の型も必ず更新する |
