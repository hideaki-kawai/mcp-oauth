/**
 * アクセストークンのメモリ管理
 *
 * - 本来はメモリ変数のみで保持する設計（XSS リスク軽減）
 * - フェーズ 5 の認証フロー実装前は sessionStorage にも保存して
 *   ページリロードしてもトークン入力をやり直さなくて済むようにする
 *   （開発用便宜措置。フェーズ 5 で sessionStorage 保存は削除予定）
 *
 * @see docs/03-endpoints.md「アクセストークン管理（SPA: authStore）」
 */

const SESSION_KEY = 'devAccessToken'

let accessToken: string | null = null

// 初回読み込み時に sessionStorage から復元
if (typeof window !== 'undefined') {
  accessToken = sessionStorage.getItem(SESSION_KEY)
}

export const authStore = {
  getToken: (): string | null => accessToken,

  setToken: (token: string | null): void => {
    accessToken = token
    if (typeof window !== 'undefined') {
      if (token === null) sessionStorage.removeItem(SESSION_KEY)
      else sessionStorage.setItem(SESSION_KEY, token)
    }
  },

  clearToken: (): void => {
    accessToken = null
    if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_KEY)
  },
}
