# OAuth + MCP 実装まとめ

`docs/07-implementation-plan.md` のフェーズ 2 / 3 に対応する実装の総覧。
ファイルごとの責任と設計判断を 1 つにまとめてある。

---

# フェーズ 2: OAuth 2.1 Authorization Server（apps/oauth）

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

---

# フェーズ 3: MCP サーバー兼 BFF（apps/api-mcp）

OAuth 保護付き MCP サーバー + Web SPA 用 BFF。
`docs/07-implementation-plan.md` のフェーズ 3-1〜3-9 に対応。

## 設計の中心: domains/ で MCP と Web の重複を消す

api-mcp は MCP クライアント（Claude）と Web SPA の **両方**にデータを提供する。
同じ機能を 2 つの surface で出すため、外部 API 呼び出しを直接 Tool / Controller に書くと重複する。
これを避けるために 3 層に分けた:

```
external API (Frankfurter / CoinGecko)
   ↓
libs/        ← 外部 API ラッパー（fetch / SDK 直叩き）
   ↓
domains/     ← ★ プロトコル非依存の共通層 ★
   ↓
   ├──→ routes/mcp/tools/*    ← domain → MCP 形式
   └──→ routes/api/fx,crypto/* ← domain → JSON（Hono RPC）
```

「USD/JPY の今日のレート取得」のような業務ロジックは `FxDomain.getRate()` の **1 箇所**だけ。
MCP Tool / Web API は domain の戻り値を MCP 形式 / JSON 形式に変換するだけのアダプタ。

## 実装まとめ

### 3-1: GET /.well-known/oauth-protected-resource
- **Controller** (`routes/well-known/get.ts`): RFC 9728 / MCP Authorization spec のメタデータ JSON を返す（認証不要）
- **DTO** (`schemas/dto/well-known.ts`): `oauthProtectedResourceMetadataSchema`

### 3-2: JWT 認証ミドルウェア
- **`middlewares/auth-middleware.ts`**: trade-agent 流の `MiddlewareHandler<AppEnv>` パターン
  - `Authorization: Bearer <JWT>` 検証
  - `payload.type === 'access'` を強制（OAuth セッション JWT 誤流入防止）
  - `as` キャスト不使用で payload を再構築
  - 失敗時は `WWW-Authenticate: Bearer resource_metadata="..."` 付き 401（MCP 仕様準拠）
- **`middlewares/index.ts`**: export 集約

### 3-3: 外部 API ラッパー（libs/）
- **`libs/frankfurter.ts`**: `https://api.frankfurter.dev/v1/` への fetch ラッパー
  - 公式 SDK が無いので自前。レスポンスは zod で検証
  - 関数: `getLatest`, `convertAmount`, `getTimeseries`
- **`libs/coingecko.ts`**: `@coingecko/coingecko-typescript`（公式 SDK）の薄いラッパー
  - 無料公開エンドポイント (`environment: 'demo'`) + auth ヘッダー明示省略 (`defaultHeaders: { 'x-cg-demo-api-key': null }`)
  - シンボル → ID 変換テーブル（BTC→bitcoin など 10 銘柄対応）
  - 関数: `getSimplePrice`, `getCoinById`, `getCoinOhlc`

### 3-4: DTO スキーマ
- **`schemas/dto/fx.ts`**: `fxRateSchema` / `convertedAmountSchema` / `fxHistorySchema` + クエリスキーマ
- **`schemas/dto/crypto.ts`**: `cryptoPriceSchema` / `cryptoMarketSchema` / `cryptoHistorySchema` + クエリスキーマ
- domain の戻り値型 = Web API レスポンス = MCP `structuredContent` の **単一の真実**（`z.infer<typeof xxx>`）

### 3-5: Domain 層
- **`domains/fx/index.ts`** — `FxDomain`（static methods）
  - `getRate`, `convert`, `getHistory`
  - 同一通貨は API を叩かず即返す最適化
  - 大文字正規化、Frankfurter のレスポンスを DTO 形式に整形
- **`domains/crypto/index.ts`** — `CryptoDomain`（static methods）
  - `getPrice`, `getMarket`, `getHistory`
  - SDK の typed Record（`CurrentPrice` 等）から動的キーで値を取り出す helper（`pickNumber` / `pickString`）を内蔵
  - `as` キャスト不使用（Object.entries で全列挙）

