# Hono + Tailwind CSS (Cloudflare Workers) の正しい当て方

## TL;DR

| やること | 方法 |
|---------|------|
| CSS をHTMLに乗せる | `?inline` で文字列取得 → `<style>` タグにインライン |
| レイアウトを適用する | `c.html()` ではなく **`c.render()`** を使う |

---

## 問題の構造

Cloudflare Workers は **サーバーサイドで HTML を生成**して返す。
ブラウザのように DOM がないため、通常の `import './style.css'` はビルド時に処理されるだけで、
レスポンスの HTML に CSS は一切含まれない。

```
❌ ブラウザ向けのViteアプリ
   import './style.css'
   → Viteが <link> タグを自動挿入してくれる ✅

❌ Cloudflare Workers (Hono)
   import './style.css'
   → Workerのバンドルには含まれるが HTML には出てこない ❌
```

---

## 正しい実装

### Step 1: `?inline` でCSSを文字列として取得

```ts
// renderer.tsx
import css from './style.css?inline'  // ← ?inline で文字列になる
```

Vite の `?inline` suffix を使うと、Tailwind が処理した CSS が **文字列リテラル**として返ってくる。

### Step 2: `<style>` タグとして `<head>` にインライン注入

```tsx
import { jsxRenderer } from 'hono/jsx-renderer'
import css from './style.css?inline'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  )
})
```

### Step 3: ルートでは `c.render()` を使う

`jsxRenderer` のレイアウトを適用するには **`c.render()`** が必要。
`c.html()` は JSX を受け取れるが、レイアウトをバイパスするため CSS が乗らない。

```ts
// ❌ NG: jsxRenderer のレイアウトをバイパスする
return c.html(<LoginScreen />)
return c.html(<LoginScreen />, 400)  // ステータス指定もNG

// ✅ OK: jsxRenderer のレイアウトを通る
return c.render(<LoginScreen />)

// ✅ OK: ステータスコードを付けたい場合は c.status() を先に呼ぶ
c.status(400)
return c.render(<ErrorScreen ... />)
```

### Step 4: `jsxRenderer` をグローバルミドルウェアとして登録

```ts
// index.tsx
import { renderer } from './renderer'

const app = new Hono<AppEnv>()
app.use(renderer)  // ← 全ルートに適用

// ルート登録...
```

---

## なぜ `c.html()` ではダメか

Hono の `jsxRenderer` は `c.render()` を提供するミドルウェア。
`c.render()` を呼ぶと `jsxRenderer` に渡したレイアウト関数（`<html><head>...`）でラップされる。

`c.html()` は JSX や文字列をそのまま `text/html` レスポンスにするだけで、
レイアウト関数は一切通らない。

```
c.render(<LoginScreen />)
  → jsxRenderer のレイアウト関数が実行される
  → <html><head><style>Tailwind CSS...</style></head><body><LoginScreen /></body></html>
  → ブラウザに CSS が届く ✅

c.html(<LoginScreen />)
  → JSX を文字列化してそのまま返す
  → <div class="min-h-screen ...">...</div>  ← <html> も <style> もない ❌
```

---

## vite.config.ts の設定

```ts
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare(), tailwindcss()],
})
```

`@tailwindcss/vite` が `?inline` で import した CSS を Tailwind で処理してくれる。

---

## まとめフロー

```
style.css (Tailwind v4 ソース)
  ↓ @tailwindcss/vite が処理
  ↓ import css from './style.css?inline'
CSS 文字列
  ↓ jsxRenderer の <style> タグに注入
  ↓ app.use(renderer) でグローバル適用
  ↓ c.render(<Component />) で呼び出し
ブラウザに CSS 付き HTML が届く ✅
```
