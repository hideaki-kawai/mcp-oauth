/**
 * Result型
 *
 * 全てのservice/repositoryの戻り値に使用する統一的なエラーハンドリング型
 */
export type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }
