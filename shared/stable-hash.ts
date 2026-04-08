import { createHash } from 'node:crypto'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item))
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue(value[key])
        return result
      }, {})
  }

  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function computeStableContentHash(value: unknown): string {
  const serialized = stableStringify(value)
  const digest = createHash('sha256').update(serialized).digest('hex')
  return `sha256:${digest}`
}
