import { workspaceStorageService } from '../storage/services/workspace-storage-service'

export const documentService = workspaceStorageService.documentRepository

export function getRecentDocumentId(): string | null {
  return localStorage.getItem('brainflow:recent-document:v1')
}

export function setRecentDocumentId(id: string | null): void {
  if (!id) {
    localStorage.removeItem('brainflow:recent-document:v1')
    return
  }

  localStorage.setItem('brainflow:recent-document:v1', id)
}
