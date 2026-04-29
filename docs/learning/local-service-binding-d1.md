# ローカル開発での Service Binding と D1 分離問題

## TL;DR

本番 Cloudflare では Service Binding は同一 D1 を参照するが、
ローカル（`@cloudflare/vite-plugin` / `wrangler dev`）では
**Worker ごとに別の miniflare インスタンスが立ち上がり、D1 も別ファイルになる**。

---

## 1. 本番とローカルの挙動の違い

### 本番 Cloudflare

```
ブラウザ ──→ oauth Worker（/authorize）
              D1: oauth-db（Cloudflare 管理の単一 DB）
                ↑ 同じ DB
api-mcp Worker ──[Service Binding]──→ oauth Worker（/token）
              D1: oauth-db（同じ DB）
```

Service Binding は同一アカウント内の Worker を直接呼ぶ仕組みなので、
**D1 は1つ**で、認可コードが共有される。

### ローカル（`@cloudflare/vite-plugin` 使用時）

```
ブラウザ ──→ standalone oauth dev server（port 30002）
              miniflare instance A
              D1: apps/oauth/.wrangler/.../xxxxxxxx.sqlite  ← ファイル A

api-mcp dev server（port 30001）
  └─ [Service Binding: OAUTH_SERVICE]
       └─ oauth Worker（api-mcp プロセス内に別インスタンス）
              miniflare instance B
              D1: apps/oauth/.wrangler/.../yyyyyyyy.sqlite  ← ファイル B（別物！）
```

`@cloudflare/vite-plugin` は Service Binding の解決先として
**api-mcp のプロセス内に OAuth Worker を別途起動**する。
これは本番の挙動を再現するための設計だが、D1 の状態は共有されない。

### 何が壊れるか

1. ブラウザが `localhost:30002/authorize` でログイン → 認可コードが**ファイル A**に保存
2. BFF が Service Binding 経由で `/token` を呼ぶ → **ファイル B**を参照
3. コードが見つからない → `invalid_grant` → 認証失敗の無限ループ

---

## 2. 証拠: 2つの SQLite ファイル

`apps/oauth/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` を確認すると
同じ `oauth-db` データベースなのに2つの `.sqlite` ファイルが存在する。

```
fbc354df...sqlite  ← standalone oauth dev server が使うファイル
1c83bb9e...sqlite  ← api-mcp Service Binding の oauth インスタンスが使うファイル
```

ファイル名のハッシュは miniflare インスタンスの内部 ID から生成されるため、
同じ `database_name` でも別インスタンスなら別ファイルになる。

---

## 3. なぜ本番では起きないのか

Cloudflare の本番環境では Service Binding は HTTP 通信ではなく
**ランタイムレベルの直接呼び出し**（Worker-to-Worker RPC）で動作する。
同一アカウントの D1 データベースは Cloudflare のインフラ上で単一インスタンスとして管理されるため、
どのワーカーから参照しても同じデータが見える。

---

## 4. 今回の解決策: ローカルは HTTP で直接通信

`apps/api-mcp/.dev.vars` に `OAUTH_INTERNAL_URL=http://localhost:30002` を追加。

BFF の各サービス（token / refresh / logout）で:

```ts
// OAUTH_INTERNAL_URL がある → HTTP で直接 oauth dev server に通信
const url = `${oauthInternalUrl ?? 'https://oauth'}${OAUTH_PATHS.TOKEN}`
const doFetch = oauthInternalUrl
  ? (u: string, init: RequestInit) => fetch(u, init)
  : (u: string, init: RequestInit) => oauthService.fetch(u, init)
```

| 環境 | OAUTH_INTERNAL_URL | 通信方法 | D1 |
|------|-------------------|----------|----|
| ローカル | `http://localhost:30002` | `fetch(http://...)` | ファイル A（共有） |
| 本番 | 未設定 | Service Binding | Cloudflare D1（共有） |

---

## 5. `auxiliaryWorkers` とは何か

`@cloudflare/vite-plugin` の設定オプション。
複数の Worker を**1つの Vite dev server プロセス（= 1つの miniflare）にまとめて動かす**仕組み。

```ts
// apps/api-mcp/vite.config.ts
cloudflare({
  auxiliaryWorkers: [{ configPath: '../oauth/wrangler.jsonc' }]
})
```

