export const BACKUP_SCHEMA_VERSION = 'brainflow-backup-v1'

export interface BackupManifestEntry {
  kind: 'document' | 'conversation' | 'index'
  path: string
  id: string
  hash: string
}

export interface BackupManifest {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  createdAt: number
  exportedAt: number
  appVersion: string
  documentCount: number
  conversationCount: number
  entries: BackupManifestEntry[]
}

export interface SyncFolderManifestEntry {
  kind: 'document' | 'conversation'
  path: string
  id: string
  documentId: string
  sessionId: string | null
  updatedAt: number | null
  hash: string | null
}

export interface SyncFolderManifest {
  schemaVersion: 'brainflow-folder-sync-v1'
  createdAt: number
  updatedAt: number
  entries: SyncFolderManifestEntry[]
}

export interface SyncFolderState {
  schemaVersion: 'brainflow-folder-sync-state-v1'
  updatedAt: number
  lastSuccessfulWriteAt: number | null
}
