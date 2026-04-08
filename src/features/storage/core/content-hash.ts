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

export async function computeContentHash(value: unknown): Promise<string> {
  const serialized = stableStringify(value)
  const encoded = new TextEncoder().encode(serialized)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const bytes = Array.from(new Uint8Array(digest))
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

