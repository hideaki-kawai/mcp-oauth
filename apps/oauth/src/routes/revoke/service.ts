/**
 * RevokeService — POST /revoke のビジネスロジック
 *
 * RFC 7009 に従いリフレッシュトークンを失効させる。
 * トークンが存在しない・既に失効済みの場合も 200 を返す（仕様準拠）。
 */

import type { Result } from '@mcp-oauth/types'
import { RevokeRepository } from './repository'

export class RevokeService {
  static async revoke(d1: D1Database, token: string): Promise<Result<void>> {
    return RevokeRepository.revokeRefreshToken(d1, token)
  }
}
