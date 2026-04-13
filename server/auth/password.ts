import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

function toBase64Url(value: Buffer): string {
  return value.toString('base64url')
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

export function createPasswordHash(password: string): string {
  if (!password) {
    throw new Error('Password is required.')
  }

  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })

  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    toBase64Url(salt),
    toBase64Url(derived),
  ].join('$')
}

export function verifyPasswordHash(password: string, serializedHash: string): boolean {
  if (!password || !serializedHash) {
    return false
  }

  const parts = serializedHash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts
  const n = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }

  try {
    const salt = fromBase64Url(saltRaw)
    const expected = fromBase64Url(hashRaw)
    const derived = scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
    })

    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

