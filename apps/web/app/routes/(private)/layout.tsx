/**
 * 認証必須レイアウト
 *
 * このレイアウト配下のルートは全て authMiddleware を通過する。
 * 未認証の場合は /login へリダイレクトされる。
 */

import { Outlet } from 'react-router'
import { authMiddleware } from '~/shared/middlewares/auth-middleware'
import { authContext } from '~/shared/middlewares/auth-context'
import type { Route } from './+types/layout'

export const clientMiddleware = [authMiddleware]

export const clientLoader = async ({ context }: Route.ClientLoaderArgs) => {
  const user = context.get(authContext)
  return { user }
}

export default function PrivateLayout() {
  return <Outlet />
}
