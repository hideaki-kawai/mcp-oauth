import { defineConfig } from 'vitest/config'

/**
 * 全パッケージ共通の Vitest 設定。
 *
 * 各 app / package で個別の vitest.config.ts が無ければこの設定が使われる。
 * 各 app（oauth / web）は vite plugin（cloudflare / react-router など）を持つため、
 * 個別に vitest.config.ts を置いてプラグインを除外している。
 */
export default defineConfig({
  test: {
    globals: true, // describe/it/expect をグローバルに使えるようにする
    environment: 'node', // crypto.subtle / getRandomValues / btoa は Node 22+ で利用可能
    include: ['**/*.{spec,test}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.wrangler/**', '**/.turbo/**'],
  },
})
