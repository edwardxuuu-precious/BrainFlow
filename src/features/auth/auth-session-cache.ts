import type { AuthSessionResponse } from '../../../shared/auth-contract'

const AUTH_SESSION_CACHE_KEY = 'brainflow-auth-session-v1'

export function readAuthSessionCache(): AuthSessionResponse | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(AUTH_SESSION_CACHE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthSessionResponse
  } catch {
    localStorage.removeItem(AUTH_SESSION_CACHE_KEY)
    return null
  }
}

export function writeAuthSessionCache(session: AuthSessionResponse | null): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  if (!session) {
    localStorage.removeItem(AUTH_SESSION_CACHE_KEY)
    return
  }

  localStorage.setItem(AUTH_SESSION_CACHE_KEY, JSON.stringify(session))
}

