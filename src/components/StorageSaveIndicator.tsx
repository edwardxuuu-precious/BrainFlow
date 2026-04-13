import { useEffect, useState } from 'react'
import { SaveIndicator } from './SaveIndicator'
import {
  workspaceStorageService,
  type WorkspaceStorageStatus,
} from '../features/storage/services/workspace-storage-service'

interface StorageSaveIndicatorProps {
  isDirty: boolean
}

function createEmptyStorageStatus(): WorkspaceStorageStatus {
  return {
    mode: 'local-only',
    workspaceName: null,
    localSavedAt: null,
    cloudSyncedAt: null,
    isOnline: true,
    isSyncing: false,
    conflicts: [],
    pendingImportReport: null,
    migrationAvailable: true,
    lastSyncError: null,
  }
}

function createInitialStorageStatus(): WorkspaceStorageStatus {
  if (typeof window === 'undefined') {
    return createEmptyStorageStatus()
  }

  return workspaceStorageService.getStatus()
}

export function StorageSaveIndicator({ isDirty }: StorageSaveIndicatorProps) {
  const [storageStatus, setStorageStatus] = useState<WorkspaceStorageStatus>(
    createInitialStorageStatus,
  )

  useEffect(() => {
    return workspaceStorageService.subscribe(setStorageStatus)
  }, [])

  return (
    <SaveIndicator
      localSavedAt={storageStatus.localSavedAt}
      cloudSyncedAt={storageStatus.cloudSyncedAt}
      isDirty={isDirty}
      isSyncing={storageStatus.isSyncing}
      hasConflict={storageStatus.conflicts.length > 0}
    />
  )
}
