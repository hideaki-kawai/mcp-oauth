import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// 仮
/**
 * MCPセッション
 * ClaudeからMCPサーバーへのアクセスセッション管理
 */
export const mcpSessions = sqliteTable('mcp_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * MCPリソース
 * サーバーが提供するリソースの定義
 */
export const mcpResources = sqliteTable('mcp_resources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  uri: text('uri').notNull().unique(),
  description: text('description'),
  mimeType: text('mime_type'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
