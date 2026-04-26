# OAuth バージョン比較

## 一言まとめ

| バージョン | 一言 |
|-----------|------|
| OAuth 1.0 | 署名で守る。安全だが複雑 |
| OAuth 2.0 | Bearer トークンで簡単に。でも穴が多かった |
| OAuth 2.1 | 2.0 の穴を塞いで「これだけ使え」とまとめたもの |

---

## OAuth 1.0（2010年）

### 何が特徴か

リクエストのたびに**暗号署名**をつける。トークンが盗まれても署名がなければ使えない。

```
クライアント → サーバー へのリクエスト:
  Authorization: OAuth
    oauth_consumer_key="...",
    oauth_token="...",
    oauth_signature_method="HMAC-SHA1",
    oauth_signature="<リクエスト全体をHMACで署名した値>",
    oauth_timestamp="...",
    oauth_nonce="..."
```

### なぜ廃れたか

- 署名の計算が複雑でライブラリなしでは実装困難
- モバイルアプリ・SPAには不向き
- 2.0 が出て急速に移行された

---

## OAuth 2.0（RFC 6749, 2012年）

### 何が変わったか

署名をやめて **Bearer トークン**（持ってるだけで使えるトークン）にした。HTTPS で通信を保護する前提。

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

### 4つのグラントタイプ

| グラントタイプ | 用途 | 問題 |
|-------------|------|------|
| Authorization Code | Webアプリ | ✅ 現在も使用 |
| **Implicit** | SPA（当時） | ❌ URLにトークンが露出。廃止 |
| **Resource Owner Password** | 自社アプリ | ❌ パスワードをアプリに渡す。廃止 |
| Client Credentials | サーバー間 | ✅ 現在も使用 |

### 2.0 の問題点

1. **PKCE が任意** — 認可コードを盗んでトークンを取れる攻撃が可能
2. **Implicit が危険** — アクセストークンがURLフラグメントに露出しブラウザ履歴に残る
3. **リフレッシュトークンの Rotation が任意** — 盗んだトークンを長期間使われるリスク
4. **redirect_uri の照合が緩い実装が多かった** — オープンリダイレクト攻撃の温床

---

## OAuth 2.1（ドラフト中, RFC 化予定）

### 何をしたか

2.0 の仕様 + セキュリティBCP（RFC 9700）+ PKCE（RFC 7636）を**1つにまとめた**もの。
新機能の追加ではなく「これが現在のベストプラクティス、これだけ使え」という整理。

### 2.0 からの主な変更点

| 項目 | OAuth 2.0 | OAuth 2.1 |
|------|----------|----------|
| Implicit グラント | あり | **削除** |
| ROPC グラント | あり | **削除** |
| PKCE | 任意 | **必須**（Authorization Code フロー全員） |
| リフレッシュトークン Rotation | 任意 | **必須**（またはsender-constrained） |
| Bearer トークンをクエリパラメータで送る | 許可 | **禁止** |
| redirect_uri の照合 | 実装依存 | **完全一致必須** |

### なぜ MCP が 2.1 を推奨するか

MCP は Claude などの AI クライアントが**パブリッククライアント**（クライアントシークレットを安全に保持できない）として動作する。
PKCE なしでは認可コードを盗んでトークンを取れてしまうため、PKCE を必須とする 2.1 が必要。

---

## このプロジェクトの OAuth 2.1 準拠状況

| 要件 | 状況 | 実装箇所 |
|------|------|---------|
| PKCE（S256）必須 | ✅ | `POST /token` での `SHA256(code_verifier)` 検証 |
| Implicit グラント なし | ✅ | `authorization_code` + `refresh_token` のみサポート |
| ROPC グラント なし | ✅ | 未実装 |
| リフレッシュトークン Rotation | ✅ | `POST /token` での `revoked_at` 更新 + 新トークン発行 |
| Bearer トークンはヘッダーのみ | ✅ | `Authorization: Bearer` のみ受け付ける |
| redirect_uri 完全一致 | ✅ | `POST /token` での `redirect_uri` 照合 |

### MCP 仕様が参照する関連 RFC

| RFC | 内容 | このプロジェクトでの実装 |
|-----|------|----------------------|
| OAuth 2.1 draft | 上記まとめ | 全体設計 |
| RFC 7636 | PKCE | `GET /authorize` + `POST /token` |
| RFC 7591 | DCR（Dynamic Client Registration） | `POST /register` |
| RFC 9728 | Protected Resource Metadata | `GET /.well-known/oauth-protected-resource` |
| RFC 9700 | OAuth 2.0 Security BCP | セキュリティ設計全般 |

---

## 補足：「Bearer トークン」とは

「Bearer（持参人）」= 持っている人が誰であれ使えるトークン。

```
現金 ≈ Bearer トークン  （持ってれば使える、盗まれたら終わり）
クレジットカード ≈ OAuth 1.0 署名  （持ってるだけでは使えない、本人確認あり）
```

だから HTTPS 必須 + 有効期限を短く（5分）+ Rotation でリスクを下げる設計にしている。
