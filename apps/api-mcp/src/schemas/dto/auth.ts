/**
 * BFF 認証エンドポイント（/api/auth/*）の DTO スキーマ
 */

import { z } from 'zod'

// ── POST /api/auth/token ──────────────────────────

export const authTokenRequestSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(1),
  redirect_uri: z.string().url(),
})
export type AuthTokenRequest = z.infer<typeof authTokenRequestSchema>

export const authTokenResponseSchema = z.object({
  access_token: z.string(),
})
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>

// ── POST /api/auth/refresh ────────────────────────

export const authRefreshResponseSchema = z.object({
  access_token: z.string(),
  user: z.object({ id: z.string(), email: z.string() }),
})
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>

// ── POST /api/auth/logout ─────────────────────────

export const authLogoutResponseSchema = z.object({
  success: z.literal(true),
})
export type AuthLogoutResponse = z.infer<typeof authLogoutResponseSchema>
