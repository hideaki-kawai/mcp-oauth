/**
 * GET / POST /mcp — MCP プロトコルのエンドポイント
 *
 * Streamable HTTP transport（@hono/mcp）を使う。
 * authMiddleware を上流で適用済みなので、ここでは認証済みリクエストのみ届く。
 *
 * 各リクエストごとに新しい McpServer インスタンスを作るのは Workers のステートレス性の都合。
 * 重い初期化は無いので問題ない。
 */

import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import type { AppEnv } from '../../types'
import { registerPrompts } from './prompts'
import { registerTools } from './tools'

const route = new Hono<AppEnv>().on(['GET', 'POST'], '/', async (c) => {
  const server = new McpServer({
    name: 'mcp-oauth',
    version: '0.0.1',
  })

  registerTools(server)
  registerPrompts(server)

  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})

export default route
