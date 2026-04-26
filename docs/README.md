# ドキュメント一覧

| ファイル | 内容 |
|--------|------|
| [01-overview.md](./01-overview.md) | システム概要・技術前提・トークン種類 |
| [02-oauth-flow.md](./02-oauth-flow.md) | OAuthフロー詳細（PKCE + DCR）・フロー図 |
| [03-endpoints.md](./03-endpoints.md) | 全エンドポイント一覧（リクエスト/レスポンス仕様） |
| [04-database.md](./04-database.md) | DBテーブル設計・マイグレーション手順 |
| [05-screens.md](./05-screens.md) | 画面設計（ログイン・同意画面）・Honoの実装例 |
| [06-jwt-tokens.md](./06-jwt-tokens.md) | JWTペイロード設計・シークレット管理 |

## 読む順序

初めて読む場合は上から順に読むと理解しやすい。

実装時は `03-endpoints.md` → `04-database.md` → `05-screens.md` の順が効率的。
