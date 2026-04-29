/**
 * Dynamic Client Registration（RFC 7591）の DTO スキーマ
 *
 * POST /register
 */

import { z } from 'zod'

/**
 * DCR リクエストスキーマ
 *
 * - redirect_uris: 必須・1 件以上
 *     URL の厳密検証は行わない（loopback IP / カスタムスキームを許容するため）
 * - grant_types: authorization_code / refresh_token のサブセットのみ許可
 * - response_types: "code" のみ許可（OAuth 2.1）
 * - token_endpoint_auth_method: "none" のみ許可（public client）
 * - scope: 任意の文字列（スペース区切り）
 *
 * 仕様外の値が来たら 400 で拒否する（OAuth 2.1 + MCP 仕様の厳格化方針）。
 * `.strict()` で未知のフィールドも拒否する。
 */
export const registerRequestSchema = z
  .object({
    redirect_uris: z.array(z.string().min(1)).min(1, 'redirect_uris must have at least 1 entry'),
    client_name: z.string().min(1).optional(),
    grant_types: z
      .array(z.enum(['authorization_code', 'refresh_token']))
      .min(1)
      .optional(),
    response_types: z.array(z.literal('code')).min(1).optional(),
    token_endpoint_auth_method: z.literal('none').optional(),
    scope: z.string().optional(),
  })
  .strict()

export type RegisterRequest = z.infer<typeof registerRequestSchema>

/**
 * DCR レスポンススキーマ（RFC 7591 §3.2.1）
 */
export const registerResponseSchema = z.object({
  client_id: z.string(),
  /** Unix 秒 */
  client_id_issued_at: z.number(),
  redirect_uris: z.array(z.string()),
  client_name: z.string(),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])),
  response_types: z.array(z.literal('code')),
  token_endpoint_auth_method: z.literal('none'),
  scope: z.string(),
})

export type RegisterResponse = z.infer<typeof registerResponseSchema>
