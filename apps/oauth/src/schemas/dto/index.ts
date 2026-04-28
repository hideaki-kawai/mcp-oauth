/**
 * DTO（Data Transfer Object）スキーマ
 *
 * OAuth サーバーのリクエスト/レスポンス zod スキーマ。
 * - OpenAPI ドキュメント生成（resolver(schema)）
 * - リクエスト検証（validator('json', schema)）
 *
 * api-mcp の schemas/dto と同じ構造で揃えている。
 */

export * from './errors'
export * from './register'
export * from './well-known'
