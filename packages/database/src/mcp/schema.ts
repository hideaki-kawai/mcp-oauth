/**
 * api-mcpサーバー DB（DB_API_MCP）のスキーマ定義
 *
 * このDBは api-mcp サーバーが提供するアプリ固有のデータを格納する。
 * MCP プロトコルのリソース/ツール定義は `McpServer.registerResource()` /
 * `registerTool()` でコードから登録するため、MCP 専用のテーブルは不要。
 * ここに置くのは「普通の Web アプリと同じドメインデータ」のテーブル
 * （例: ノート、ToDo、ユーザー設定 など）。
 *
 * NOTE: 現時点ではテーブル未定義。
 *   - アプリの具体的な機能が決まったらテーブルを追加する
 *   - テーブルが 1 つも無い状態で `drizzle-kit generate` を実行するとエラーになるため、
 *     最初のテーブルを定義するまで `pnpm -F @mcp-oauth/database db:generate:mcp` は実行しない
 */
export {}
