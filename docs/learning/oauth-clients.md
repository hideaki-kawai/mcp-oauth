# OAuth クライアント登録の仕組み

このプロジェクトでは OAuth クライアントが **2 種類**いて、それぞれ違う方法で登録される。
「なぜ web は事前登録？」「Claude はテーブルに入ってる？」を整理する。

---

## 1. クライアント 2 種類の比較

| クライアント | 登録タイミング | 登録者 | 登録方法 |
|------------|-------------|--------|---------|
| **web-client** | 初期セットアップ時 | 私たち（運営者） | シーダー |
| **Claude** | 初接続時 | Claude 自身 | `POST /register`（DCR） |

両方とも **同じ `oauth_clients` テーブル**に保存される。
OAuth サーバーから見たら全員平等で、`/authorize` も `/token` も同じコードで処理される。

---

## 2. なぜ web は事前登録なのか

### 理由 1: SPA に「最初の client_id」をどう渡す？

DCR にすると、SPA の初回起動はこうなる:
```
SPA 起動
  → /register を叩いて client_id を取得
  → localStorage に保存
  → やっと /authorize へリダイレクト
```

これだけで:
- 余計な往復 1 回
- localStorage の管理（ブラウザ変更・キャッシュクリアで再登録）
- 「保存先が消えたら？」という運用課題

事前登録なら **`client_id: 'web-client'` を SPA にハードコードして終わり**。

### 理由 2: web は「不特定多数」じゃない

DCR の本質は「**接続元のクライアントを事前に知らない**」状況に対応する仕組み:
- Claude: ユーザーが任意の MCP サーバーを登録できる → 知らない相手から接続が来る
- Web SPA: 自分たちが配信してる 1 つだけ → 完全に既知

知ってる相手にわざわざ動的登録させるのは、**身内に毎回名刺交換させてる**ようなもの。

### 理由 3: テーブルが無駄に肥大化する

DCR は「接続のたびに行が増える」設計。
Web を DCR にすると、ユーザーがブラウザを変えるたび・キャッシュをクリアするたびに `oauth_clients` に行が増えていく。
事前登録なら **常に 1 行**で済む。

### 比較表

| 観点 | 事前登録（現状） | Web も DCR |
|-----|---------------|-----------|
| SPA の初期化 | client_id 即使える | /register 往復が必要 |
| client_id 保存 | コードに固定 | localStorage 管理が要る |
| DBの行数 | 1 行 | ユーザー×ブラウザ分 |
| 設定変更（redirect_uri 等） | DB 更新 or 再シード | 各 SPA 起動時に再登録 |

「**動的にしないと困る**」要件が web 側に何も無い、というのが一番の理由。
DCR は MCP 仕様で**仕方なく必要**になった機能で、要らないなら使わないのが素直、というだけ。

---

## 3. Claude はテーブルに保存される？

**される**。今は空に見えるだけで、Claude が初接続したら DCR で自動追加される。

### 現状（シーダー実行直後）
```sql
SELECT id, name FROM oauth_clients;
-- web-client | web
```

### Claude が初接続したあと
```sql
SELECT id, name FROM oauth_clients;
-- web-client                          | web
-- 1f3e2c4a-5b6d-7e8f-9a0b-c1d2e3f4a5b6 | Claude   ← DCR 追加
-- 9b8a7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d | Claude   ← 別の Claude 接続
```

つまり「保存しなくていい」のではなく「**DCR で自動的に保存される**」。
登録のタイミングと登録者が違うだけで、保存先は同じ。

---

## 4. Claude の client_id はユーザーごとに違うのか

**ほぼ「Claude 接続ごとに新規発行」になる。**

OAuth における `client_id` は**ユーザーではなくクライアントアプリの識別子**。
ただし MCP では Claude が DCR を実行するタイミングが「ユーザーが MCP サーバー URL を Claude に登録した瞬間」なので、結果として:

```
ユーザー A が api-mcp を登録 → Claude が DCR → client_id = aaa-111
ユーザー B が api-mcp を登録 → Claude が DCR → client_id = bbb-222
ユーザー A が削除して再登録   → Claude が DCR → client_id = aaa-333
```

→ 実質「**ユーザー × Claude インストール × 接続インスタンス**」ごとに別レコードが増える。

これは MCP の仕様要件:
- 「サーバー側は事前に Claude のことを知らない」
- 「Claude 側は接続ごとに自分のクレデンシャルを管理したい」

を素直に実装するとこうなる、ということ。

---

## 5. 全クライアントを DB に入れる利点（分岐ゼロ）

「web を DB に入れず、コード/環境変数で持てばいいのでは？」という案もありえる。
だが実は **DB に入れたほうが OAuth サーバーのコードはシンプルになる**。

### 全部 DB の場合（現状）

```ts
// /authorize ハンドラー
async function authorize(c) {
  const clientId = c.req.query('client_id')
  
  // たった一行のルックアップ。Claude でも web でも全く同じ
  const client = await ClientRepository.findById(clientId)
  if (!client) return c.text('invalid_client', 400)
  
  if (!client.redirectUris.includes(c.req.query('redirect_uri'))) {
    return c.text('invalid_redirect_uri', 400)
  }
  // ...
}
```

→ web も Claude も同じパスを通る。OAuth サーバーは「このクライアントどう扱う？」を考えなくていい。

### コード/env に置いた場合

