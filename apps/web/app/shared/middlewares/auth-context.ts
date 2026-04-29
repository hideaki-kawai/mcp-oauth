/**
 * 認証ユーザーのコンテキスト
 *
 * React Router v7 の createContext で生成し、
 * authMiddleware が context.set() でセット、
 * (private)/layout.tsx が context.get() で読み取ってローダーデータに乗せる。
 */

import { createContext } from 'react-router'
import type { AuthUser } from '~/shared/lib/auth-store'

export type { AuthUser }

export const authContext = createContext<AuthUser | null>(null)
