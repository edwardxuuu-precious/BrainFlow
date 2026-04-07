import type { AiTopicMetadataPatch } from './ai-contract.js'

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value
    .map((item) => normalizeText(typeof item === 'string' ? item : undefined))
    .filter((item): item is string => !!item)
}

export function sanitizeAiWritableMetadataPatch(value: unknown): AiTopicMetadataPatch | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const raw = value as {
    labels?: unknown
    type?: unknown
  }
  const patch: AiTopicMetadataPatch = {}

  if ('labels' in raw) {
    patch.labels = normalizeStringArray(raw.labels) ?? []
  }

  if ('type' in raw) {
    if (raw.type === null) {
      patch.type = null
    } else {
      const type = normalizeText(typeof raw.type === 'string' ? raw.type : undefined)
      if (type && ['normal', 'milestone', 'task'].includes(type)) {
        patch.type = type as Exclude<AiTopicMetadataPatch['type'], null | undefined>
      }
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}
