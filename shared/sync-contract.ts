export type SyncEntityType = 'document' | 'conversation'
export type SyncAction = 'upsert' | 'delete'
export type SyncStatus =
  | 'synced'
  | 'local_saved_pending_sync'
  | 'syncing_push'
  | 'syncing_pull'
  | 'conflict'
  | 'sync_error'

export type SyncConflictResolution = 'use_cloud' | 'save_local_copy' | 'merged_payload'
export type SyncConflictAnalysisStatus = 'pending' | 'ready'
export type SyncConflictAnalysisSource = 'heuristic' | 'ai' | 'heuristic_fallback'
export type SyncConflictAnalysisConfidence = 'high' | 'medium' | 'low'
export type WorkspaceRestoreMode = 'replace' | 'restore_as_copy'

export interface SyncEnvelope<TPayload> {
  id: string
  userId: string
  workspaceId: string
  deviceId: string
  version: number
  baseVersion: number | null
  contentHash: string
  updatedAt: number
  deletedAt: number | null
  syncStatus: SyncStatus
  payload: TPayload
}

export interface SyncWorkspaceSummary {
  id: string
  userId: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface SyncDiffHints {
  updatedAtDeltaMs: number | null
  sameContentHash: boolean
}

export interface SyncConflictRecord<TPayload> {
  id: string
  workspaceId: string
  entityType: SyncEntityType
  entityId: string
  deviceId: string
  localRecord: SyncEnvelope<TPayload> | null
  cloudRecord: SyncEnvelope<TPayload> | null
  localPayload: TPayload | null
  cloudPayload: TPayload | null
  diffHints: SyncDiffHints
  analysisStatus: SyncConflictAnalysisStatus
  analysisSource: SyncConflictAnalysisSource | null
  recommendedResolution: SyncConflictResolution | null
  confidence: SyncConflictAnalysisConfidence | null
  summary: string | null
  reasons: string[]
  actionableResolutions: SyncConflictResolution[]
  mergedPayload?: TPayload | null
  analyzedAt: number | null
  analysisNote?: string | null
  detectedAt: number
  resolvedAt: number | null
}

export interface PendingSyncOp<TPayload> {
  opId: string
  workspaceId: string
  deviceId: string
  entityType: SyncEntityType
  entityId: string
  action: SyncAction
  baseVersion: number | null
  payload: TPayload | null
  contentHash: string
  clientUpdatedAt: number
  status: 'pending' | 'syncing' | 'conflict' | 'failed'
  attemptCount: number
  lastError: string | null
  createdAt: number
}

export interface SyncChange<TPayload> {
  cursor: number
  entityType: SyncEntityType
  action: SyncAction
  authoritativeRecord: SyncEnvelope<TPayload>
}

export interface SyncBootstrapRequest<TPayload> {
  workspaceName?: string
  targetWorkspaceId?: string
  deviceId: string
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
  sourceOrigin: string
  sourceSchemaVersion: string
}

export interface SyncBootstrapResponse<TPayload> {
  workspace: SyncWorkspaceSummary
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
  cursor: number
  bootstrappedAt: number
}

export interface SyncPushRequest<TPayload> {
  workspaceId: string
  deviceId: string
  ops: Array<{
    opId: string
    entityType: SyncEntityType
    entityId: string
    action: SyncAction
    baseVersion: number | null
    payload: TPayload | null
    contentHash: string
    clientUpdatedAt: number
  }>
}

export interface SyncPushResponse<TPayload> {
  applied: Array<{
    opId: string
    authoritativeRecord: SyncEnvelope<TPayload>
  }>
  cursor: number
  serverTime: number
}

export interface SyncPushConflictResponse<TPayload> {
  conflictId: string
  cloudRecord: SyncEnvelope<TPayload> | null
  localEcho: SyncEnvelope<TPayload> | null
  diffHints: SyncDiffHints
}

export interface SyncPullResponse<TPayload> {
  changes: Array<SyncChange<TPayload>>
  nextCursor: number
  hasMore: boolean
}

export interface SyncResolveConflictRequest<TPayload> {
  conflictId: string
  workspaceId: string
  deviceId: string
  resolution: SyncConflictResolution
  mergedPayload?: TPayload
}

export interface SyncResolveConflictResponse<TPayload> {
  resolvedRecord: SyncEnvelope<TPayload>
  extraCreatedRecord?: SyncEnvelope<TPayload>
  cursor: number
}

export interface SyncAnalyzeConflictRequest<TPayload> {
  conflict: SyncConflictRecord<TPayload>
}

export interface SyncAnalyzeConflictResponse<TPayload> {
  analysisSource: Extract<SyncConflictAnalysisSource, 'ai'>
  recommendedResolution: SyncConflictResolution | null
  confidence: SyncConflictAnalysisConfidence | null
  summary: string | null
  reasons: string[]
  actionableResolutions: SyncConflictResolution[]
  mergedPayload?: TPayload | null
  analyzedAt: number
  analysisNote?: string | null
}

export interface WorkspaceFullResponse<TPayload> {
  workspace: SyncWorkspaceSummary
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
  cursor: number
  exportedAt: number
}

export interface WorkspaceRestoreRequest<TPayload> {
  workspaceId: string
  mode: WorkspaceRestoreMode
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
  source: string
}

export interface WorkspaceRestoreResponse<TPayload> {
  workspace: SyncWorkspaceSummary
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
  cursor: number
  restoredAt: number
}
