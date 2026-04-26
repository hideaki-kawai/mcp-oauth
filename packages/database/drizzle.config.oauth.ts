import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/oauth/schema.ts',
  out: './migrations/oauth',
  dialect: 'sqlite',
})
