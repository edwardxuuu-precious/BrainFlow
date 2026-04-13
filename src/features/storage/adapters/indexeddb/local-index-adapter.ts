import type { DocumentSummary, MindMapDocument } from '../../../documents/types'
import { normalizeDocumentTitle } from '../../../documents/document-title'
import { defaultTheme } from '../../../documents/theme'
import type { LocalIndexAdapter } from '../../core/storage-types'

export const INDEX_KEY = 'brainflow:document-index:v1'
export const RECENT_KEY = 'brainflow:recent-document:v1'

function sortSummaries(index: DocumentSummary[]): DocumentSummary[] {
  return [...index].sort((left, right) => right.updatedAt - left.updatedAt)
}

function toSummary(doc: MindMapDocument): DocumentSummary {
  return {
    id: doc.id,
    title: normalizeDocumentTitle(doc.title),
    updatedAt: doc.updatedAt,
    topicCount: Object.keys(doc.topics).length,
    previewColor: doc.theme.accent,
  }
}

export class BrowserLocalIndexAdapter implements LocalIndexAdapter {
  async loadDocumentIndex(): Promise<DocumentSummary[]> {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) {
      return []
    }

    try {
      const parsed = JSON.parse(raw) as DocumentSummary[]
      return Array.isArray(parsed)
        ? sortSummaries(
            parsed.map((entry) => ({
              ...entry,
              title: normalizeDocumentTitle(entry.title),
              previewColor: defaultTheme.accent,
            })),
          )
        : []
    } catch {
      return []
    }
  }

  async saveDocumentIndex(index: DocumentSummary[]): Promise<void> {
    localStorage.setItem(INDEX_KEY, JSON.stringify(sortSummaries(index)))
  }

  async getRecentDocumentId(): Promise<string | null> {
    return localStorage.getItem(RECENT_KEY)
  }

  async setRecentDocumentId(id: string | null): Promise<void> {
    if (!id) {
      localStorage.removeItem(RECENT_KEY)
      return
    }

    localStorage.setItem(RECENT_KEY, id)
  }

  async rebuildFromDocuments(documents: MindMapDocument[]): Promise<DocumentSummary[]> {
    const summaries = sortSummaries(documents.map(toSummary))
    await this.saveDocumentIndex(summaries)
    return summaries
  }
}

export function summarizeDocument(doc: MindMapDocument): DocumentSummary {
  return toSummary(doc)
}
