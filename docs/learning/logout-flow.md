# ログアウト処理の設計

完全なログアウトには「2つのドメインにまたがる Cookie を両方消す」必要がある。
なぜ2ステップになるのか、なぜ GET と POST が混在するのかを整理する。

---

## 1. ログアウトで消すべきもの

| 対象 | 保存場所 | 役割 |
|------|---------|------|
| `refreshToken` Cookie | api-mcp ドメイン（httpOnly） | アクセストークンの再発行に使う |
| リフレッシュトークン（DB） | `oauth-db` の `refresh_tokens` テーブル | Cookie の値を無効化するための実体 |
| `oauth_session` Cookie | OAuth サーバードメイン（httpOnly） | OAuth の「ログイン済み」状態 |

この3つを全部消さないと完全なログアウトにならない。

---

## 2. なぜ2ステップ必要なのか

Cookie はドメインをまたいで削除できない。
`refreshToken` は api-mcp ドメイン専用、`oauth_session` は OAuth ドメイン専用なので、
それぞれのサーバーにブラウザが直接リクエストを送らないと消せない。

```
ブラウザ → POST api-mcp /api/auth/logout
  └─ refreshToken Cookie を読める（api-mcp ドメイン）
  └─ oauth_session Cookie は読めない（別ドメイン）

ブラウザ → GET oauth /logout
  └─ oauth_session Cookie を読める（OAuth ドメイン）
  └─ refreshToken Cookie は読めない（別ドメイン）
```

また、DB のリフレッシュトークン削除には `refreshToken` の値が必要。
その値を知っているのは api-mcp だけなので、BFF が `/revoke` を呼ぶ。

---

## 3. 実際のログアウトフロー

```
[1] ユーザーがログアウトボタンをクリック

[2] POST api-mcp /api/auth/logout（BFF）
      ├─ refreshToken Cookie を読む
      ├─ OAuth /revoke を呼び、DB のトークンを失効
      └─ refreshToken Cookie を削除

[3] window.location.href = oauth /logout?redirect=/login
    （React Router の navigate ではなく全画面遷移）
      ├─ oauth_session Cookie を削除
      └─ /login へリダイレクト

[4] /login 画面が表示される（ログアウト完了）
```

---

## 4. なぜ GET と POST が混在するか

| エンドポイント | メソッド | 理由 |
|--------------|--------|------|
| `POST /api/auth/logout`（BFF） | POST | CSRF 対策 + 副作用あり |
| `GET /logout`（OAuth） | GET | ブラウザ遷移が必要なため |

### BFF が POST な理由

- **CSRF 対策**: GET だと `<img src="https://api-mcp.domain/api/auth/logout">` を仕込まれるだけでログアウトを強制できる。POST なら CORS + `SameSite` Cookie の保護が効く。
- **HTTP の意味論**: GET は副作用なし・べき等が前提。DB のトークン失効・Cookie 削除は副作用を伴うため POST が正しい。
- OAuth の `/revoke`（RFC 7009）も同じ理由で POST。

### OAuth logout が GET な理由

- `window.location.href = ...` でブラウザを誘導して Cookie を削除させるため、ブラウザが自動でリクエストを送れる GET が必要。
- この endpoint は DB を変更せず Cookie 削除とリダイレクトのみなので、GET でも副作用の問題はない。

---

## 5. なぜ window.location.href を使うか

```ts
// ❌ React Router の navigate
navigate('/login')
// → SPA 内の遷移。ブラウザは OAuth サーバーにリクエストを送らない。
//   oauth_session Cookie が残ったまま。

// ✅ window.location.href
window.location.href = `${OAUTH_BASE_URL}/logout?redirect=...`
// → ブラウザが OAuth サーバーに HTTP リクエストを送る。
//   oauth_session Cookie が削除される。
```

React Router の `navigate` は SPA 内でのページ切り替えなので、
別ドメイン（OAuth サーバー）へのリクエストは発生しない。
`window.location.href` は実際のブラウザ遷移を引き起こすため、
OAuth サーバーが Cookie を削除できる。

---

## 6. ログアウトが不完全だとどうなるか

| 消し忘れ | 結果 |
|---------|------|
| `refreshToken` Cookie のみ残る | auth-middleware がリフレッシュ成功 → ログインしたまま |
| DB のトークンのみ残る（Cookie は消えた） | リフレッシュ不可 → ログインできなくなる（実害なし） |
| `oauth_session` のみ残る | `/login` → OAuth が「ログイン済み」と判断 → 自動承認 → Cookie 復活 |

今回バグとして発生したのは「`oauth_session` が残る」ケース。
ログアウトボタンで BFF の Cookie は消えたが、直後に `/login` → OAuth 自動承認 → 新しい Cookie が発行されてしまっていた。

---

## 7. 業界の実態

| サービス | 実装 |
|---------|------|
| Auth0 | `GET /v2/logout?returnTo=...` でセッション削除 + リダイレクト。別途 token revoke が必要 |
| Keycloak | `GET /realms/{realm}/protocol/openid-connect/logout` + `POST /revoke` の2ステップ |
| WorkOS | `GET /logout` でセッション削除。リフレッシュトークンは API で別途 revoke |
| Google | `GET accounts.google.com/logout` + `POST oauth2.googleapis.com/revoke` |

どの主要サービスも「セッション削除」と「トークン失効」を別エンドポイントで扱っている。今回の2ステップ構成は業界標準に沿っている。

---

## まとめ

| 問い | 答え |
|-----|-----|
| なぜ2ステップ必要？ | Cookie のドメイン制約。別ドメインの Cookie は別ドメインのサーバーしか削除できない |
| BFF logout が POST な理由 | CSRF 対策 + 副作用あり（DB 変更・Cookie 削除） |
| OAuth logout が GET な理由 | `window.location.href` でブラウザ遷移させる必要があるため |
| なぜ `window.location.href`？ | React Router の `navigate` では別ドメインへのリクエストが発生しない |
| DB のトークン削除を OAuth /logout でできない理由 | `refreshToken` Cookie は api-mcp ドメイン専用。OAuth サーバーはその値を知る手段がない |

## 関連ファイル

- `apps/api-mcp/src/routes/api/auth/logout/post.ts` — BFF ログアウト
- `apps/oauth/src/routes/logout/get.ts` — OAuth セッション終了
- `apps/web/app/routes/(private)/home/page.tsx` — ログアウトボタン（`window.location.href` で遷移）
