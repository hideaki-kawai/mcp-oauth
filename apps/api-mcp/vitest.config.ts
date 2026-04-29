import { defineConfig } from 'vitest/config'

/**
 * apps/api-mcp のテスト用設定。
 *
 * vite.config.ts には @cloudflare/vite-plugin が含まれており、
 * dev/build 時に wrangler.jsonc を読み込む。テスト時はそれが不要なので、
 * 別ファイルでプラグインなしの設定に切り替える。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
  },
})
