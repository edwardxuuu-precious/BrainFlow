import type { Context } from 'hono'

export interface AuthContext {
  userId: string
  authMode: 'stub' | 'external'
}

export function resolveAuthContext(c: Context): AuthContext {
  const authMode = (process.env.BRAINFLOW_AUTH_MODE === 'external' ? 'external' : 'stub')
  const headerUserId = c.req.header('x-user-id')
  const stubUserId = process.env.BRAINFLOW_STUB_USER_ID?.trim() || 'user_stub_default'

  return {
    userId: authMode === 'external' ? headerUserId?.trim() || stubUserId : stubUserId,
    authMode,
  }
}
