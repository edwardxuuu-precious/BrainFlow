import type { SyncEntityType, SyncEnvelope } from '../../shared/sync-contract.js'
import { computeStableContentHash } from '../../shared/stable-hash.js'

function clonePayloadObject<TPayload>(payload: TPayload): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return { ...(payload as Record<string, unknown>) }
}

export function createSyncCopyId(sourceId: string): string {
  return `${sourceId}_copy_${Math.random().toString(36).slice(2, 7)}`
}

export function buildSaveLocalCopyRecord<TPayload>(
  entityType: SyncEntityType,
  localRecord: SyncEnvelope<TPayload>,
  options?: {
    deviceId?: string
    updatedAt?: number
  },
): SyncEnvelope<TPayload> {
  const copyId = createSyncCopyId(localRecord.id)
  const updatedAt = options?.updatedAt ?? Date.now()
  const payloadObject = clonePayloadObject(localRecord.payload)

  const payload =
    payloadObject === null
      ? localRecord.payload
      : ({
          ...payloadObject,
          id: copyId,
          updatedAt,
          ...(entityType === 'conversation' ? { sessionId: copyId } : {}),
        } as TPayload)

  return {
    ...localRecord,
    id: copyId,
    deviceId: options?.deviceId ?? localRecord.deviceId,
    version: 1,
    baseVersion: null,
    contentHash: computeStableContentHash(payload),
    updatedAt,
    deletedAt: null,
    syncStatus: 'synced',
    payload,
  }
}
