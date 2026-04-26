import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/mcp/schema.ts',
  out: './migrations/mcp',
  dialect: 'sqlite',
})
