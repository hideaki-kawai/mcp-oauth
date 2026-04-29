/**
 * アクセストークンとユーザー情報のメモリ管理
 *
 * - メモリ変数のみで保持する（XSS リスク軽減）
 * - ページリロードで消える → /api/auth/refresh で自動復元される（httpOnly Cookie 経由）
 * - リフレッシュトークンは httpOnly Cookie に格納されているため
 *   JS から直接触れない（api-mcp BFF が管理する）
 *
 * @see docs/03-endpoints.md「アクセストークン管理（SPA: authStore）」
 */

export type AuthUser = {
  id: string
  email: string
}

let accessToken: string | null = null
let currentUser: AuthUser | null = null

export const authStore = {
  getToken: (): string | null => accessToken,

  getUser: (): AuthUser | null => currentUser,

  setToken: (token: string, user: AuthUser): void => {
    accessToken = token
    currentUser = user
  },

  clearToken: (): void => {
    accessToken = null
    currentUser = null
  },
}
