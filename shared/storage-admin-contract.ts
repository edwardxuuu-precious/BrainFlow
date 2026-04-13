import type { AuthMode } from './auth-contract.js'

export type DatabaseBackupFormat = 'custom' | 'plain'

export interface DatabaseBackupMeta {
  fileName: string
  createdAt: number
  format: DatabaseBackupFormat
  contentType: string
}

export interface WorkspaceAdminSummary {
  id: string
  userId: string
  name: string
  createdAt: number
  updatedAt: number
  documentCount: number
  conversationCount: number
}

export interface CreateWorkspaceRequest {
  name: string
}

export interface CreateWorkspaceResponse {
  workspace: WorkspaceAdminSummary
}

export interface RenameWorkspaceRequest {
  name: string
}

export interface RenameWorkspaceResponse {
  workspace: WorkspaceAdminSummary
}

export interface StorageAdminServerStatusResponse {
  mode: 'local_postgres'
  checkedAt: number
  api: {
    reachable: boolean
    checkedAt: number
  }
  database: {
    driver: 'postgres'
    configured: boolean
    reachable: boolean
    label: string | null
    lastError: string | null
    backupFormat: DatabaseBackupFormat
    lastBackupAt: number | null
  }
  backup: {
    available: boolean
    directory: string | null
    lastError: string | null
  }
  auth: {
    mode: AuthMode
    authenticated: boolean
    username: string | null
  }
  workspace: {
    id: string | null
    name: string | null
  }
  workspaces: WorkspaceAdminSummary[]
  runtime: {
    canonicalOrigin: string | null
  }
}

export interface BrowserCacheSummary {
  indexedDbAvailable: boolean
  deviceId: string | null
  workspaceId: string | null
  pendingOpCount: number
  lastLocalWriteAt: number | null
  lastCloudSyncAt: number | null
  isOnline: boolean
  isSyncing: boolean
  lastSyncError: string | null
  conflictCount: number
  legacyMigrationCompleted: boolean
}

export interface LocalStorageAdminStatus extends StorageAdminServerStatusResponse {
  browserCacheSummary: BrowserCacheSummary
  diagnostics: {
    currentOrigin: string | null
    canonicalOrigin: string | null
    legacyMigrationAvailable: boolean
    legacyDocumentCount: number
    legacyConversationCount: number
  }
}
