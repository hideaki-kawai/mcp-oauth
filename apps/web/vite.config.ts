import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Chrome DevTools が /.well-known/appspecific/com.chrome.devtools.json を自動ポーリングするため、
// React Router に到達する前に 404 を返してエラーログを抑制する
const suppressChromeDevtoolsJson: Plugin = {
  name: 'suppress-chrome-devtools-json',
  configureServer(server) {
    server.middlewares.use('/.well-known', (_req, res) => {
      res.statusCode = 404
      res.end()
    })
  },
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), suppressChromeDevtoolsJson],
  resolve: {
    tsconfigPaths: true,
  },
})
