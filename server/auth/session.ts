import { createHmac } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthServerConfig } from './config.js'

const SESSION_COOKIE_NAME = 'brainflow_session'
const SESSION_VERSION = 'v1'

interface SessionPayload {
  userId: string
  username: string
  expiresAt: number
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePayload(value: string): SessionPayload | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as SessionPayload
  } catch {
    return null
  }
}

export function createSessionCookieValue(payload: SessionPayload, secret: string): string {
  const encodedPayload = encodePayload(payload)
  const signature = signPayload(encodedPayload, secret)
  return `${SESSION_VERSION}.${encodedPayload}.${signature}`
}

export function readSessionFromContext(
  c: Context,
  config: AuthServerConfig,
): SessionPayload | null {
  if (!config.sessionSecret) {
    return null
  }

  const rawValue = getCookie(c, SESSION_COOKIE_NAME)
  if (!rawValue) {
    return null
  }

  const [version, encodedPayload, signature] = rawValue.split('.')
  if (version !== SESSION_VERSION || !encodedPayload || !signature) {
    return null
  }

  const expectedSignature = signPayload(encodedPayload, config.sessionSecret)
  if (signature !== expectedSignature) {
    return null
  }

  const payload = decodePayload(encodedPayload)
  if (!payload || payload.expiresAt <= Date.now()) {
    return null
  }

  return payload
}

export function setSessionCookie(
  c: Context,
  config: AuthServerConfig,
  payload: SessionPayload,
): void {
  if (!config.sessionSecret) {
    throw new Error('Session secret is missing.')
  }

  const value = createSessionCookieValue(payload, config.sessionSecret)
  const isSecure = new URL(c.req.url).protocol === 'https:'
  setCookie(c, SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecure,
    path: '/',
    maxAge: config.sessionTtlSeconds,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
  })
}

