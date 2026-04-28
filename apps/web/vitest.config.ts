import { defineConfig } from 'vitest/config'

/**
 * apps/web のテスト用設定。
 *
 * vite.config.ts には @react-router/dev/vite と @tailwindcss/vite が含まれており、
 * 開発サーバー起動時に React Router のルーティングを生成する。
 * テスト時はそれが不要なので、別ファイルでプラグインなしの設定に切り替える。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['app/**/*.{spec,test}.{ts,tsx}'],
  },
})
