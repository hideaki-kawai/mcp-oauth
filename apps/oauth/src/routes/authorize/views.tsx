/**
 * /authorize 画面の JSX コンポーネント
 *
 * Hono JSX で server-side renderer する。CSS は /src/style.css 経由で Tailwind を読み込む。
 * 画面遷移の hidden フィールドは docs/05-screens.md の仕様に準拠。
 */

import { OAUTH_PATHS } from '@mcp-oauth/constants'
import type { AuthorizeQuery } from '../../schemas/dto'

/** scope 文字列を表示用ラベル配列に変換する */
const SCOPE_LABELS: Record<string, string> = {
  read: 'データの読み取り',
  write: 'データの書き込み',
}

function scopeLabels(scope: string | undefined): string[] {
  if (!scope) return []
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => SCOPE_LABELS[s] ?? s)
}

// ─────────────────────────────────────────────────────────
// 共通レイアウト
// ─────────────────────────────────────────────────────────

function Card({ children }: { children: unknown }) {
  return (
    <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div class="bg-white p-8 rounded-lg shadow w-full max-w-md">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ログイン画面
// ─────────────────────────────────────────────────────────

type LoginScreenProps = {
  query: AuthorizeQuery
  /** ログイン失敗時のエラーメッセージ（再表示用） */
  errorMessage?: string
}

export function LoginScreen({ query, errorMessage }: LoginScreenProps) {
  return (
    <Card>
      <h1 class="text-2xl font-bold mb-6">ログイン</h1>
      {errorMessage && <p class="text-red-600 text-sm mb-4">{errorMessage}</p>}
      <form method="post" action={OAUTH_PATHS.AUTHORIZE_LOGIN}>
        {/* OAuth フロー継続のため hidden で全パラメータを引き継ぐ */}
        <input type="hidden" name="response_type" value={query.response_type} />
        <input type="hidden" name="client_id" value={query.client_id} />
        <input type="hidden" name="redirect_uri" value={query.redirect_uri} />
        <input type="hidden" name="code_challenge" value={query.code_challenge} />
        <input type="hidden" name="code_challenge_method" value={query.code_challenge_method} />
        {query.scope !== undefined && <input type="hidden" name="scope" value={query.scope} />}
        {query.state !== undefined && <input type="hidden" name="state" value={query.state} />}

        <div class="mb-4">
          <label class="block text-sm font-medium mb-1" for="email">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            name="email"
            class="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <div class="mb-6">
          <label class="block text-sm font-medium mb-1" for="password">
            パスワード
          </label>
          <input
            id="password"
            type="password"
            name="password"
            class="w-full border rounded px-3 py-2"
            required
          />
        </div>
        <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          ログイン
        </button>
      </form>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────
// 同意画面
// ─────────────────────────────────────────────────────────

type ConsentScreenProps = {
  query: AuthorizeQuery
  clientName: string
  /** クライアント登録時のスコープ（query.scope が無い場合のフォールバック） */
  fallbackScope: string
}

export function ConsentScreen({ query, clientName, fallbackScope }: ConsentScreenProps) {
  const requestedScope = query.scope ?? fallbackScope
  const labels = scopeLabels(requestedScope)

  return (
    <Card>
      <h1 class="text-xl font-bold mb-2">アクセスの許可</h1>
      <p class="text-gray-600 mb-6">
        <span class="font-semibold">{clientName}</span>
        があなたのアカウントへのアクセスを求めています
      </p>

      <div class="border rounded p-4 mb-6">
        <p class="text-sm font-medium text-gray-700 mb-2">要求されている権限:</p>
        <ul class="space-y-1">
          {labels.map((label) => (
            <li class="flex items-center text-sm text-gray-600">
              <span class="mr-2">✓</span>
              {label}
            </li>
          ))}
        </ul>
      </div>

      <form method="post" action={OAUTH_PATHS.AUTHORIZE_CONSENT}>
        <input type="hidden" name="response_type" value={query.response_type} />
        <input type="hidden" name="client_id" value={query.client_id} />
        <input type="hidden" name="redirect_uri" value={query.redirect_uri} />
        <input type="hidden" name="code_challenge" value={query.code_challenge} />
        <input type="hidden" name="code_challenge_method" value={query.code_challenge_method} />
        <input type="hidden" name="scope" value={requestedScope} />
        {query.state !== undefined && <input type="hidden" name="state" value={query.state} />}

        <div class="flex gap-3">
          <button
            type="submit"
            name="action"
            value="deny"
            class="flex-1 border border-gray-300 py-2 rounded hover:bg-gray-50"
          >
            拒否する
          </button>
          <button
            type="submit"
            name="action"
            value="approve"
            class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            許可する
          </button>
        </div>
      </form>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────
// エラー画面
// ─────────────────────────────────────────────────────────

type ErrorScreenProps = {
  title: string
  message: string
}

export function ErrorScreen({ title, message }: ErrorScreenProps) {
  return (
    <Card>
      <h1 class="text-xl font-bold mb-2 text-red-600">{title}</h1>
      <p class="text-gray-600 text-sm">{message}</p>
    </Card>
  )
}