### `auxiliaryWorkers` がない場合（今の構成）

```
プロセス A: oauth dev server（port 30002）
  miniflare A ── D1: ファイル A

プロセス B: api-mcp dev server（port 30001）
  miniflare B（api-mcp）
    └─ Service Binding の解決先として oauth を別途起動
         miniflare C（oauth のコピー） ── D1: ファイル C
```

### `auxiliaryWorkers` がある場合

```
プロセス A: oauth dev server（port 30002）
  miniflare A ── D1: ファイル A

プロセス B: api-mcp dev server（port 30001）
  miniflare B（api-mcp + oauth が同居）
    └─ Service Binding の解決先 = 同じ miniflare B 内の oauth
         D1: ファイル B（api-mcp と共有されるが A とは別）
```

miniflare C がなくなり、Service Binding 先の D1 が B に統一される。
ただし、**ブラウザが叩く port 30002（プロセス A）は別のまま**なので今回の問題は解消されない。

### `auxiliaryWorkers` が有効なケース

OAuth dev server を独立して起動しない構成、つまり:

- ブラウザの OAuth フローも api-mcp 経由でプロキシする
- または OAuth の UI が不要で、BFF のユニットテストだけ通したい

といった場合に有効。今のように「ブラウザが直接 `localhost:30002` に行く」構成では効果がない。

---

## 6. Cloud Run など Cloudflare 以外にデプロイする場合

**今回の変更（`OAUTH_INTERNAL_URL` / `OAUTH_SERVICE` Service Binding）は一切関係ない。**

### なぜか

Service Binding は Cloudflare Workers 専用の概念。
Cloud Run・GKE・Railway・Fly.io などの一般的なコンテナ環境では:

- Worker という概念がない
- `Fetcher` 型（`c.env.OAUTH_SERVICE`）という仕組みがない
- D1 という Cloudflare 専用 DB も使えない（PostgreSQL 等に置き換わる）

そもそも**アーキテクチャが根本的に違う**ため、今回の問題自体が発生しない。

### Cloud Run 等での相当する構成

| Cloudflare Workers | Cloud Run 等 |
|-------------------|-------------|
| Service Binding | 内部 HTTP 通信（VPC 内 URL）or gRPC |
| D1 | Cloud SQL / PostgreSQL / Neon 等 |
| `OAUTH_SERVICE: Fetcher` | `OAUTH_INTERNAL_URL: string`（常に設定） |
| `.dev.vars` での回避策 | 不要（最初から HTTP URL で通信） |

Cloud Run でこのプロジェクトを動かすなら、`OAUTH_INTERNAL_URL` 相当の env var を
**本番も含めて常に設定する**設計になり、Service Binding のコードパスは丸ごと不要になる。

今回の `OAUTH_INTERNAL_URL` を使った HTTP フォールバックは
「Cloudflare Workers 本番 ↔ Cloudflare Workers ローカル開発」という
**Cloudflare 固有の文脈でのみ意味を持つ**回避策。

---

## 8. 同様の問題が起きるパターン

Service Binding を使うローカル開発全般で起きうる:

- Worker A → [Service Binding] → Worker B → D1 or KV or R2
- Worker B の dev server が別途動いていて、同じストレージを共有したい場合

**一般的な対処法**:

| 方法 | 内容 | 向き不向き |
|------|------|-----------|
| HTTP フォールバック | `.dev.vars` で dev server の URL を指定 | シンプル・今回採用 |
| `auxiliaryWorkers` | Service Binding 先を同プロセス内に閉じ込める | ブラウザ経由フローが不要な場合 |
| `wrangler dev --service` | CLI オプションで Service Binding を外部 URL に向ける | `@cloudflare/vite-plugin` 非使用時 |

---

## 関連ファイル

- `apps/api-mcp/.dev.vars` — `OAUTH_INTERNAL_URL` の設定
- `apps/api-mcp/src/types.ts` — `OAUTH_INTERNAL_URL?: string`（Bindings に追加）
- `apps/api-mcp/src/routes/api/auth/token/service.ts` — HTTP フォールバック実装
- `apps/api-mcp/src/routes/api/auth/refresh/service.ts` — 同上
- `apps/api-mcp/src/routes/api/auth/logout/service.ts` — 同上
