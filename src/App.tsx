import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StorageConflictDialog } from './features/storage/ui/StorageConflictDialog'
import {
  workspaceStorageService,
  type WorkspaceStorageStatus,
} from './features/storage/services/workspace-storage-service'
import { useEffect, useMemo, useState } from 'react'

const HomePage = lazy(async () => {
  const module = await import('./pages/home/HomePage')
  return { default: module.HomePage }
})

const MapEditorPage = lazy(async () => {
  const module = await import('./pages/editor/MapEditorPage')
  return { default: module.MapEditorPage }
})

const StorageSettingsPage = lazy(async () => {
  const module = await import('./features/storage/ui/StorageSettingsPage')
  return { default: module.StorageSettingsPage }
})

function createEmptyStatus(): WorkspaceStorageStatus {
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

function App() {
  const [storageStatus, setStorageStatus] = useState<WorkspaceStorageStatus>(() =>
    typeof window === 'undefined' ? createEmptyStatus() : workspaceStorageService.getStatus(),
  )
  const [dismissedConflictIds, setDismissedConflictIds] = useState<string[]>([])

  useEffect(() => {
    void workspaceStorageService.initialize()
    return workspaceStorageService.subscribe(setStorageStatus)
  }, [])

  const activeConflict = useMemo(
    () => storageStatus.conflicts.find((conflict) => !dismissedConflictIds.includes(conflict.id)) ?? null,
    [dismissedConflictIds, storageStatus.conflicts],
  )

  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map/:documentId" element={<MapEditorPage />} />
          <Route path="/settings" element={<StorageSettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <StorageConflictDialog
        conflict={activeConflict}
        onDismiss={() =>
          setDismissedConflictIds((current) =>
            activeConflict ? [...current, activeConflict.id] : current,
          )
        }
        onResolve={async (conflictId, resolution, mergedPayload) => {
          setDismissedConflictIds((current) => current.filter((id) => id !== conflictId))
          const nextStatus = await workspaceStorageService.resolveConflict(
            conflictId,
            resolution,
            mergedPayload,
          )
          setStorageStatus(nextStatus)
        }}
      />
    </BrowserRouter>
  )
}

export default App
