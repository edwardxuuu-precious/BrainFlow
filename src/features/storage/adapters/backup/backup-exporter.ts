import { workspaceStorageService } from '../../services/workspace-storage-service'

export async function exportWorkspaceBackup(): Promise<Blob> {
  return workspaceStorageService.exportBackup()
}

