import type {
  StorageStatus,
  SyncConflict,
  SyncResourceShadowState,
  SyncTargetConnection,
} from '../../core/sync-types'

const DB_NAME = 'brainflow-sync-meta-v1'
const DB_VERSION = 1
const KV_STORE = 'kv'
const SHADOW_STORE = 'shadow'
const CONFLICT_STORE = 'conflicts'

type KvRecord = {
  key: string
  value: unknown
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(KV_STORE)) {
        database.createObjectStore(KV_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(SHADOW_STORE)) {
        database.createObjectStore(SHADOW_STORE, { keyPath: 'resourceId' })
      }
      if (!database.objectStoreNames.contains(CONFLICT_STORE)) {
        database.createObjectStore(CONFLICT_STORE, { keyPath: 'id' })
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

async function getKv<T>(key: string): Promise<T | null> {
  const result = await withStore<KvRecord | undefined>(KV_STORE, 'readonly', (store) => store.get(key))
  return (result?.value as T | undefined) ?? null
}

async function setKv<T>(key: string, value: T): Promise<void> {
  await withStore(KV_STORE, 'readwrite', (store) => store.put({ key, value }))
}

export class SyncMetadataStore {
  async getConnection(): Promise<SyncTargetConnection | null> {
    return getKv<SyncTargetConnection>('connection')
  }

  async setConnection(connection: SyncTargetConnection | null): Promise<void> {
    if (!connection) {
      await withStore(KV_STORE, 'readwrite', (store) => store.delete('connection'))
      return
    }
    await setKv('connection', connection)
  }

  async getDirectoryHandle<T>(): Promise<T | null> {
    return getKv<T>('directory-handle')
  }

  async setDirectoryHandle<T>(handle: T | null): Promise<void> {
    if (handle === null) {
      await withStore(KV_STORE, 'readwrite', (store) => store.delete('directory-handle'))
      return
    }
    await setKv('directory-handle', handle)
  }

  async getStorageStatus(): Promise<Pick<StorageStatus, 'lastSuccessfulSaveAt' | 'lastSuccessfulSaveTarget'>> {
    return {
      lastSuccessfulSaveAt: await getKv<number>('last-successful-save-at'),
      lastSuccessfulSaveTarget: await getKv<string>('last-successful-save-target'),
    }
  }

  async setLastSuccessfulSave(target: string, timestamp: number): Promise<void> {
    await Promise.all([
      setKv('last-successful-save-target', target),
      setKv('last-successful-save-at', timestamp),
    ])
  }

  async listShadows(): Promise<SyncResourceShadowState[]> {
    const result = await withStore<unknown[]>(
      SHADOW_STORE,
      'readonly',
      (store) => store.getAll(),
    )
    return (result as SyncResourceShadowState[]) ?? []
  }

  async getShadow(resourceId: string): Promise<SyncResourceShadowState | null> {
    return (
      (await withStore<SyncResourceShadowState | undefined>(SHADOW_STORE, 'readonly', (store) =>
        store.get(resourceId),
      )) ?? null
    )
  }

  async saveShadow(state: SyncResourceShadowState): Promise<void> {
    await withStore(SHADOW_STORE, 'readwrite', (store) => store.put(state))
  }

  async deleteShadow(resourceId: string): Promise<void> {
    await withStore(SHADOW_STORE, 'readwrite', (store) => store.delete(resourceId))
  }

  async listConflicts(): Promise<SyncConflict[]> {
    const result = await withStore<unknown[]>(CONFLICT_STORE, 'readonly', (store) => store.getAll())
    return ((result as SyncConflict[]) ?? []).sort((left, right) => right.detectedAt - left.detectedAt)
  }

  async saveConflict(conflict: SyncConflict): Promise<void> {
    await withStore(CONFLICT_STORE, 'readwrite', (store) => store.put(conflict))
  }

  async deleteConflict(conflictId: string): Promise<void> {
    await withStore(CONFLICT_STORE, 'readwrite', (store) => store.delete(conflictId))
  }

  async clearAllConflicts(): Promise<void> {
    await withStore(CONFLICT_STORE, 'readwrite', (store) => store.clear())
  }
}
