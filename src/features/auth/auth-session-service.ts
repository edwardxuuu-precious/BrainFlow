import type {
  AuthLoginResponse,
  AuthSessionResponse,
} from '../../../shared/auth-contract'
import { readAuthSessionCache, writeAuthSessionCache } from './auth-session-cache'
import { dispatchAuthInvalidEvent } from './auth-events'

export class AuthSessionError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T | { message?: string } | null
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload && payload.message
        ? String(payload.message)
        : `HTTP ${response.status}`
    if (response.status === 401) {
      writeAuthSessionCache(null)
      dispatchAuthInvalidEvent()
    }
    throw new AuthSessionError(response.status, message)
  }

  return payload as T
}

export class AuthSessionService {
  async getSession(): Promise<AuthSessionResponse> {
    const response = await fetch('/api/auth/session', {
      credentials: 'same-origin',
    })
    const session = await parseJson<AuthSessionResponse>(response)
    writeAuthSessionCache(session)
    return session
  }

  async login(username: string, password: string): Promise<AuthSessionResponse> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
      }),
    })
    const payload = await parseJson<AuthLoginResponse>(response)
    writeAuthSessionCache(payload.session)
    return payload.session
  }

  async logout(): Promise<AuthSessionResponse> {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
    const payload = await parseJson<AuthLoginResponse>(response)
    writeAuthSessionCache(payload.session.authenticated ? payload.session : null)
    dispatchAuthInvalidEvent()
    return payload.session
  }
}

export const authSessionService = new AuthSessionService()

export function getCachedAuthSession(): AuthSessionResponse | null {
  return readAuthSessionCache()
}
