import type { MindMapDocument } from '../../../documents/types'
import {
  documentService as legacyDocumentService,
} from './legacy-document-local-service'
import type { DocumentStorageAdapter } from '../../core/storage-types'

export class IndexedDbDocumentStorageAdapter implements DocumentStorageAdapter {
  async listDocuments(): Promise<MindMapDocument[]> {
    const summaries = await legacyDocumentService.listDocuments()
    const documents = await Promise.all(
      summaries.map((summary) => legacyDocumentService.getDocument(summary.id)),
    )

    return documents.filter((document): document is MindMapDocument => document !== null)
  }

  getDocument(id: string): Promise<MindMapDocument | null> {
    return legacyDocumentService.getDocument(id)
  }

  saveDocument(doc: MindMapDocument): Promise<void> {
    return legacyDocumentService.saveDocument(doc)
  }

  deleteDocument(id: string): Promise<void> {
    return legacyDocumentService.deleteDocument(id)
  }
}

