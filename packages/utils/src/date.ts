/**
 * 日付ユーティリティ
 *
 * date-fns の薄いラッパー。トークン有効期限の計算・判定に使用する。
 *
 * 各アプリは date-fns を直接 import せず、このモジュールを介する
 * （プロジェクト全体で一箇所に集約 → date-fns のバージョン管理が楽）。
 */
import { addSeconds, format, formatISO, isPast, parseISO, subDays } from 'date-fns'

// ─────────────────────────────────────────────────────────
// Date ベース（drizzle の mode: 'timestamp' / DB 用）
// ─────────────────────────────────────────────────────────

/**
 * 現在時刻から指定秒後の Date を返す
 *
 * authorization_codes.expires_at / refresh_tokens.expires_at の組み立てに使う。
 *
 * @example addSecondsFromNow(60 * 10) // 10 分後
 */
export const addSecondsFromNow = (seconds: number): Date => addSeconds(new Date(), seconds)

/**
 * 指定の日時が過去（= 期限切れ）かを返す
 *
 * トークン検証時の期限チェックに使う。
 *
 * @example isExpiredDate(codeRow.expiresAt) // true なら expired
 */
export const isExpiredDate = (date: Date): boolean => isPast(date)

// ─────────────────────────────────────────────────────────
// ISO 文字列ベース（API 契約・JSON シリアライズ用）
// ─────────────────────────────────────────────────────────

/**
 * 現在時刻から指定秒後の日時を ISO8601 文字列で返す
 *
 * @example expiresAt(300) // 5分後 → "2026-04-29T..."
 */
export const expiresAt = (seconds: number): string =>
  formatISO(addSeconds(new Date(), seconds))

/**
 * ISO8601 文字列の日時が期限切れかどうかを返す
 *
 * @example isExpired('2024-01-01T00:00:00Z') // true
 */
export const isExpired = (isoString: string): boolean => isPast(parseISO(isoString))

// ─────────────────────────────────────────────────────────
// 日付（YYYY-MM-DD）ベース（外部 API クエリ・履歴系で使う）
// ─────────────────────────────────────────────────────────

/**
 * 今日の日付を YYYY-MM-DD 形式で返す
 *
 * @example todayIso() // "2026-04-29"
 */
export const todayIso = (): string => format(new Date(), 'yyyy-MM-dd')

/**
 * 今日から N 日前の日付を YYYY-MM-DD 形式で返す
 *
 * @example daysAgoIso(7) // 7日前の "2026-04-22"
 */
export const daysAgoIso = (days: number): string =>
  format(subDays(new Date(), days), 'yyyy-MM-dd')
