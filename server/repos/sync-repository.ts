import type {
  SyncConflictRecord,
  SyncEntityType,
  SyncEnvelope,
  SyncPushConflictResponse,
  SyncWorkspaceSummary,
  WorkspaceRestoreMode,
} from '../../shared/sync-contract.js'

export interface ApplyMutationInput<TPayload> {
  workspaceId: string
  userId: string
  deviceId: string
  entityType: SyncEntityType
  entityId: string
  action: 'upsert' | 'delete'
  baseVersion: number | null
  payload: TPayload | null
  contentHash: string
  clientUpdatedAt: number
}

export interface ApplyMutationResult<TPayload> {
  authoritativeRecord: SyncEnvelope<TPayload>
  cursor: number
}

export interface ResolveConflictInput<TPayload> {
  workspaceId: string
  userId: string
  deviceId: string
  conflictId: string
  resolution: 'use_cloud' | 'save_local_copy' | 'merged_payload'
  mergedPayload?: TPayload
}

export interface ResolveConflictResult<TPayload> {
  resolvedRecord: SyncEnvelope<TPayload>
  extraCreatedRecord?: SyncEnvelope<TPayload>
  cursor: number
}

export interface BootstrapInput<TPayload> {
  userId: string
  deviceId: string
  workspaceName?: string
  targetWorkspaceId?: string
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
}

export interface RestoreInput<TPayload> {
  workspaceId: string
  userId: string
  mode: WorkspaceRestoreMode
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
}

export interface WorkspaceFullResult<TPayload> {
  workspace: SyncWorkspaceSummary
  documents: Array<SyncEnvelope<TPayload>>
  conversations: Array<SyncEnvelope<TPayload>>
  cursor: number
}

export interface SyncRepository<TPayload> {
  initialize(): Promise<void>
  getOrCreateWorkspace(userId: string, workspaceName?: string, targetWorkspaceId?: string): Promise<SyncWorkspaceSummary>
  bootstrap(input: BootstrapInput<TPayload>): Promise<WorkspaceFullResult<TPayload> & { bootstrappedAt: number }>
  applyMutation(input: ApplyMutationInput<TPayload>): Promise<ApplyMutationResult<TPayload>>
  listChanges(
    workspaceId: string,
    afterCursor: number,
    limit: number,
  ): Promise<Array<{ cursor: number; entityType: SyncEntityType; action: 'upsert' | 'delete'; authoritativeRecord: SyncEnvelope<TPayload> }>>
  getWorkspaceFull(workspaceId: string): Promise<WorkspaceFullResult<TPayload> | null>
  restoreWorkspace(input: RestoreInput<TPayload>): Promise<WorkspaceFullResult<TPayload> & { restoredAt: number }>
  createConflict(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
    deviceId: string,
    localRecord: SyncEnvelope<TPayload> | null,
    cloudRecord: SyncEnvelope<TPayload> | null,
    diffHints: SyncPushConflictResponse<TPayload>['diffHints'],
  ): Promise<SyncConflictRecord<TPayload>>
  getConflict(conflictId: string): Promise<SyncConflictRecord<TPayload> | null>
  listConflicts(workspaceId: string): Promise<Array<SyncConflictRecord<TPayload>>>
  resolveConflict(input: ResolveConflictInput<TPayload>): Promise<ResolveConflictResult<TPayload>>
}
