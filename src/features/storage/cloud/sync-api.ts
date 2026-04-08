import type {
  SyncAnalyzeConflictRequest,
  SyncAnalyzeConflictResponse,
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
} from '../../../../shared/sync-contract'

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { message?: string }
  if (!response.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'message' in payload && payload.message
        ? String(payload.message)
        : `HTTP ${response.status}`,
    )
  }
  return payload as T
}

export class CloudSyncConflictError<TPayload> extends Error {
  readonly payload: SyncPushConflictResponse<TPayload>

  constructor(payload: SyncPushConflictResponse<TPayload>) {
    super('Cloud sync conflict')
    this.payload = payload
  }
}

export class SyncApiClient<TPayload> {
  private readonly baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  async bootstrap(request: SyncBootstrapRequest<TPayload>): Promise<SyncBootstrapResponse<TPayload>> {
    const response = await fetch(`${this.baseUrl}/api/sync/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return parseJson<SyncBootstrapResponse<TPayload>>(response)
  }

  async push(request: SyncPushRequest<TPayload>): Promise<SyncPushResponse<TPayload>> {
    const response = await fetch(`${this.baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (response.status === 409) {
      throw new CloudSyncConflictError<TPayload>(
        await response.json() as SyncPushConflictResponse<TPayload>,
      )
    }
    return parseJson<SyncPushResponse<TPayload>>(response)
  }

  async pull(workspaceId: string, afterCursor: number, limit?: number): Promise<SyncPullResponse<TPayload>> {
    const params = new URLSearchParams({
      workspaceId,
      afterCursor: String(afterCursor),
    })
    if (typeof limit === 'number') {
      params.set('limit', String(limit))
    }
    const response = await fetch(`${this.baseUrl}/api/sync/pull?${params.toString()}`)
    return parseJson<SyncPullResponse<TPayload>>(response)
  }

  async resolveConflict(
    request: SyncResolveConflictRequest<TPayload>,
  ): Promise<SyncResolveConflictResponse<TPayload>> {
    const response = await fetch(`${this.baseUrl}/api/sync/resolve-conflict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return parseJson<SyncResolveConflictResponse<TPayload>>(response)
  }

  async analyzeConflict(
    request: SyncAnalyzeConflictRequest<TPayload>,
  ): Promise<SyncAnalyzeConflictResponse<TPayload>> {
    const response = await fetch(`${this.baseUrl}/api/sync/analyze-conflict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return parseJson<SyncAnalyzeConflictResponse<TPayload>>(response)
  }

  async getWorkspaceFull(workspaceId: string): Promise<WorkspaceFullResponse<TPayload>> {
    const response = await fetch(
      `${this.baseUrl}/api/workspace/full?${new URLSearchParams({ workspaceId }).toString()}`,
    )
    return parseJson<WorkspaceFullResponse<TPayload>>(response)
  }

  async restoreWorkspace(
    request: WorkspaceRestoreRequest<TPayload>,
  ): Promise<WorkspaceRestoreResponse<TPayload>> {
    const response = await fetch(`${this.baseUrl}/api/workspace/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return parseJson<WorkspaceRestoreResponse<TPayload>>(response)
  }
}
