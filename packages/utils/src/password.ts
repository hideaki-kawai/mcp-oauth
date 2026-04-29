/**
 * パスワードハッシュ（PBKDF2 + SHA-256）
 *
 * Cloudflare Workers のネイティブ `crypto.subtle` を使うため Workers 上でも動く。
 * Node.js 22+ にも `crypto.subtle` / `crypto.getRandomValues` / `btoa` / `atob` が
 * グローバルに存在するので、シーダーや CLI ツールからも同じ関数を使える。
 *
 * 形式: `pbkdf2$<iterations>$<salt_b64>$<hash_b64>`
 *   - iterations: ストレッチ回数（将来上げたい場合に検証側で吸収できるよう保存）
 *   - salt: 16 バイトのランダム値（Base64）
 *   - hash: 32 バイトの導出鍵（Base64）
 */

const PBKDF2_ITERATIONS = 100_000 // Workers の CPU 制限（無料: 10ms）と安全性のバランス
const PBKDF2_KEY_LENGTH_BYTES = 32 // 256 bits
const PBKDF2_SALT_LENGTH_BYTES = 16 // 128 bits
const PBKDF2_HASH_ALGO = 'SHA-256'

/**
 * 平文パスワードをハッシュ化する
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LENGTH_BYTES))
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

/**
 * 平文パスワードと保存済みハッシュを照合する
 *
 * - 形式不正・スキーム違いは即 false
 * - タイミング攻撃を避けるため定数時間比較を行う
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4) return false
  const [scheme, iterStr, saltB64, expectedHashB64] = parts
  if (scheme !== 'pbkdf2') return false

  const iterations = Number(iterStr)
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  const salt = base64ToBytes(saltB64)
  const expectedHash = base64ToBytes(expectedHashB64)
  const actualHash = await deriveBits(password, salt, iterations)
  return timingSafeEqual(expectedHash, actualHash)
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: PBKDF2_HASH_ALGO },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BYTES * 8
  )
  return new Uint8Array(derived)
}

function bytesToBase64(bytes: Uint8Array): string {
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  return btoa(str)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** タイミング攻撃を避けるための定数時間比較 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
