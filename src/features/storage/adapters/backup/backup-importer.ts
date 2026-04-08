import { workspaceStorageService } from '../../services/workspace-storage-service'
import type { ImportReport } from '../../core/sync-types'

export async function importWorkspaceBackup(file: File): Promise<ImportReport> {
  return workspaceStorageService.importBackup(file)
}
