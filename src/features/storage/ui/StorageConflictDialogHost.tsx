import { useEffect, useMemo, useState } from 'react'
import {
  workspaceStorageService,
  type WorkspaceStorageStatus,
} from '../services/workspace-storage-service'
import { StorageConflictDialog } from './StorageConflictDialog'

function createInitialConflicts(): WorkspaceStorageStatus['conflicts'] {
  if (typeof window === 'undefined') {
    return []
  }

  return workspaceStorageService.getStatus().conflicts
}

export function StorageConflictDialogHost() {
  const [conflicts, setConflicts] = useState<WorkspaceStorageStatus['conflicts']>(
    createInitialConflicts,
  )
  const [dismissedConflictIds, setDismissedConflictIds] = useState<string[]>([])

  useEffect(() => {
    void workspaceStorageService.initialize()
    return workspaceStorageService.subscribe((nextStatus) => {
      setConflicts(nextStatus.conflicts)
    })
  }, [])

  const activeConflict = useMemo(
    () => conflicts.find((conflict) => !dismissedConflictIds.includes(conflict.id)) ?? null,
    [conflicts, dismissedConflictIds],
  )

  return (
    <StorageConflictDialog
      conflict={activeConflict}
      onDismiss={() =>
        setDismissedConflictIds((current) =>
          activeConflict ? [...current, activeConflict.id] : current,
        )
      }
      onDiscardLocalConflict={async (conflictId) => {
        setDismissedConflictIds((current) => current.filter((id) => id !== conflictId))
        const nextStatus = await workspaceStorageService.discardLocalConflicts([conflictId])
        setConflicts(nextStatus.conflicts)
      }}
      onResolve={async (conflictId, resolution, mergedPayload) => {
        setDismissedConflictIds((current) => current.filter((id) => id !== conflictId))
        const nextStatus = await workspaceStorageService.resolveConflict(
          conflictId,
          resolution,
          mergedPayload,
        )
        setConflicts(nextStatus.conflicts)
      }}
    />
  )
}
