# WorkOS AuthKit を使うという選択肢

本プロジェクトでは OAuth サーバー（`apps/oauth`）を自前実装しているが、
同じことを WorkOS の **AuthKit** というサービスに丸投げできる。
このドキュメントでは「自前実装と何が違うか」「いつ使うべきか」を整理する。

> 調査時点: 2026年4月

---

## 1. WorkOS / AuthKit とは

- **WorkOS**: 認証・認可機能を SaaS で提供するプラットフォーム
- **AuthKit**: WorkOS が提供する OAuth 2.1 準拠のホスト型認証サーバー
  - ログイン UI、同意画面、トークン発行、ユーザー管理を全部肩代わりしてくれる
  - 開発者は **Resource Server（本プロジェクトの `api-mcp` に相当）だけ書けばいい**

Auth0 / Clerk / Firebase Auth / Supabase Auth と同じカテゴリのサービス。
WorkOS の特徴は「**MCP 仕様（DCR / CIMD など）に最初から対応している**」こと。

---

## 2. 自前実装と何が置き換わるか

本プロジェクトで自作しようとしている `apps/oauth` のほぼ全機能が AuthKit に含まれる。

| 機能 | 自前実装 | WorkOS AuthKit |
|------|---------|---------------|
| `/authorize` `/token` `/register` `/.well-known/...` | ✅ 全部書く | ✅ 提供済み |
| OAuth 2.1 + PKCE | ✅ 自分で実装 | ✅ 標準対応 |
| **DCR（Dynamic Client Registration）** | ✅ 自分で実装 | ✅ Dashboard で1クリック有効化 |
| **CIMD（Client ID Metadata Document）** | ❌ 未対応 | ✅ MCP 2025-11 仕様の新方式に対応済み |
| ログイン / 同意画面 UI | 自作 HTML | ホスト型 UI（カスタマイズ可） |
| ユーザー管理・MFA・ソーシャルログイン | ❌ 未対応 | ✅ 標準装備 |
| エンタープライズ SSO（SAML / OIDC） | ❌ | ✅ 別料金 |
| Directory Sync (SCIM) | ❌ | ✅ 別料金 |

特筆すべき点:

- **MCP 仕様書（2025-11 改訂）が要求する DCR / CIMD に AuthKit がすでに対応済み**
- FastMCP（Python の MCP フレームワーク）も WorkOS をビルトインプロバイダとしてサポート
- MCP のスペック更新に追従する負担を WorkOS 側が肩代わりしてくれる

### CIMD とは（補足）

**Client ID Metadata Document**: MCP 2025-11 で導入された、DCR の代替となる新方式。
DCR が「クライアントが事前に Authorization Server に登録する」のに対し、
CIMD は「クライアントが自分のメタデータを公開 URL でホストし、Authorization Server がオンデマンドで取得する」方式。

MCP のスケール（1 つの AI クライアントが見たことのない数千の MCP サーバーに繋ぐ可能性）を考えると、
事前登録方式の DCR より CIMD の方が合理的。WorkOS は両方サポートしている。

---

## 3. WorkOS を使っても自前で残るもの

OAuth サーバーを丸投げしても、以下は変わらず必要:

- **`api-mcp`（Resource Server）**: JWT を検証して MCP ツール/リソースを提供
- **`web`（フロントエンド）**: SPA として変わらず存在
- **アプリ固有 DB と業務ロジック**: ノート、ToDo、ユーザープロフィール等

つまり、本プロジェクトの 3 Worker のうち **`oauth` だけが消えて**、`api-mcp` と `web` は残る。

```
【自前実装の現状】              【WorkOS 採用後】

  oauth Worker  ──┐               WorkOS AuthKit ──┐
                   │                                  │
  api-mcp Worker ←┤                api-mcp Worker  ←┤
                   │                                  │
  web Worker  ────┘                web Worker  ────┘
```

---

## 4. 料金（2026年4月時点）

| プラン | 内容 |
|-------|------|
| Free | **100 万 MAU まで無料**（メール/パスワード・MFA・ソーシャルログイン込み） |
| 超過 | 100 万 MAU 追加ごとに $2,500/月 |
| Enterprise SSO | $125/接続/月から（数量割引あり） |
| Directory Sync (SCIM) | 別料金 |
| カスタムドメイン | $99/月（任意） |
| Sandbox 環境 | 無料 |

無料枠が破格。個人開発・スタートアップ初期なら実質無料で全機能使える。

---

## 5. いつ採用すべきか

### WorkOS を選ぶべきケース

- 本番運用するプロダクト
- 「認証は早く・安全に・誰かに任せたい」
- 将来エンタープライズ SSO（SAML）や SCIM が必要になる可能性がある
- MCP の仕様変更（CIMD など）への追従コストを払いたくない
- パスワード管理・MFA・ソーシャルログインを自分で実装したくない

### 自前で作るべきケース（＝本プロジェクトの想定）

- **OAuth / MCP の仕組みを学習したい**
- 認証フローを完全にコントロールしたい
- 外部 SaaS への依存を避けたい（ベンダーロックイン回避）
- D1 / Workers の練習も兼ねたい
- 規制要件などで「ユーザーデータを自社管理しなければならない」

---

## 6. ハイブリッド戦略

「学習が一段落したら本番は WorkOS に切り替える」という現実的な進め方も可能:

1. **フェーズ A（学習期）**: 自前 `apps/oauth` で OAuth フローを理解する
2. **フェーズ B（本番化）**: `apps/oauth` を捨てて WorkOS AuthKit に接続するだけに置き換える
   - `api-mcp` は JWT 検証ロジックだけ WorkOS の JWKS エンドポイントを参照するように修正
   - `web` は OAuth エンドポイントの URL を WorkOS のものに差し替える
   - **大半のコードは触らずに済む**（OAuth 仕様準拠で作ってあるため）

これは OAuth 標準アーキテクチャの大きなメリット。
「Authorization Server を差し替えても Resource Server は動き続ける」という設計が活きる。

---

## まとめ

| 問い | 答え |
|-----|-----|
| 本プロジェクトの OAuth サーバーは WorkOS で代替できる？ | **できる**。`apps/oauth` がまるごと不要になる |
| MCP の DCR / PKCE / CIMD に対応してる？ | **対応済み**。WorkOS は MCP 公式が推す Auth プロバイダの 1 つ |
| いくらかかる？ | **100 万 MAU まで無料**。個人開発なら実質タダ |
| いつ使うべき？ | 本番運用するなら WorkOS、学習目的なら自前 |
| 移行は大変？ | OAuth 標準準拠で実装してあれば `api-mcp` / `web` のコードはほぼ無修正で差し替え可能 |

---

## 参考リンク

- [Model Context Protocol – AuthKit – WorkOS Docs](https://workos.com/docs/authkit/mcp)
- [Secure auth for MCP servers — WorkOS](https://workos.com/mcp)
- [Everything your team needs to know about MCP in 2026 — WorkOS](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)
- [Dynamic Client Registration (DCR) in MCP — WorkOS](https://workos.com/blog/dynamic-client-registration-dcr-mcp-oauth)
- [Introduction to MCP authentication — WorkOS](https://workos.com/blog/introduction-to-mcp-authentication)
- [WorkOS Pricing](https://workos.com/pricing)
- [workos - FastMCP](https://gofastmcp.com/python-sdk/fastmcp-server-auth-providers-workos)
