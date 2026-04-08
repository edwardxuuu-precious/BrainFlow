import type { StorageConflictRecord } from '../domain/sync-records'

export interface ConflictDisplayItem {
  key: string
  conflict: StorageConflictRecord
  title: string
  duplicateCount: number
}

function resolveConflictTitle(conflict: StorageConflictRecord): string {
  const localPayload = conflict.localPayload as { title?: string } | null
  const cloudPayload = conflict.cloudPayload as { title?: string } | null
  return localPayload?.title ?? cloudPayload?.title ?? conflict.entityId
}

export function buildConflictDisplayItems(conflicts: StorageConflictRecord[]): ConflictDisplayItem[] {
  const items = new Map<string, ConflictDisplayItem>()

  for (const conflict of [...conflicts].sort((left, right) => right.detectedAt - left.detectedAt)) {
    const key = `${conflict.entityType}:${conflict.entityId}`
    const existing = items.get(key)
    if (existing) {
      existing.duplicateCount += 1
      continue
    }

    items.set(key, {
      key,
      conflict,
      title: resolveConflictTitle(conflict),
      duplicateCount: 0,
    })
  }

  return Array.from(items.values())
}
