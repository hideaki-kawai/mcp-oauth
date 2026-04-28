/**
 * POST /authorize/consent のフォームスキーマ
 *
 * 同意画面 (views.tsx の ConsentScreen) から送られてくる:
 *   - action: approve / deny
 *   - OAuth フローを継続するための hidden field
 *
 * client_id / redirect_uri はユーザーが DevTools で書き換えられるので、
 * service 層で再度 DB と照合する。
 */

import { z } from 'zod'

export const authorizeConsentFormSchema = z.object({
  action: z.enum(['approve', 'deny']),

  // OAuth フロー継続用
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal('S256'),
  scope: z.string(),
  state: z.string().optional(),
})

export type AuthorizeConsentForm = z.infer<typeof authorizeConsentFormSchema>
