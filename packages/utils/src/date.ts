/**
 * 日付ユーティリティ
 *
 * date-fns のラッパー。トークン有効期限の計算・判定に使用する。
 */
import { addSeconds, formatISO, isPast, parseISO } from 'date-fns'

/**
 * 現在時刻から指定秒後の日時を ISO8601 文字列で返す
 *
 * @example expiresAt(300) // 5分後
 */
export const expiresAt = (seconds: number): string =>
  formatISO(addSeconds(new Date(), seconds))

/**
 * ISO8601 文字列の日時が期限切れかどうかを返す
 *
 * @example isExpired('2024-01-01T00:00:00Z') // true
 */
export const isExpired = (isoString: string): boolean =>
  isPast(parseISO(isoString))
