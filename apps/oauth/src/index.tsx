import { Hono } from 'hono'
import { renderer } from './renderer'
import { WellKnownController } from './routes/well-known/get'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>OAuth Server</h1>)
})

// ─────────────────────────────────────────────────────────
// OAuth Discovery（RFC 8414）
// ─────────────────────────────────────────────────────────
app.get(
  '/.well-known/oauth-authorization-server',
  WellKnownController.getAuthorizationServerMetadata,
)

export default app
