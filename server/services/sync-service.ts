import type {
  SyncBootstrapRequest,
  SyncBootstrapResponse,
  SyncPullResponse,
  SyncPushConflictResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncResolveConflictRequest,
  SyncResolveConflictResponse,
  WorkspaceFullResponse,
  WorkspaceRestoreRequest,
  WorkspaceRestoreResponse,
} from '../../shared/sync-contract.js'
import type { SyncRepository } from '../repos/sync-repository.js'

export class SyncConflictError<TPayload> extends Error {
  readonly status = 409
  readonly payload: SyncPushConflictResponse<TPayload>

  constructor(payload: SyncPushConflictResponse<TPayload>) {
    super('Version conflict')
    this.payload = payload
  }
}

export class SyncApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class SyncService<TPayload> {
  private readonly repository: SyncRepository<TPayload>
  private readonly pullLimit: number

  constructor(repository: SyncRepository<TPayload>, pullLimit: number) {
    this.repository = repository
    this.pullLimit = pullLimit
  }

  initialize(): Promise<void> {
    return this.repository.initialize()
  }

  async bootstrap(
    userId: string,
    request: SyncBootstrapRequest<TPayload>,
  ): Promise<SyncBootstrapResponse<TPayload>> {
    const result = await this.repository.bootstrap({
      userId,
      deviceId: request.deviceId,
      workspaceName: request.workspaceName,
      targetWorkspaceId: request.targetWorkspaceId,
      documents: request.documents,
      conversations: request.conversations,
    })
    return result
  }

  async push(
    userId: string,
    request: SyncPushRequest<TPayload>,
  ): Promise<SyncPushResponse<TPayload>> {
    const applied: SyncPushResponse<TPayload>['applied'] = []
    let cursor = 0

    for (const op of request.ops) {
      try {
        const result = await this.repository.applyMutation({
          workspaceId: request.workspaceId,
          userId,
          deviceId: request.deviceId,
          entityType: op.entityType,
          entityId: op.entityId,
          action: op.action,
          baseVersion: op.baseVersion,
          payload: op.payload,
          contentHash: op.contentHash,
          clientUpdatedAt: op.clientUpdatedAt,
        })
        applied.push({
          opId: op.opId,
          authoritativeRecord: result.authoritativeRecord,
        })
        cursor = result.cursor
      } catch (error) {
        if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
          const full = await this.repository.getWorkspaceFull(request.workspaceId)
          const cloudRecord =
            [...(full?.documents ?? []), ...(full?.conversations ?? [])].find((record) => record.id === op.entityId) ?? null
          const localEcho = op.payload
            ? {
                id: op.entityId,
                userId,
                workspaceId: request.workspaceId,
                deviceId: request.deviceId,
                version: op.baseVersion ?? 0,
                baseVersion: op.baseVersion,
                contentHash: op.contentHash,
                updatedAt: op.clientUpdatedAt,
                deletedAt: op.action === 'delete' ? op.clientUpdatedAt : null,
                syncStatus: 'conflict' as const,
                payload: op.payload,
              }
            : null
          const diffHints = {
            updatedAtDeltaMs:
              cloudRecord && localEcho ? cloudRecord.updatedAt - localEcho.updatedAt : null,
            sameContentHash: !!cloudRecord && !!localEcho && cloudRecord.contentHash === localEcho.contentHash,
          }
          const conflict = await this.repository.createConflict(
            request.workspaceId,
            op.entityType,
            op.entityId,
            request.deviceId,
            localEcho,
            cloudRecord,
            diffHints,
          )
          throw new SyncConflictError<TPayload>({
            conflictId: conflict.id,
            cloudRecord,
            localEcho,
            diffHints,
          })
        }
        if (error instanceof Error && error.message === 'Workspace not found.') {
          return {
            applied,
            cursor,
            serverTime: Date.now(),
            requiresBootstrap: true,
          }
        }
        throw error
      }
    }

    return {
      applied,
      cursor,
      serverTime: Date.now(),
    }
  }

  async pull(workspaceId: string, afterCursor: number, limit?: number): Promise<SyncPullResponse<TPayload>> {
    const changes = await this.repository.listChanges(
      workspaceId,
      afterCursor,
      Math.max(1, Math.min(limit ?? this.pullLimit, this.pullLimit)),
    )
    const nextCursor = changes.at(-1)?.cursor ?? afterCursor
    return {
      changes,
      nextCursor,
      hasMore: changes.length === (limit ?? this.pullLimit),
    }
  }

  async resolveConflict(
    userId: string,
    request: SyncResolveConflictRequest<TPayload>,
  ): Promise<SyncResolveConflictResponse<TPayload>> {
    try {
      return await this.repository.resolveConflict({
        workspaceId: request.workspaceId,
        userId,
        deviceId: request.deviceId,
        conflictId: request.conflictId,
        resolution: request.resolution,
        mergedPayload: request.mergedPayload,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Conflict not found.') {
        throw new SyncApiError('Conflict not found.', 404)
      }
      throw error
    }
  }

  async getWorkspaceFull(workspaceId: string): Promise<WorkspaceFullResponse<TPayload>> {
    const result = await this.repository.getWorkspaceFull(workspaceId)
    if (!result) {
      throw new Error('Workspace not found.')
    }
    return {
      ...result,
      exportedAt: Date.now(),
    }
  }

  restoreWorkspace(
    userId: string,
    request: WorkspaceRestoreRequest<TPayload>,
  ): Promise<WorkspaceRestoreResponse<TPayload>> {
    return this.repository.restoreWorkspace({
      workspaceId: request.workspaceId,
      userId,
      mode: request.mode,
      documents: request.documents,
      conversations: request.conversations,
    })
  }
}
