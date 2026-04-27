# DB スキーマ設計ガイド

このプロジェクトには D1 データベースが 2 つある（`oauth` / `api-mcp`）。
「どっちに何のテーブルを置くか」「足りないテーブルは無いか」「どんなアーキテクチャと呼ばれるか」を整理する。

---

## 1. 全体像 — なぜ DB が 2 つに分かれているのか

このプロジェクトの構造は、世間では「マイクロサービス」とよく呼ばれるが、
**厳密には OAuth 2.0 仕様（RFC 6749）が最初から想定する標準的な役割分担**である。

| RFC 用語 | 本プロジェクトでの担当 | 主なテーブル |
|---------|---------------------|------------|
| Authorization Server | `oauth` Worker | users, oauth_clients, authorization_codes, refresh_tokens |
| Resource Server | `api-mcp` Worker | アプリ固有のドメインデータ |
| Client | `web` SPA / Claude | （DB なし） |
| Resource Owner | エンドユーザー | — |

呼び方の整理:

- 厳密には: **Authorization Server / Resource Server 分離パターン**
- カジュアルには: **マイクロサービス的** / **サービス分割**
- 業界用語では: **Federated Identity / SSO アーキテクチャ**

3〜4 サービスくらいだと「マイクロサービス」と呼ぶには小規模で、
「分散システム」「small services」あたりが実態に近い。
Auth0 / Clerk / Firebase Auth / Supabase Auth みたいな SaaS を使う場合と全く同じ構造で、
それを自前ホストしているのが本プロジェクト。

---

## 2. アプリ DB に認証テーブルが無いことの意味

従来のモノリス（Rails / Laravel / Django 等）に慣れていると新鮮に映るが、
これこそが OAuth / JWT を導入する**最大のメリット**。

**従来のモノリス型**:
```
app DB
  ├─ users (id, email, password_hash)
  ├─ sessions (id, user_id, expires_at)
  └─ posts ...
```
→ アプリのコードが認証も認可も DB アクセスも全部抱える。

**今回の構造**:
```
oauth DB                       api-mcp DB
  ├─ users                       └─ (アプリ固有データのみ)
  ├─ oauth_clients
  ├─ authorization_codes       ← user_id 系のFKは無い
  └─ refresh_tokens
```
→ api-mcp は **JWT の署名検証だけで認証完了**。
DB を一切引かずに「このリクエストは誰か」が分かる。

### この設計の効能

1. **複数アプリで認証共有（SSO）**
   - 将来 `api-blog` `api-shop` を増やしても、認証は `oauth` がそのまま使える
2. **アプリ DB のスキーマがシンプル**
   - パスワード管理・セッション管理のコードがアプリから消える
3. **スケールの独立性**
   - 認証だけアクセス急増しても、アプリ側に影響しない
4. **Stateless**
   - JWT は自己完結なので、api-mcp のレプリカ間でセッション同期不要

### 代償

- ログアウトの即時反映が難しい（JWT は有効期限切れまで生きる → 短くする＋リフレッシュトークン側で revoke）
- ユーザー情報を api-mcp 側で表示したいとき、`sub`（user id）だけ持っていてもメール等は持っていない → 別途取りに行くか JWT に詰める

---

## 3. api-mcp DB は「普通の Web アプリ」と同じテーブルだけでいい

MCP プロトコルのリソース/ツール定義は `McpServer.registerResource()` /
`registerTool()` で**起動時にコードから登録**するのが標準。
`resources/list` レスポンスもメモリ上の登録結果を返すだけで DB は介在しない。

つまり api-mcp DB に置くのは:

- **アプリの業務データを格納する普通のテーブル**（例: ノート、ToDo、ユーザー設定 など）
- MCP 経由で読まれるか HTTP API で読まれるかは**呼び出し側の違いだけ**で、テーブル設計に MCP 固有の概念は出てこない

→ よって `mcp_resources` のような MCP 専用テーブルは不要。
本プロジェクトでは具体的なアプリ機能が決まるまで、空のスキーマファイル（`export {}`）で待機。

> NOTE: テーブルが 1 つも無い状態で `drizzle-kit generate` を実行するとエラーになるため、
> 最初のテーブルを定義するまで `pnpm -F @mcp-oauth/database db:generate:mcp` は実行しない。

---

## 4. ユーザープロフィールはどっちに置くか

「アプリで display_name や avatar を編集したい」となったとき、
`oauth.users` に列を足すか、`api-mcp` に新しいテーブルを作るか迷う。

**結論: アプリ固有のプロフィールは api-mcp 側に持つ。**

### 切り分けの基準

| データ | 置き場所 | 理由 |
|--------|---------|------|
| `email`, `password_hash`, `role` | **oauth.users** | ログイン・認可に必須 |
| `display_name`, `avatar_url`, `bio`, `language`, `theme` 等 | **api-mcp.user_profiles** | アプリの画面で使うだけ。認証と無関係 |
| `notifications_setting`, `last_seen_at` 等 | **api-mcp** | 完全にアプリ固有 |

**判定ルール**:
- 「OAuth 同意画面・ログイン画面で必要か？」→ Yes なら oauth
- 「複数アプリで共有したい身元情報か？」→ Yes なら oauth（OIDC でいう `name`, `picture` 相当）
- それ以外はぜんぶ api-mcp

