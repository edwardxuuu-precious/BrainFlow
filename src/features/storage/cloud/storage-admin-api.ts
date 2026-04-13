import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  DatabaseBackupMeta,
  RenameWorkspaceRequest,
  RenameWorkspaceResponse,
  StorageAdminServerStatusResponse,
} from '../../../../shared/storage-admin-contract'
import { dispatchAuthInvalidEvent } from '../../auth/auth-events'

export class StorageAdminApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function parseContentDispositionFileName(value: string | null): string | null {
  if (!value) {
    return null
  }

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i)
  if (quotedMatch?.[1]) {
    return quotedMatch[1]
  }

  const plainMatch = value.match(/filename=([^;]+)/i)
  return plainMatch?.[1]?.trim() ?? null
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T | { message?: string } | null
  if (!response.ok) {
    if (response.status === 401) {
      dispatchAuthInvalidEvent()
    }
    const message =
      typeof payload === 'object' && payload && 'message' in payload && payload.message
        ? String(payload.message)
        : `HTTP ${response.status}`
    throw new StorageAdminApiError(response.status, message)
  }

  return payload as T
}

export class StorageAdminApiClient {
  async getStatus(): Promise<StorageAdminServerStatusResponse> {
    const response = await fetch('/api/storage/status', {
      credentials: 'same-origin',
    })
    return parseJson<StorageAdminServerStatusResponse>(response)
  }

  async createWorkspace(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    const response = await fetch('/api/storage/workspaces', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })
    return parseJson<CreateWorkspaceResponse>(response)
  }

  async renameWorkspace(
    workspaceId: string,
    request: RenameWorkspaceRequest,
  ): Promise<RenameWorkspaceResponse> {
    const response = await fetch(`/api/storage/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })
    return parseJson<RenameWorkspaceResponse>(response)
  }

  async deleteWorkspace(workspaceId: string): Promise<{ deletedWorkspaceId: string }> {
    const response = await fetch(`/api/storage/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    return parseJson<{ deletedWorkspaceId: string }>(response)
  }

  async downloadDatabaseBackup(): Promise<{ blob: Blob; meta: DatabaseBackupMeta }> {
    const response = await fetch('/api/storage/backup/database', {
      method: 'POST',
      credentials: 'same-origin',
    })
    if (!response.ok) {
      await parseJson(response)
    }

    const createdAt = Number(response.headers.get('x-brainflow-backup-created-at') ?? Date.now())
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const fileName =
      parseContentDispositionFileName(response.headers.get('content-disposition')) ??
      `brainflow-${createdAt}.dump`

    return {
      blob: await response.blob(),
      meta: {
        fileName,
        createdAt,
        format: fileName.endsWith('.sql') ? 'plain' : 'custom',
        contentType,
      },
    }
  }
}

export const storageAdminApiClient = new StorageAdminApiClient()
