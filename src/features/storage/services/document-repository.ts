import { createMindMapDocument } from '../../documents/document-factory'
import type { DocumentService, DocumentSummary, MindMapDocument } from '../../documents/types'
import {
  BrowserLocalIndexAdapter,
  summarizeDocument,
} from '../adapters/indexeddb/local-index-adapter'
import {
  documentService as legacyDocumentService,
  normalizeDocument,
} from '../adapters/indexeddb/legacy-document-local-service'
import { cloudSyncOrchestrator } from '../sync/cloud-sync-orchestrator'

function sortSummaries(index: DocumentSummary[]): DocumentSummary[] {
  return [...index].sort((left, right) => right.updatedAt - left.updatedAt)
}

export class DocumentRepository implements DocumentService {
  private readonly localIndexAdapter: BrowserLocalIndexAdapter

  constructor(localIndexAdapter = new BrowserLocalIndexAdapter()) {
    this.localIndexAdapter = localIndexAdapter
  }

  async createDocument(title?: string): Promise<MindMapDocument> {
    const document = createMindMapDocument(title)
    await this.saveDocument(document)
    await this.localIndexAdapter.setRecentDocumentId(document.id)
    return document
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const index = await this.localIndexAdapter.loadDocumentIndex()
    if (index.length > 0) {
      return sortSummaries(index)
    }

    const documents = await this.listAllDocuments()
    return this.localIndexAdapter.rebuildFromDocuments(documents)
  }

  async getDocument(id: string): Promise<MindMapDocument | null> {
    const document = await cloudSyncOrchestrator.getDocument(id)
    if (document) {
      return normalizeDocument(document)
    }

    return legacyDocumentService.getDocument(id)
  }

  async saveDocument(doc: MindMapDocument): Promise<void> {
    const normalized = normalizeDocument(doc)
    await Promise.all([
      cloudSyncOrchestrator.saveDocument(normalized),
      legacyDocumentService.saveDocument(normalized),
    ])
    const index = await this.localIndexAdapter.loadDocumentIndex()
    const summary = summarizeDocument(normalized)
    const nextIndex = [...index.filter((entry) => entry.id !== summary.id), summary]
    await this.localIndexAdapter.saveDocumentIndex(nextIndex)
  }

  async deleteDocument(id: string): Promise<void> {
    await Promise.all([
      cloudSyncOrchestrator.deleteDocument(id),
      legacyDocumentService.deleteDocument(id),
    ])
    const index = await this.localIndexAdapter.loadDocumentIndex()
    const nextIndex = index.filter((entry) => entry.id !== id)
    await this.localIndexAdapter.saveDocumentIndex(nextIndex)

    const recentId = await this.localIndexAdapter.getRecentDocumentId()
    if (recentId === id) {
      await this.localIndexAdapter.setRecentDocumentId(nextIndex[0]?.id ?? null)
    }
  }

  async duplicateDocument(id: string): Promise<string> {
    const original = await this.getDocument(id)
    if (!original) {
      throw new Error('Document not found')
    }

    const duplicated: MindMapDocument = {
      ...structuredClone(original),
      id: createMindMapDocument().id,
      title: `${original.title} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await this.saveDocument(duplicated)
    return duplicated.id
  }

  async listAllDocuments(): Promise<MindMapDocument[]> {
    const [cloudDocuments, legacyIndex] = await Promise.all([
      cloudSyncOrchestrator.listDocuments(),
      legacyDocumentService.listDocuments(),
    ])
    const merged = new Map<string, MindMapDocument>()

    cloudDocuments.forEach((document) => {
      merged.set(document.id, normalizeDocument(document))
    })

    const missingLegacyIds = legacyIndex
      .map((summary) => summary.id)
      .filter((id) => !merged.has(id))

    if (missingLegacyIds.length > 0) {
      const legacyDocuments = await Promise.all(
        missingLegacyIds.map((legacyId) => legacyDocumentService.getDocument(legacyId)),
      )
      legacyDocuments.forEach((document) => {
        if (document) {
          merged.set(document.id, document)
        }
      })
    }

    return [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt)
  }

  getRecentDocumentId(): Promise<string | null> {
    return this.localIndexAdapter.getRecentDocumentId()
  }

  setRecentDocumentId(id: string | null): Promise<void> {
    return this.localIndexAdapter.setRecentDocumentId(id)
  }

  async rebuildLocalIndex(): Promise<DocumentSummary[]> {
    const documents = await this.listAllDocuments()
    const summaries = await this.localIndexAdapter.rebuildFromDocuments(documents)
    const recentId = await this.localIndexAdapter.getRecentDocumentId()
    if (!recentId || summaries.some((summary) => summary.id === recentId)) {
      return summaries
    }

    await this.localIndexAdapter.setRecentDocumentId(summaries[0]?.id ?? null)
    return summaries
  }
}