### 具体的なテーブル例

```ts
// packages/database/src/mcp/schema.ts
export const userProfiles = sqliteTable('user_profiles', {
  // OAuth の users.id（= JWT の sub）と同一の値を持つ
  // 別DBなのでFK制約は張れない（D1 は cross-DB FK 不可）
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
```

### 運用パターン

**プロフィール取得・更新（アプリ固有）**
```
web → api-mcp /api/me   GET/PATCH  → api-mcp.user_profiles を読み書き
```
→ oauth は一切関与しない。

**メールアドレス変更（認証情報）**
```
web → oauth /api/me/email  PATCH  → oauth.users.email を更新
```
→ 認証の根幹に関わるのでパスワード再確認などを挟むのが普通。

**初回プロフィール作成**
- ユーザーが OAuth サインアップ → `oauth.users` に行が入る
- 初めて api-mcp にアクセスしたとき、JWT の `sub` を見て **lazy に `user_profiles` を作成**
- もしくは oauth → api-mcp に webhook で通知（オーバーキル）

### なぜ「全部 oauth に置く」ではダメか

理論上は `oauth.users` に `display_name` 等を足すこともできるが、

1. **OAuth サーバーの再利用性が落ちる**: 別アプリ（例: 将来の `api-shop`）で使うとき、別アプリ用のプロフィールカラムを oauth に追加することになり依存が逆流する
2. **`oauth` の役割が肥大化**: 認証専用にしておいた方がコードがシンプル
3. **アプリごとに必要なフィールドが違う**: SaaS では普通「アプリ A は学年、アプリ B は会社名」のように違う → app 側に持つ方が自然

### 注意点

- **JWT に詰めるのは最小限**: `sub`, `role` くらい。`display_name` を JWT に入れると更新後もトークン期限切れまで反映されない
- **削除の整合性**: `oauth.users` から消えても `api-mcp.user_profiles` は残るので、削除時はアプリ側で論理削除 or webhook 連携が必要
- **JOIN 不可**: `posts` の作者表示で名前を出したい時、別DBなのでJOINできない → api-mcp 内で `user_profiles` を JOIN するか、API 側で2クエリ叩く

要するに **oauth = 身分証発行所、api-mcp = そのアプリにおけるあなた**、という役割分担。
Auth0 / Clerk を使う構成と全く同じ思想。

---

## 5. OAuth スキーマで「他に必要なテーブル」は無いか

ドキュメント `04-database.md` の 4 テーブル設計は**最小実装としては完成**している。
本番運用で一般的に追加される要素を整理しておく。

### 検討に値するもの

| 項目 | 内容 | 必要度 |
|------|------|--------|
| **`consents` テーブル** | user_id × client_id × scopes の同意履歴。2 回目以降の同意画面スキップに使う | △（UX 改善） |
| **`code_challenge_method`** | PKCE 方式（S256 / plain）。**S256 のみサポートなら不要**（仕様で plain は非推奨） | ✗（S256 固定で OK） |
| **`jwks` / `keys` テーブル** | JWT 署名鍵の rotation。現在は `JWT_SECRET` 単一なので無し | △（鍵 rotation する場合のみ） |
| **`audit_logs` テーブル** | ログイン・トークン発行・失効の監査ログ | △（運用要件次第） |
| **`failed_login_attempts`** | 連続失敗のレート制限・ロックアウト | △（攻撃対策） |
| **`device_codes`** | Device Authorization Grant 用 | ✗（このプロジェクトは未対応） |

### 不要なもの

- **`access_tokens` テーブル**: JWT で stateless 管理なので不要
- **`scopes` マスタ**: スペース区切り文字列で十分（仕様準拠）
- **`nonce`**: OIDC のみ必要、本プロジェクトは OAuth 2.1 想定で不要
- **`client_secret`**: 全クライアント `token_endpoint_auth_method: "none"`（public）なので不要

### 追加するなら最有力候補: `consents` テーブル

毎回同意画面が出ると UX が悪い。学習目的なら不要だが、本番想定なら最初に入れるべき。

```ts
export const consents = sqliteTable('consents', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  clientId: text('client_id').notNull().references(() => oauthClients.id),
  scopes: text('scopes').notNull(),
  grantedAt: integer('granted_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
})
```

---

## まとめ

| 問い | 答え |
|-----|-----|
| これってマイクロサービス？ | 厳密には「OAuth 2.0 標準アーキテクチャ」。結果的にマイクロサービス的にはなる |
| なんでアプリ DB に認証テーブルが無いの？ | api-mcp は JWT 検証だけで完結するから。これが OAuth 導入の最大のメリット |
| api-mcp DB に MCP 固有のテーブルは要る？ | 不要。MCP のリソース/ツールはコードから登録する。普通の Web アプリと同じ業務テーブルだけ置く |
| プロフィールはどっち？ | 認証に関わるもの（email 等）は oauth、画面表示用（display_name 等）は api-mcp |
| OAuth テーブルは現状で足りる？ | 最小実装としては完成。本番で追加するなら最初の候補は `consents` |
