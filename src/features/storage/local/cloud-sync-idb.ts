import type {
  DeviceInfoRecord,
  StorageConflictRecord,
  StoragePendingOp,
  SyncedConversationRecord,
  SyncedDocumentRecord,
  SyncStateRecord,
} from '../domain/sync-records'
import type { SyncEntityType } from '../../../../shared/sync-contract'
import { normalizeStorageConflictRecord } from '../domain/sync-records'

const DB_NAME = 'brainflow-sync-v2'
const DB_VERSION = 1
const DOCUMENTS_STORE = 'documents_cache'
const CONVERSATIONS_STORE = 'conversations_cache'
const PENDING_OPS_STORE = 'pending_ops'
const SYNC_STATE_STORE = 'sync_state'
const DEVICE_INFO_STORE = 'device_info'
const CONFLICTS_STORE = 'sync_conflicts'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const store = database.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' })
        store.createIndex('workspaceId', 'workspaceId', { unique: false })
        store.createIndex('syncStatus', 'syncStatus', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
        store.createIndex('deletedAt', 'deletedAt', { unique: false })
      }
      if (!database.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const store = database.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' })
        store.createIndex('workspaceId', 'workspaceId', { unique: false })
        store.createIndex('documentId', 'payload.documentId', { unique: false })
        store.createIndex('syncStatus', 'syncStatus', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
        store.createIndex('deletedAt', 'deletedAt', { unique: false })
      }
      if (!database.objectStoreNames.contains(PENDING_OPS_STORE)) {
        const store = database.createObjectStore(PENDING_OPS_STORE, { keyPath: 'opId' })
        store.createIndex('workspaceId', 'workspaceId', { unique: false })
        store.createIndex('entityId', 'entityId', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!database.objectStoreNames.contains(SYNC_STATE_STORE)) {
        database.createObjectStore(SYNC_STATE_STORE, { keyPath: 'workspaceId' })
      }
      if (!database.objectStoreNames.contains(DEVICE_INFO_STORE)) {
        database.createObjectStore(DEVICE_INFO_STORE, { keyPath: 'deviceId' })
      }
      if (!database.objectStoreNames.contains(CONFLICTS_STORE)) {
        const store = database.createObjectStore(CONFLICTS_STORE, { keyPath: 'id' })
        store.createIndex('workspaceId', 'workspaceId', { unique: false })
        store.createIndex('entityId', 'entityId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = handler(store)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

export class CloudSyncIdb {
  listDocuments(): Promise<SyncedDocumentRecord[]> {
    return withStore(DOCUMENTS_STORE, 'readonly', (store) => store.getAll()) as Promise<SyncedDocumentRecord[]>
  }

  getDocument(id: string): Promise<SyncedDocumentRecord | null> {
    return withStore(DOCUMENTS_STORE, 'readonly', (store) => store.get(id)) as Promise<SyncedDocumentRecord | null>
  }

  saveDocument(record: SyncedDocumentRecord): Promise<void> {
    return withStore(DOCUMENTS_STORE, 'readwrite', (store) => store.put(record)).then(() => undefined)
  }

  deleteDocument(id: string): Promise<void> {
    return withStore(DOCUMENTS_STORE, 'readwrite', (store) => store.delete(id)).then(() => undefined)
  }

  listConversations(): Promise<SyncedConversationRecord[]> {
    return withStore(CONVERSATIONS_STORE, 'readonly', (store) => store.getAll()) as Promise<SyncedConversationRecord[]>
  }

  async listConversationsByDocument(documentId: string): Promise<SyncedConversationRecord[]> {
    const conversations = await this.listConversations()
    return conversations.filter((record) => record.payload.documentId === documentId)
  }

  getConversation(id: string): Promise<SyncedConversationRecord | null> {
    return withStore(CONVERSATIONS_STORE, 'readonly', (store) => store.get(id)) as Promise<SyncedConversationRecord | null>
  }

  saveConversation(record: SyncedConversationRecord): Promise<void> {
    return withStore(CONVERSATIONS_STORE, 'readwrite', (store) => store.put(record)).then(() => undefined)
  }

  deleteConversation(id: string): Promise<void> {
    return withStore(CONVERSATIONS_STORE, 'readwrite', (store) => store.delete(id)).then(() => undefined)
  }

  listPendingOps(): Promise<StoragePendingOp[]> {
    return withStore(PENDING_OPS_STORE, 'readonly', (store) => store.getAll()) as Promise<StoragePendingOp[]>
  }

  async listPendingOpsByWorkspace(workspaceId: string): Promise<StoragePendingOp[]> {
    const pending = await this.listPendingOps()
    return pending
      .filter((op) => op.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  async listPendingOpsByEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<StoragePendingOp[]> {
    const pending = await this.listPendingOpsByWorkspace(workspaceId)
    return pending.filter((op) => op.entityType === entityType && op.entityId === entityId)
  }

  savePendingOp(op: StoragePendingOp): Promise<void> {
    return withStore(PENDING_OPS_STORE, 'readwrite', (store) => store.put(op)).then(() => undefined)
  }

  deletePendingOp(opId: string): Promise<void> {
    return withStore(PENDING_OPS_STORE, 'readwrite', (store) => store.delete(opId)).then(() => undefined)
  }

  async deletePendingOpsByEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
    statuses?: StoragePendingOp['status'][],
  ): Promise<void> {
    const pending = await this.listPendingOpsByEntity(workspaceId, entityType, entityId)
    const targets = statuses?.length ? pending.filter((op) => statuses.includes(op.status)) : pending
    await Promise.all(targets.map((op) => this.deletePendingOp(op.opId)))
  }

  getSyncState(workspaceId: string): Promise<SyncStateRecord | null> {
    return withStore(SYNC_STATE_STORE, 'readonly', (store) => store.get(workspaceId)) as Promise<SyncStateRecord | null>
  }

  saveSyncState(state: SyncStateRecord): Promise<void> {
    return withStore(SYNC_STATE_STORE, 'readwrite', (store) => store.put(state)).then(() => undefined)
  }

  getDeviceInfo(deviceId: string): Promise<DeviceInfoRecord | null> {
    return withStore(DEVICE_INFO_STORE, 'readonly', (store) => store.get(deviceId)) as Promise<DeviceInfoRecord | null>
  }

  saveDeviceInfo(record: DeviceInfoRecord): Promise<void> {
    return withStore(DEVICE_INFO_STORE, 'readwrite', (store) => store.put(record)).then(() => undefined)
  }

  listConflicts(): Promise<StorageConflictRecord[]> {
    return withStore(CONFLICTS_STORE, 'readonly', (store) => store.getAll()).then((conflicts) =>
      (conflicts as StorageConflictRecord[]).map(
        (conflict) => normalizeStorageConflictRecord(conflict as never) as StorageConflictRecord,
      ),
    )
  }

  getConflict(conflictId: string): Promise<StorageConflictRecord | null> {
    return withStore(CONFLICTS_STORE, 'readonly', (store) => store.get(conflictId)).then((conflict) =>
      conflict
        ? (normalizeStorageConflictRecord(conflict as never) as StorageConflictRecord)
        : null,
    )
  }

  async listConflictsByWorkspace(workspaceId: string): Promise<StorageConflictRecord[]> {
    const conflicts = await this.listConflicts()
    return conflicts
      .filter((conflict) => conflict.workspaceId === workspaceId)
      .sort((left, right) => right.detectedAt - left.detectedAt)
  }

  async listConflictsByEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<StorageConflictRecord[]> {
    const conflicts = await this.listConflictsByWorkspace(workspaceId)
    return conflicts.filter((conflict) => conflict.entityType === entityType && conflict.entityId === entityId)
  }

  saveConflict(conflict: StorageConflictRecord): Promise<void> {
    return withStore(CONFLICTS_STORE, 'readwrite', (store) => store.put(conflict)).then(() => undefined)
  }

  deleteConflict(conflictId: string): Promise<void> {
    return withStore(CONFLICTS_STORE, 'readwrite', (store) => store.delete(conflictId)).then(() => undefined)
  }

  async deleteConflictsByEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<void> {
    const conflicts = await this.listConflictsByEntity(workspaceId, entityType, entityId)
    await Promise.all(conflicts.map((conflict) => this.deleteConflict(conflict.id)))
  }
}

export const cloudSyncIdb = new CloudSyncIdb()
