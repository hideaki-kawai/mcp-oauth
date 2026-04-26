# JWTトークン設計

## JWTとは

JSON Web Token。情報をJSON形式で格納して署名したトークン。
DBを参照しなくてもトークンの内容と正当性を検証できる。

```
eyJhbGciOiJIUzI1NiJ9  ← ヘッダー（Base64URL）
.
eyJzdWIiOiJ1c2VyXzEifQ  ← ペイロード（Base64URL）
.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  ← 署名（HS256）
```

## 使用するアルゴリズム

**HS256**（HMAC-SHA256）: 同じシークレットキーで署名と検証を行う対称鍵方式。
OAuthサーバーとapi-mcpサーバーで `JWT_SECRET` を共有する。

## JWTペイロード設計

### アクセストークン（MCP・Web共通）

ClaudeのMCPアクセスとSPAのAPIアクセスで共通して使うトークン。

```json
{
  "sub": "user_id_xxx",        // ユーザーID
  "client_id": "abc123",       // OAuthクライアントID
  "scope": "read write",       // 許可されたスコープ
  "type": "access",            // トークン種別
  "iat": 1700000000,           // 発行時刻（Unix秒）
  "exp": 1700000300            // 有効期限（iat + 300 = 5分後）
}
```

### OAuthセッション

ログイン→同意画面の間だけ使う。OAuthサーバー（`oauth.example.com`）のCookieのみに存在する。
api-mcpサーバーとは共有しない。

```json
{
  "sub": "user_id_xxx",        // ユーザーID
  "type": "oauth_session",     // 種別（アクセストークンと区別するために必須）
  "iat": 1700000000,
  "exp": 1700604800            // 有効期限（iat + 604800 = 7日後）
}
```

> **なぜ7日か**
> Claude・ChatGPT・Cursor など複数のMCPクライアントを続けて接続する際、
> 毎回ログインを求めない。7日以内なら同意画面だけ表示されてログインはスキップされる。
> セキュリティ要件に応じて1日〜30日の範囲で調整する。

## トークン有効期限まとめ

| トークン | 有効期限 | 保存場所 | 用途 |
|---------|---------|---------|------|
| アクセストークン（JWT） | 5分 | MCPクライアント管理 or メモリ | API・MCPアクセス |
| リフレッシュトークン | 30日 | DB + httpOnly Cookie | アクセストークン更新 |
| OAuthセッション（JWT） | 7日 | httpOnly Cookie（oauth.example.comのみ） | ログイン→同意フロー |
| 認可コード | 10分 | DB | OAuth認可フロー中の一時コード |

## JWT_SECRET の管理

```bash
# 生成例（32バイト以上の乱数を推奨）
openssl rand -base64 32

# api-mcpとoauthの両Workerに同じ値を設定
wrangler secret put JWT_SECRET --name api-mcp
wrangler secret put JWT_SECRET --name oauth
```

ローカル開発時は `.dev.vars` ファイルに記載する（gitignore済み）:
```
# apps/api-mcp/.dev.vars
JWT_SECRET=your_secret_here

# apps/oauth/.dev.vars
JWT_SECRET=your_secret_here
```

## api-mcpサーバーでの検証コード例

```typescript
import { verify } from 'hono/jwt'

const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    c.header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${API_MCP_BASE_URL}/.well-known/oauth-protected-resource"`
    )
    return c.json({ error: 'unauthorized' }, 401)
  }

  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET)

    // typeがaccessであることを確認
    // oauth_session トークンがapi-mcpに届いても拒否する
    if (payload.type !== 'access') {
      throw new Error('invalid token type')
    }

    c.set('jwtPayload', payload)
    await next()
  } catch {
    c.header('WWW-Authenticate', 'Bearer error="invalid_token"')
    return c.json({ error: 'invalid_token' }, 401)
  }
}
```
