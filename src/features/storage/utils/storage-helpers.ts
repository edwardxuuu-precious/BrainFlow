/**
 * Storage helper functions for localStorage
 */

export function readJsonStorage<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJsonStorage(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}

export function readTimestampStorage(key: string): number | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }
  try {
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : parsed
  } catch {
    return null
  }
}

export function writeTimestampStorage(key: string, value: number): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(key, String(value))
}