```ts
async function findClient(clientId: string) {
  // ★ ここで分岐が発生する
  if (clientId === env.BUILTIN_WEB_CLIENT_ID) {
    return {
      id: env.BUILTIN_WEB_CLIENT_ID,
      redirectUris: env.BUILTIN_WEB_REDIRECT_URIS.split(','),
      scopes: 'read write',
    }
  }
  // DCR で登録された動的クライアント
  return await ClientRepository.findById(clientId)
}
```

→ 「組み込み or DB？」の **2 ソース・オブ・トゥルース**が生まれる。

### 比較

| | DB にレコード | コード/env |
|---|---|---|
| OAuth サーバーのロジック | 統一（分岐なし） | 分岐あり |
| 設定変更（redirect_uri 追加など） | SQL UPDATE / 再シード | 再デプロイ |
| バージョン管理 | マイグレーション・シーダーがコード | 直接コードに書ける |
| 失効・削除 | DELETE で即時 | 再デプロイ必須 |
| 起動条件 | DB が seed 済み必須 | DB なしで起動可 |
| 監査ログ | 全クライアントが一覧化される | 組み込み分は別管理 |

業界の実態:
- **Auth0 / Keycloak / Okta / WorkOS**: 全部 DB（管理画面から登録）
- **小規模な自作 OAuth**: コード/env もアリ

「OAuth サーバーが汎用ミドルウェアとして振る舞う」設計を取るなら、組み込みクライアントを特別扱いしない方が**結果として薄く保てる**というのが業界の判断。

---

## 6. 運用上の課題: DCR はテーブルが増え続ける

DCR を有効にしている本番 OAuth サーバーでは、`oauth_clients` テーブルは
**ユーザー数 × MCP クライアント種類**のオーダーで増える。

### 考慮すべき項目

1. **TTL / 自動クリーンアップ**:
   - 「最後にトークン発行してから N 日経過した DCR クライアントを削除」など
   - WorkOS や Auth0 もこの仕組みを持っている

2. **GC 連動**:
   - Claude 側でユーザーが「MCP サーバー削除」を実行しても、API 経由で OAuth サーバーに通知されるとは限らない → 孤児レコードが残る

3. **管理画面の表示**:
   - admin 画面で「DCR 登録」と「事前登録（自分たちのクライアント）」を分けて見られると便利
   - `oauth_clients` に `created_via TEXT NOT NULL DEFAULT 'dcr'`（or `'seed'` / `'admin'`）のようなカラムを足すと楽

---

## まとめ

| 問い | 答え |
|-----|-----|
| なぜ web は事前登録？ | DCR の出番ではない（既知のクライアント・余計な往復不要・1 行で済む） |
| Claude は DB に保存しなくていいの？ | **保存される**。DCR で自動的に追加されるだけ |
| Claude の client_id はユーザーごと？ | クライアント識別子だが、結果として「ユーザー×ブラウザ×接続」単位で増える |
| 全部 DB に入れる利点は？ | OAuth サーバーが web/Claude を区別せず統一処理できる（コード分岐ゼロ） |
| 全 DB の運用課題は？ | DCR で行が増え続ける → TTL クリーンアップ、`created_via` 管理が必要になる |

要するに **「DCR は『見たことない相手』のための仕組み」**。
自分たちの SPA みたいな既知のクライアントは事前登録で十分。
両者は同じテーブルに同居させ、OAuth サーバー側のコードを統一する。

---

## 7. MCPクライアントを自作する場合は DCR を実装する必要がある

`apps/web`（自分たちの SPA）はDCRを書く必要がないが、
**外部から接続してくるMCPクライアントを自作する場合は必須**。

### なぜ必要か

MCP の仕様（OAuth 2.1 + DCR）では、MCPクライアントが初接続時に自分自身を登録する。
サーバー側はクライアントを「事前に知らない」前提で設計されているため、
クライアント側が `POST /register` を叩いて `client_id` を取得するところから始める。

### MCPクライアントが実装すべきフロー

```
1. POST /register
   → client_id / client_secret（不要な場合もある）を取得して保存

2. /.well-known/oauth-authorization-server を取得
   → authorization_endpoint / token_endpoint のURLを確認

3. PKCE 用の code_verifier / code_challenge を生成

4. authorization_endpoint へリダイレクト（ブラウザを開く）
   → ユーザーがログイン・同意

5. redirect_uri にcodeが返ってくる

6. POST token_endpoint（authorization_code + code_verifier）
   → access_token / refresh_token を取得・保存

7. 以降は access_token をリクエストに付けて API 呼び出し
   → 期限切れになったら refresh_token で更新
```

### `apps/web` との違い

| | `apps/web`（SPA） | MCPクライアント（自作） |
|---|---|---|
| client_id | シーダーで事前登録済み・コードにハードコード | DCR で動的取得・自分で永続化 |
| DCR 実装 | 不要 | **必須** |
| リダイレクト先 | ブラウザの `/auth/callback` | ローカルサーバー or ディープリンク等 |
| トークン保存 | メモリ（authStore） + httpOnly Cookie | ファイル・DBなど任意 |

### このプロジェクトで参考にできる実装

- DCR 受け口: `apps/oauth/src/routes/register/post.ts`
- discovery: `apps/oauth/src/routes/well-known/get.ts`
- トークン発行: `apps/oauth/src/routes/token/post.ts`
