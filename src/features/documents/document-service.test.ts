import { beforeEach, describe, expect, it } from 'vitest'
import {
  documentService,
  getRecentDocumentId,
  setRecentDocumentId,
} from './document-service'

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('brainflow-documents-v1')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
  })
}

describe('documentService', () => {
  beforeEach(async () => {
    await resetDatabase()
    localStorage.clear()
  })

  it('creates documents, persists them, and lists them by latest update', async () => {
    const first = await documentService.createDocument('第一张')
    const second = await documentService.createDocument('第二张')

    const loaded = await documentService.getDocument(second.id)
    const list = await documentService.listDocuments()

    expect(loaded?.title).toBe('第二张')
    expect(list[0].id).toBe(second.id)
    expect(list[1].id).toBe(first.id)
  })

  it('repairs the local index from IndexedDB when localStorage is invalid', async () => {
    const doc = await documentService.createDocument('修复索引')
    localStorage.setItem('brainflow:document-index:v1', 'broken-json')

    const list = await documentService.listDocuments()

    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(doc.id)
  })

  it('deletes documents and updates the recent pointer', async () => {
    const doc = await documentService.createDocument('待删除')
    setRecentDocumentId(doc.id)

    await documentService.deleteDocument(doc.id)

    expect(await documentService.getDocument(doc.id)).toBeNull()
    expect(getRecentDocumentId()).toBeNull()
  })
})
