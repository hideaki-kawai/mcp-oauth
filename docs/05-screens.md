# 画面設計

## Tailwind CSS のセットアップ

### OAuthサーバー（`apps/oauth`）

Cloudflare Workers + Hono の SSR 構成。Vite でビルド時に CSS を生成する。

**インストール**
```bash
pnpm -F @mcp-oauth/oauth add -D tailwindcss @tailwindcss/vite
```

**`apps/oauth/vite.config.ts`**
```typescript
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [cloudflare(), tailwindcss(), ssrPlugin()]
})
```

**`apps/oauth/src/style.css`**
```css
@import "tailwindcss";
```

**Hono のHTMLで CSS を参照**
```typescript
// src/routes/authorize/get.ts
return c.html(
  <html>
    <head>
      <link rel="stylesheet" href="/style.css" />
    </head>
    ...
  </html>
)
```

### Webフロントエンド（`apps/web`）

React Router v7 + Vite 構成。すでに `@tailwindcss/vite` がインストール済み。

---

## OAuthサーバーの画面

### ログイン画面

**表示タイミング**: `/authorize` にアクセスしたとき、OAuthセッションCookieがない場合

**表示内容**
- サービス名
- メールアドレス入力
- パスワード入力
- ログインボタン
- エラーメッセージ（認証失敗時）

**フォーム仕様**
```
POST /authorize/login  (application/x-www-form-urlencoded)

email=...
password=...

<!-- OAuthフロー継続用 hiddenフィールド -->
client_id=...
redirect_uri=...
code_challenge=...
code_challenge_method=S256
scope=...
state=...
```

**実装イメージ**
```typescript
return c.html(
  <html>
    <head><link rel="stylesheet" href="/style.css" /></head>
    <body class="min-h-screen bg-gray-50 flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow w-full max-w-md">
        <h1 class="text-2xl font-bold mb-6">ログイン</h1>
        {error && <p class="text-red-600 text-sm mb-4">{error}</p>}
        <form method="POST" action="/authorize/login">
          <input type="hidden" name="client_id" value={client_id} />
          <input type="hidden" name="redirect_uri" value={redirect_uri} />
          <input type="hidden" name="code_challenge" value={code_challenge} />
          <input type="hidden" name="code_challenge_method" value="S256" />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="state" value={state} />
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">メールアドレス</label>
            <input type="email" name="email" class="w-full border rounded px-3 py-2" required />
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium mb-1">パスワード</label>
            <input type="password" name="password" class="w-full border rounded px-3 py-2" required />
          </div>
          <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
            ログイン
          </button>
        </form>
      </div>
    </body>
  </html>
)
```

---

### 同意画面（スコープ許可画面）

**表示タイミング**: `/authorize` にアクセスしたとき、OAuthセッションCookieが有効な場合

**表示内容**
- 「〇〇があなたのアカウントへのアクセスを求めています」
- クライアント名
- 要求スコープ一覧
- 「許可する」ボタン
- 「拒否する」ボタン

**スコープの表示名**

| スコープ | 表示テキスト |
|---------|------------|
| `read` | データの読み取り |
| `write` | データの書き込み |

**フォーム仕様**
```
POST /authorize/consent  (application/x-www-form-urlencoded)

action=approve  （または action=deny）
client_id=...
redirect_uri=...
code_challenge=...
scope=...
state=...
```

**実装イメージ**
```typescript
return c.html(
  <html>
    <head><link rel="stylesheet" href="/style.css" /></head>
    <body class="min-h-screen bg-gray-50 flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow w-full max-w-md">
        <h1 class="text-xl font-bold mb-2">アクセスの許可</h1>
        <p class="text-gray-600 mb-6">
          <span class="font-semibold">{clientName}</span>
          があなたのアカウントへのアクセスを求めています
        </p>
        <div class="border rounded p-4 mb-6">
          <p class="text-sm font-medium text-gray-700 mb-2">要求されている権限:</p>
          <ul class="space-y-1">
            {scopes.map(scope => (
              <li class="flex items-center text-sm text-gray-600">
                <span class="mr-2">✓</span>
                {scopeLabels[scope]}
              </li>
            ))}
          </ul>
        </div>
        <form method="POST" action="/authorize/consent">
          <input type="hidden" name="client_id" value={client_id} />
          <input type="hidden" name="redirect_uri" value={redirect_uri} />
          <input type="hidden" name="code_challenge" value={code_challenge} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="state" value={state} />
          <div class="flex gap-3">
            <button type="submit" name="action" value="deny"
              class="flex-1 border border-gray-300 py-2 rounded hover:bg-gray-50">
              拒否する
            </button>
            <button type="submit" name="action" value="approve"
              class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              許可する
            </button>
          </div>
        </form>
      </div>
    </body>
  </html>
)
```

---

## SPA画面（`apps/web`）

React Router v7 SPA。Tailwind CSS v4 インストール済み。

詳細は `docs/03-endpoints.md` の「SPA画面一覧」を参照。
