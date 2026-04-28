/**
 * POST /authorize/login のフォームスキーマ
 *
 * - email / password: ユーザー入力
 * - その他: /authorize から引き継がれる OAuth フローパラメータ（hidden field）
 */

import { z } from 'zod'

export const authorizeLoginFormSchema = z.object({
  email: z.email({ message: '有効なメールアドレスを入力してください' }),
  password: z.string().min(1, { message: 'パスワードは必須です' }),

  // OAuth フロー継続用（views.tsx の hidden field と一致させる）
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal('S256'),
  scope: z.string().optional(),
  state: z.string().optional(),
})

export type AuthorizeLoginForm = z.infer<typeof authorizeLoginFormSchema>
