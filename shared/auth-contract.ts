export type AuthMode = 'stub' | 'external'

export interface AuthSessionResponse {
  authMode: AuthMode
  authenticated: boolean
  userId: string | null
  username: string | null
  canonicalOrigin: string | null
}

export interface AuthLoginRequest {
  username: string
  password: string
}

export interface AuthLoginResponse {
  session: AuthSessionResponse
}

