import { createMindMapDocument } from '../../documents/document-factory'
import {
  buildDerivedDocumentTitle,
  generateUniqueTitle,
  normalizeDocumentTitle,
} from '../../documents/document-title'
import type { DocumentService, DocumentSummary, MindMapDocument } from '../../documents/types'
import {
  BrowserLocalIndexAdapter,
  summarizeDocument,
} from '../adapters/indexeddb/local-index-adapter'
import { normalizeDocument } from '../adapters/indexeddb/legacy-document-local-service'
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
    const allDocuments = await this.listAllDocuments()
    const existingTitles = allDocuments.map((doc) => doc.title)
    const uniqueTitle = generateUniqueTitle(title, existingTitles)

    const document = createMindMapDocument(uniqueTitle)
    await this.saveDocument(document)
    await this.localIndexAdapter.setRecentDocumentId(document.id)
    return document
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const documents = await this.listAllDocuments()
    return this.localIndexAdapter.rebuildFromDocuments(documents)
  }

  async getDocument(id: string): Promise<MindMapDocument | null> {
    const document = await cloudSyncOrchestrator.getDocument(id)
    return document ? normalizeDocument(document) : null
  }

  async saveDocument(doc: MindMapDocument): Promise<void> {
    const normalized = normalizeDocument(doc)
    await cloudSyncOrchestrator.saveDocument(normalized)
    const index = await this.localIndexAdapter.loadDocumentIndex()
    const summary = summarizeDocument(normalized)
    const nextIndex = [...index.filter((entry) => entry.id !== summary.id), summary]
    await this.localIndexAdapter.saveDocumentIndex(nextIndex)
  }

  async deleteDocument(id: string): Promise<void> {
    await cloudSyncOrchestrator.deleteDocument(id)
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

    const allDocuments = await this.listAllDocuments()
    const existingTitles = allDocuments.map((doc) => doc.title)
    const duplicateBaseTitle = buildDerivedDocumentTitle(original.title, ' 副本')
    const uniqueTitle = generateUniqueTitle(duplicateBaseTitle, existingTitles)

    const duplicated: MindMapDocument = {
      ...structuredClone(original),
      id: createMindMapDocument().id,
      title: uniqueTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await this.saveDocument(duplicated)
    return duplicated.id
  }

  async listAllDocuments(): Promise<MindMapDocument[]> {
    const cloudDocuments = await cloudSyncOrchestrator.listDocuments()
    return cloudDocuments
      .map((document) => normalizeDocument(document))
      .sort((left, right) => right.updatedAt - left.updatedAt)
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

  async repairDuplicateTitles(): Promise<number> {
    const documents = await this.listAllDocuments()
    const sortedDocuments = [...documents].sort((a, b) => a.updatedAt - b.updatedAt)
    const usedTitles: string[] = []
    let repairedCount = 0

    for (const doc of sortedDocuments) {
      const normalizedTitle = normalizeDocumentTitle(doc.title)
      const newTitle = usedTitles.includes(normalizedTitle)
        ? generateUniqueTitle(doc.title, usedTitles)
        : normalizedTitle

      usedTitles.push(newTitle)

      if (newTitle !== doc.title) {
        const repairedDoc: MindMapDocument = {
          ...doc,
          title: newTitle,
          updatedAt: Date.now(),
        }
        await this.saveDocument(repairedDoc)
        repairedCount += 1
      }
    }

    return repairedCount
  }
}
