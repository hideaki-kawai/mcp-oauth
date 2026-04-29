import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  route('login', 'routes/login/page.tsx'),
  route('auth/callback', 'routes/auth/callback/page.tsx'),
  layout('routes/(private)/layout.tsx', [index('routes/(private)/home/page.tsx')]),
] satisfies RouteConfig