### 3-6: Web API（routes/api/fx/*, routes/api/crypto/*）
- 6 エンドポイント（FX 3 + Crypto 3）すべて Controller のみ — domain を直接呼ぶ薄い層
  - service.ts は省略（読み取り専用 + DB 触らない + domain がすでに業務層）
  - BFF（フェーズ 5 の /api/auth/*）は副作用が多いので service.ts を残す予定
- 共通パターン: `describeRoute` + `validator('query', schema)` + `domain.method()` + `c.json(result)`
- `index.tsx` で `app.use('/api/fx/*', authMiddleware)` などで認証必須化

### 3-7: MCP Tool（× 6）
- **`routes/mcp/tools/`** — 各ツールが domain を呼んで MCP 形式に整形
  - `get-fx-rate.ts` → `FxDomain.getRate()`
  - `convert-currency.ts` → `FxDomain.convert()`
  - `get-fx-history.ts` → `FxDomain.getHistory()`
  - `get-crypto-price.ts` → `CryptoDomain.getPrice()`
  - `get-crypto-market.ts` → `CryptoDomain.getMarket()`
  - `get-crypto-history.ts` → `CryptoDomain.getHistory()`
- 戻り値: `{ content: [{ type: 'text', text: '...' }], structuredContent: domainResult }`
  - `content[]`: 人間可読テキスト（Claude が直接読む）
  - `structuredContent`: 機械可読 JSON（Claude が後段の処理で使う）
- **`tools/index.ts`** — `registerTools(server)` で 6 種を一括登録

### 3-8: MCP Prompt（× 2、日本語）
- **`prompts/daily-market-brief.ts`**: 「今日のマーケット概況」
  - 引数: `focusCurrency?` （重点通貨ペア指定）
  - Claude に対して get_crypto_price + get_crypto_market + get_fx_rate を順に呼ぶよう日本語で指示
- **`prompts/crypto-deep-dive.ts`**: 「暗号通貨の深掘り分析」
  - 引数: `symbol`
  - get_crypto_price + get_crypto_market + get_crypto_history を呼んで多角的レポート作成を依頼
- **`prompts/index.ts`** — `registerPrompts(server)` で 2 種を一括登録

### 3-9: /mcp エンドポイント
- **`routes/mcp/post.ts`**: `@hono/mcp` の `StreamableHTTPTransport` で GET/POST 両対応
- リクエスト毎に `McpServer` を生成 → `registerTools` + `registerPrompts` → `transport.handleRequest(c)`
- `index.tsx` で `authMiddleware` を `/mcp` と `/mcp/*` に適用（JWT 必須）

### 共通部品（追加）
- **`packages/constants/src/paths.ts`** — `API_MCP_PATHS` に `FX_*` / `CRYPTO_*` / `HEALTH` 追加
- **`packages/utils/src/date.ts`** — `todayIso()` / `daysAgoIso(days)` 追加（FX history 用）
- **`apps/api-mcp/src/types.ts`** — `AccessTokenPayload` 型 + `Variables.user`

## E2E 確認できた流れ（フェーズ 2 + 3 連携）

```
1. POST /authorize/login → 303 + oauth_session Cookie
2. POST /authorize/consent (approve) → 303 + Location: ?code=...
3. POST /token (authorization_code, code_verifier, ...) → access_token (JWT) 取得

4. GET /api/fx/rate?from=USD&to=JPY  with Bearer <token>
   → 200 { rate: 159.74, from: USD, to: JPY, asOf: 2026-04-28 } ← 実 ECB データ

5. GET /api/crypto/price?symbol=BTC  with Bearer <token>
   → 200 { symbol: BTC, vsCurrency: usd, price: 76205 } ← 実 CoinGecko データ

6. GET /api/crypto/market?symbol=ETH  with Bearer <token>
   → 200 { price, marketCap, priceChangePercent24h, ath, athDate, ... }

7. 認証なしで /api/* や /mcp にアクセス
   → 401 + WWW-Authenticate: Bearer resource_metadata="..."
```

## 設計上のポイント（フェーズ 3）

### domain 層の効果
- **重複ゼロ**: FX レート取得は `FxDomain.getRate()` の 1 箇所
- **テストしやすい**: domain は純粋関数（libs を mock するだけ）
- **将来の追加サーフェスにも対応**: gRPC や WebSocket を生やしても同じ domain を呼ぶだけ
- **schemas/dto/ が単一の真実**: zod の `z.infer` で domain 戻り値型 = Web API レスポンス = MCP structuredContent

### Tool と Web API の使い分け
- **Tool**: LLM が自動判断で呼ぶアクション。`content[]` の人間可読テキストが主
- **Web API**: SPA がデータを取得して画面表示する。JSON が主
- どちらも同じ domain を呼ぶので、機能追加は domain への 1 メソッド追加で済む

### Prompt は Tool を組み合わせる「シナリオテンプレ」
- ユーザーがスラッシュコマンドで明示発動
- 内部で複数 Tool を順に呼ぶよう Claude に指示する**日本語の文章**を返すだけ
- 引数は zod スキーマで定義（`focusCurrency`, `symbol` 等）

### 認証付き MCP の流れ
1. Claude が `/.well-known/oauth-protected-resource` を取得 → OAuth サーバー URL を知る
2. OAuth サーバーで DCR → /authorize → /token を経て access_token を取得
3. `Authorization: Bearer <JWT>` で `/mcp` を叩く
4. `authMiddleware` が JWT を検証（type=access チェック）して `c.var.user` にセット
5. `McpServer` がリクエストを処理（必要なら `c.var.user.sub` でユーザー識別）

### CoinGecko SDK のハマりどころ
- 無料公開モードでも `new Coingecko({})` だと `Could not resolve authentication method` でコケる
- 解決: `environment: 'demo'` + `defaultHeaders: { 'x-cg-demo-api-key': null }` で「ヘッダーを明示的に省略」を伝える

### `as` 不使用での型安全な動的キーアクセス
SDK の typed Record（`CurrentPrice` 等）から動的キーで値を取るには `Object.entries` を使う:
```typescript
function pickNumber(obj: unknown, key: string): number | null {
  if (obj === null || typeof obj !== 'object') return null
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) return typeof v === 'number' ? v : null
  }
  return null
}
```

## テスト合計（フェーズ 2 + 3）

```
✓ password.spec.ts          (9)   ← @mcp-oauth/utils
✓ pkce.spec.ts              (9)   ← apps/web
✓ token.spec.ts             (5)   ← apps/oauth/libs
✓ jwt/index.spec.ts         (8)   ← apps/oauth
✓ register/service.spec.ts  (6)   ← apps/oauth
✓ authorize/service.spec.ts (6)   ← apps/oauth
✓ login/service.spec.ts     (4)   ← apps/oauth
✓ consent/service.spec.ts   (5)   ← apps/oauth
✓ token/service.spec.ts    (10)   ← apps/oauth
✓ fx/index.spec.ts          (6)   ← apps/api-mcp
✓ prompts/index.spec.ts     (3)   ← apps/api-mcp

Total 71 件 pass
```

## デプロイ可能な全エンドポイント

### apps/oauth（フェーズ 2）

| メソッド | パス | 認証 |
|------|-----|-----|
| GET | `/.well-known/oauth-authorization-server` | 不要 |
| POST | `/register` | 不要（DCR） |
| GET | `/authorize` | Cookie で振り分け |
| POST | `/authorize/login` | 不要 |
| POST | `/authorize/consent` | Cookie 必須 |
| POST | `/token` | 不要 |

### apps/api-mcp（フェーズ 3）

| メソッド | パス | 認証 | 用途 |
|------|-----|-----|------|
| GET | `/.well-known/oauth-protected-resource` | 不要 | MCP Discovery |
| GET | `/api/health` | 不要 | ヘルスチェック |
| GET | `/api/fx/rate` | JWT 必須 | 為替レート（Web/MCP 共通データソース） |
| GET | `/api/fx/convert` | JWT 必須 | 通貨換算 |
| GET | `/api/fx/history` | JWT 必須 | 為替履歴 |
| GET | `/api/crypto/price` | JWT 必須 | 暗号通貨価格 |
| GET | `/api/crypto/market` | JWT 必須 | 暗号通貨市場データ |
| GET | `/api/crypto/history` | JWT 必須 | 暗号通貨 OHLC |
| GET/POST | `/mcp` | JWT 必須 | MCP Streamable HTTP |
| GET | `/docs` | 不要 | Swagger UI |
| GET | `/docs/openapi.json` | 不要 | OpenAPI スキーマ |
