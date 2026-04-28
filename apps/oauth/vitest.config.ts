import { defineConfig } from 'vitest/config'

/**
 * apps/oauth のテスト用設定。
 *
 * vite.config.ts には @cloudflare/vite-plugin が含まれており、
 * 本番ビルド時に wrangler.jsonc を読み込んで D1 などの bindings を注入する。
 * テスト時はそれが不要なので、別ファイルでプラグインなしの設定に切り替える。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
  },
})
