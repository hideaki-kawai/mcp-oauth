# フェーズ 2 実装まとめ（apps/oauth）

OAuth 2.1 Authorization Server の全エンドポイント実装。
`docs/07-implementation-plan.md` のフェーズ 2-1〜2-7 に対応。

## 実装まとめ

### 2-1: GET /.well-known/oauth-authorization-server
- **Controller** (`routes/well-known/get.ts`): `OAUTH_ISSUER` をベースに RFC 8414 形式の Authorization Server Metadata を JSON 返却（DB アクセスなし）
- describeRoute で OpenAPI 反映

### 2-2: domains/jwt（JWT 生成・検証）
- **`domains/jwt/index.ts`** — `JwtDomain` クラス（static methods）
  - `signAccessToken({sub, clientId, scope}, secret)` → 5 分の access token JWT（type=access）
  - `signOAuthSession({sub}, secret)` → 7 日の OAuth セッション JWT（type=oauth_session）
  - `verifyOAuthSession(token, secret)` → 署名・期限・type を検証して payload を返す
  - 別種類のトークンの誤流入を防ぐため、verify 時に `type` を必ずチェック

### 2-3: POST /register（DCR）
- **Controller** (`register/post.ts`): zod で RFC 7591 リクエスト検証 → service 委譲 → 201 Created or 400 invalid_client_metadata
- **Service** (`register/service.ts`): デフォルト値補完 → `crypto.randomUUID()` で client_id 生成 → DB 保存 → RFC 7591 §3.2.1 形式のレスポンス
- **Repository** (`register/repository.ts`): drizzle で `oauth_clients` に INSERT（redirect_uris は JSON 文字列化）

### 2-4: GET /authorize（ログイン or 同意画面）
- **Controller** (`authorize/get.tsx`): zod でクエリ検証 → service で client/redirect_uri 検証 → セッション Cookie で振り分け → ログイン or 同意画面 HTML を返す
- **Service** (`authorize/service.ts`): `client_id` 存在 + `redirect_uri` 完全一致を DB と照合（不正時は **直接エラー画面、redirect しない**）
- **Repository** (`authorize/repository.ts`): `oauth_clients` を ID で検索（JSON redirect_uris をパース）
- **Views** (`authorize/views.tsx`): `LoginScreen` / `ConsentScreen` / `ErrorScreen` の JSX コンポーネント（Tailwind）

### 2-5: POST /authorize/login
- **Controller** (`login/post.tsx`): フォーム検証 → 認証 → 成功で OAuth セッション Cookie 発行 + 303 redirect、失敗でログイン画面再表示
- **Service** (`login/service.ts`): メールでユーザー検索 → PBKDF2 パスワード照合（列挙攻撃対策で「ユーザー無し」と「PW 違い」のメッセージ統一）
- **Repository** (`login/repository.ts`): `users` テーブルから email 検索

### 2-6: POST /authorize/consent
- **Controller** (`consent/post.tsx`): セッション Cookie 検証 → service 呼び出し → redirect_uri へ 303
- **Service** (`consent/service.ts`):
  - approve → form の client_id/redirect_uri を **DB と再照合**（form 改ざん検知）→ 認可コード発行（10 分有効）→ DB 保存 → `redirect_uri?code=...&state=...`
  - deny → `redirect_uri?error=access_denied&state=...`
- **Repository** (`consent/repository.ts`): `oauth_clients` 検索 + `authorization_codes` INSERT

### 2-7: POST /token
- **Controller** (`token/post.ts`): `grant_type` で discriminated union 検証 → 認可コード or リフレッシュフローへ分岐
- **Service** (`token/service.ts`):
  - **authorization_code フロー**: code 検索 → 使用済み/期限/client_id/redirect_uri 検証 → **PKCE 検証**（SHA-256(verifier) === code_challenge）→ used_at 更新 → access token JWT + refresh token 発行
  - **refresh_token フロー**: 検索 → 失効/期限/client_id 検証 → **旧トークン失効** → 新ペア発行（Rotation）
  - `refresh_tokens.type` は `client_id === OAUTH_CLIENT_IDS.WEB ? 'web' : 'mcp'` で自動判定
- **Repository** (`token/repository.ts`): code/refresh_token の検索・更新・INSERT 一式

### 共通部品
- **`libs/token.ts`** — `generateAuthCode()` (32 文字 hex) / `generateRefreshToken()` (64 文字 hex)
- **`libs/pkce.ts`** — `verifyPkce(verifier, expectedChallenge)`（SHA-256 → Base64URL → 比較）
- **`schemas/dto/`** — zod スキーマ（authorize / authorize-login / authorize-consent / register / token / well-known / errors）
- **`types.ts`** — `Bindings` / `Variables` / `AppEnv`（Hono ジェネリクス）
- **`packages/constants`** — `OAUTH_PATHS` / `OAUTH_COOKIES` / `OAUTH_CLIENT_IDS.WEB`（seeder と一致）
- **`packages/utils`** — `hashPassword` / `verifyPassword`（PBKDF2）, `addSecondsFromNow` / `isExpiredDate`（date-fns ラッパー）

## E2E 確認できた流れ

```
1. POST /authorize/login (admin@example.com / password)
   → 303 + Set-Cookie: oauth_session=<JWT>
   → Location: /authorize?<params>

2. GET /authorize?<params> with Cookie
   → 同意画面 HTML

3. POST /authorize/consent (action=approve)
   → 303 + Location: http://localhost:30000/auth/callback?code=<32chars>&state=<state>

4. POST /token (grant_type=authorization_code, code, code_verifier, ...)
   → 200 { access_token (JWT), refresh_token, token_type, expires_in: 300, scope }

5. POST /token (grant_type=refresh_token, refresh_token=...)
   → 200 { 新しい access_token, 新しい refresh_token }

6. 旧 refresh_token を再使用
   → 400 { error: invalid_grant, error_description: refresh_token revoked }
```

## テスト

```
✓ password.spec.ts          (9)
✓ pkce.spec.ts              (9)
✓ token.spec.ts             (5)
✓ jwt/index.spec.ts         (8)
✓ register/service.spec.ts  (6)
✓ authorize/service.spec.ts (6)
✓ login/service.spec.ts     (4)
✓ consent/service.spec.ts   (5)
✓ token/service.spec.ts    (10)

Total 44 件 pass
```

`/docs` で Swagger UI も全エンドポイント反映済み。

## 設計上のポイント

- **エラー時にリダイレクトしない**: `redirect_uri` 不一致など信頼できないパラメータでは redirect せず直接エラー画面（OAuth 2.1 §4.1.2.1）
- **Form 改ざん対策**: `/authorize/consent` で hidden field の値を再度 DB 照合
- **PKCE 必須**: code_challenge_method は S256 のみ受理（OAuth 2.1）
- **Rotation**: refresh_token は使うたびに失効・新発行
- **列挙攻撃対策**: ログイン失敗のメッセージは「ユーザー無し」と「PW 違い」で同一
- **type フラグでトークン種別を区別**: access token / oauth_session JWT を verify 時に強制チェック
