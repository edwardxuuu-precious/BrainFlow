import type { AiConversation } from '../../../../shared/ai-contract'
import type { MindMapDocument } from '../../documents/types'

export type SyncTargetKind = 'filesystem' | 'cloud'
export type SyncResourceType = 'document' | 'conversation'
export type SyncResolution = 'keep-local' | 'keep-target' | 'save-as-copy'
export type StorageMode = 'local-only' | 'filesystem-connected' | 'cloud-connected'

export interface SyncTargetConnection {
  id: string
  kind: SyncTargetKind
  label: string
  connectedAt: number
}

export interface SyncResourceDescriptor {
  resourceType: SyncResourceType
  resourceId: string
  documentId: string
  sessionId: string | null
  path: string
  updatedAt: number | null
  hash: string | null
}

export interface SyncTargetSnapshot {
  connection: SyncTargetConnection
  scannedAt: number
  documents: MindMapDocument[]
  conversations: AiConversation[]
  manifestVersion: string
  resources: SyncResourceDescriptor[]
}

export interface SyncConflict {
  id: string
  resourceType: SyncResourceType
  resourceId: string
  documentId: string
  sessionId: string | null
  localUpdatedAt: number | null
  targetUpdatedAt: number | null
  localHash: string | null
  targetHash: string | null
  suggestedWinner: 'local' | 'target'
  detectedAt: number
  localDocument?: MindMapDocument
  targetDocument?: MindMapDocument
  localConversation?: AiConversation
  targetConversation?: AiConversation
}

export interface SyncResourceShadowState {
  resourceType: SyncResourceType
  resourceId: string
  documentId: string
  sessionId: string | null
  lastSyncedHash: string | null
  lastSyncedUpdatedAt: number | null
  lastDirection: 'push' | 'pull' | null
}

export interface SyncTargetAdapter {
  kind: SyncTargetKind
  isSupported(): boolean
  connect(): Promise<SyncTargetConnection>
  disconnect?(connection: SyncTargetConnection): Promise<void>
  scan(connection: SyncTargetConnection): Promise<SyncTargetSnapshot>
  writeDocument(connection: SyncTargetConnection, doc: MindMapDocument): Promise<void>
  writeConversation(connection: SyncTargetConnection, session: AiConversation): Promise<void>
  deleteDocument(connection: SyncTargetConnection, documentId: string): Promise<void>
  deleteConversation(connection: SyncTargetConnection, documentId: string, sessionId: string): Promise<void>
}

export interface StorageStatus {
  mode: StorageMode
  activeConnection: SyncTargetConnection | null
  lastSuccessfulSaveTarget: string | null
  lastSuccessfulSaveAt: number | null
  conflicts: SyncConflict[]
  pendingImportReport: ImportReport | null
}

export interface ImportFailure {
  kind: 'manifest' | 'document' | 'conversation' | 'index'
  path: string
  message: string
}

export interface ImportReport {
  success: boolean
  importedDocuments: number
  importedConversations: number
  duplicatedDocuments: Array<{ oldId: string; newId: string }>
  failures: ImportFailure[]
  warnings: string[]
}

