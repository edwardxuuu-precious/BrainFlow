import type { AuthMode } from '../../shared/auth-contract.js'

export interface AuthServerConfig {
  authMode: AuthMode
  stubUserId: string
  adminUsername: string
  adminPasswordHash: string | null
  sessionSecret: string | null
  sessionTtlSeconds: number
  canonicalOrigin: string | null
}

export function readAuthServerConfig(env: NodeJS.ProcessEnv = process.env): AuthServerConfig {
  const authMode: AuthMode = env.BRAINFLOW_AUTH_MODE === 'external' ? 'external' : 'stub'
  const adminUsername = env.BRAINFLOW_ADMIN_USERNAME?.trim() || 'admin'
  const config: AuthServerConfig = {
    authMode,
    stubUserId: env.BRAINFLOW_STUB_USER_ID?.trim() || 'user_stub_default',
    adminUsername,
    adminPasswordHash: env.BRAINFLOW_ADMIN_PASSWORD_HASH?.trim() || null,
    sessionSecret: env.BRAINFLOW_SESSION_SECRET?.trim() || null,
    sessionTtlSeconds: Number(env.BRAINFLOW_SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 30),
    canonicalOrigin: env.BRAINFLOW_CANONICAL_ORIGIN?.trim() || null,
  }

  if (config.authMode === 'external') {
    if (!config.sessionSecret) {
      throw new Error('BRAINFLOW_SESSION_SECRET is required when BRAINFLOW_AUTH_MODE=external.')
    }
    if (!config.adminPasswordHash) {
      throw new Error('BRAINFLOW_ADMIN_PASSWORD_HASH is required when BRAINFLOW_AUTH_MODE=external.')
    }
  }

  return config
}

export function getAuthenticatedUserId(config: AuthServerConfig): string {
  return config.authMode === 'external' ? 'user_local_admin' : config.stubUserId
}

