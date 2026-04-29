import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare()],
  server: {
    cors: {
      origin: true,       // リクエスト元をそのまま許可
      credentials: true,  // Access-Control-Allow-Credentials: true
    },
  },
})
