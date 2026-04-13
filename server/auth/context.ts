import type { Context } from 'hono'
import { getAuthenticatedUserId, readAuthServerConfig } from './config.js'
import { readSessionFromContext } from './session.js'

export interface AuthContext {
  userId: string | null
  username: string | null
  authMode: 'stub' | 'external'
  authenticated: boolean
}

export function resolveAuthContext(c: Context): AuthContext {
  const config = readAuthServerConfig()

  if (config.authMode === 'stub') {
    return {
      userId: config.stubUserId,
      username: config.adminUsername,
      authMode: 'stub',
      authenticated: true,
    }
  }

  const session = readSessionFromContext(c, config)
  if (!session || session.username !== config.adminUsername) {
    return {
      userId: null,
      username: null,
      authMode: 'external',
      authenticated: false,
    }
  }

  return {
    userId: session.userId || getAuthenticatedUserId(config),
    username: session.username,
    authMode: 'external',
    authenticated: true,
  }
}
