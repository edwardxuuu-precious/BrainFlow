import type { SyncTargetConnection } from '../../core/sync-types'
import { SyncMetadataStore } from '../indexeddb/sync-metadata-idb'

export class FilesystemHandleStore {
  private readonly metadataStore: SyncMetadataStore

  constructor(metadataStore: SyncMetadataStore) {
    this.metadataStore = metadataStore
  }

  getConnection(): Promise<SyncTargetConnection | null> {
    return this.metadataStore.getConnection()
  }

  setConnection(connection: SyncTargetConnection | null): Promise<void> {
    return this.metadataStore.setConnection(connection)
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    return this.metadataStore.getDirectoryHandle<FileSystemDirectoryHandle>()
  }

  setDirectoryHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
    return this.metadataStore.setDirectoryHandle(handle)
  }
}
