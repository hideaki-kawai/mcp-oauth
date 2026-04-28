/**
 * OAuth DB シーダー
 *
 * 初期データを oauth-db に投入する。
 *   - 管理者ユーザー（admin@example.com / password）
 *   - Web クライアント（事前登録）
 *
 * 使い方:
 *   pnpm -F @mcp-oauth/database db:seed              # ローカル D1
 *   pnpm -F @mcp-oauth/database db:seed:remote       # 本番 D1
 *
 * 仕組み:
 *   1. パスワードを PBKDF2 ハッシュ化
 *   2. INSERT 文を組み立てて一時 SQL ファイルへ書き出し
 *   3. apps/oauth 配下で `wrangler d1 execute oauth-db --file=...` を実行
 *
 * 再実行可能（INSERT OR REPLACE で固定 ID を使用）。
 *
 * ─────────────────────────────────────────────────────────
 * なぜ Web クライアントを事前登録するのか
 * ─────────────────────────────────────────────────────────
 *
 * このプロジェクトには OAuth クライアントが 2 種類いる:
 *
 *   ┌─────────────┬───────────────────┬─────────────────────────────┐
 *   │ クライアント │ 登録タイミング    │ 登録方法                    │
 *   ├─────────────┼───────────────────┼─────────────────────────────┤
 *   │ web-client  │ 初期セットアップ  │ シーダー（このファイル）    │
 *   │ Claude      │ 初接続時          │ POST /register（DCR）       │
 *   └─────────────┴───────────────────┴─────────────────────────────┘
 *
 * 両方とも同じ `oauth_clients` テーブルに保存される。
 * OAuth サーバーは web/Claude を区別せず統一的に扱う（→ コード分岐ゼロ）。
 *
 * 「web も DCR にすればいいのでは？」という疑問への答え:
 *
 *   DCR は『見たことない相手を動的に受け入れる』ための仕組み。
 *   web SPA は私たち自身が作っている既知のアプリなので、DCR の出番ではない。
 *
 *   web を DCR にすると以下の不便が生じる:
 *     1. SPA 起動時に毎回 `/register` を叩く必要がある（往復が増える）
 *     2. 取得した client_id を localStorage 等に保存する管理が必要
 *     3. ブラウザ変更・キャッシュクリアのたびに `oauth_clients` に新しい行が増える
 *
 *   事前登録なら client_id を SPA にハードコードできて、レコードも常に 1 行。
 *
 * 詳細は docs/learning/oauth-clients.md を参照。
 * ─────────────────────────────────────────────────────────
 */

import { execSync } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from '@mcp-oauth/utils'

// ─────────────────────────────────────────────────────────
// シードデータ定義
// ─────────────────────────────────────────────────────────

const ADMIN_USER_ID = 'seed-user-admin'
const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'password'

const WEB_CLIENT_ID = 'web-client'
const WEB_CLIENT_NAME = 'web'
// web フロントエンドの dev サーバーポート（apps/web/package.json の dev スクリプトと一致させる）
const WEB_REDIRECT_URIS = ['http://localhost:30000/auth/callback']
const WEB_SCOPES = 'read write'

// ─────────────────────────────────────────────────────────
// SQL 生成
// ─────────────────────────────────────────────────────────

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

interface SeedAdminUser {
  id: string
  email: string
  password: string
}

interface SeedOAuthClient {
  id: string
  name: string
  redirectUris: string[]
  scopes: string
}

async function buildSql(
  admin: SeedAdminUser,
  client: SeedOAuthClient,
): Promise<string> {
  const passwordHash = await hashPassword(admin.password)
  const now = Math.floor(Date.now() / 1000)
  const redirectUrisJson = JSON.stringify(client.redirectUris)

  return [
    `-- 管理者ユーザー`,
    `INSERT OR REPLACE INTO users (id, email, password_hash, role, created_at, updated_at)`,
    `VALUES ('${admin.id}', '${escapeSql(admin.email)}', '${escapeSql(passwordHash)}', 'admin', ${now}, ${now});`,
    ``,
    `-- Web クライアント（事前登録）`,
    `INSERT OR REPLACE INTO oauth_clients (id, name, redirect_uris, token_endpoint_auth_method, scopes, created_at)`,
    `VALUES ('${client.id}', '${escapeSql(client.name)}', '${escapeSql(redirectUrisJson)}', 'none', '${escapeSql(client.scopes)}', ${now});`,
    ``,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────
// エントリポイント
// ─────────────────────────────────────────────────────────

type Target = 'local' | 'remote'

async function main() {
  const target = (process.argv[2] ?? 'local') as Target
  if (target !== 'local' && target !== 'remote') {
    console.error('Usage: pnpm db:seed [local|remote]')
    process.exit(1)
  }

  console.log(`🌱 OAuth DB シーダー開始（target: ${target}）`)

  const admin: SeedAdminUser = {
    id: ADMIN_USER_ID,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  }
  const client: SeedOAuthClient = {
    id: WEB_CLIENT_ID,
    name: WEB_CLIENT_NAME,
    redirectUris: WEB_REDIRECT_URIS,
    scopes: WEB_SCOPES,
  }

  const sql = await buildSql(admin, client)
  const tmpFile = join(tmpdir(), `mcp-oauth-seed-${Date.now()}.sql`)
  writeFileSync(tmpFile, sql)

  try {
    const flag = target === 'local' ? '--local' : '--remote'
    const cmd = `pnpm -F @mcp-oauth/oauth exec wrangler d1 execute oauth-db ${flag} --file="${tmpFile}"`
    execSync(cmd, { stdio: 'inherit' })

    console.log(`\n✅ シーダー完了`)
    console.log(`   admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
    console.log(`   web client: ${WEB_CLIENT_ID}`)
  } finally {
    unlinkSync(tmpFile)
  }
}

main().catch((err) => {
  console.error('❌ シーダー失敗:', err)
  process.exit(1)
})
