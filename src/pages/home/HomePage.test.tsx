import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { createMindMapDocument } from '../../features/documents/document-factory'
import { HomePage } from './HomePage'

function createFakeService(): DocumentService & { documents: MindMapDocument[] } {
  const initial = createMindMapDocument('路线图')
  initial.updatedAt = 100

  const documents = [initial]

  return {
    documents,
    async createDocument(title) {
      const next = createMindMapDocument(title ?? '未命名脑图')
      documents.unshift(next)
      return next
    },
    async listDocuments() {
      return documents.map((document) => ({
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
        topicCount: Object.keys(document.topics).length,
        previewColor: document.theme.accent,
      }))
    },
    async getDocument(id) {
      return documents.find((document) => document.id === id) ?? null
    },
    async saveDocument(doc) {
      const index = documents.findIndex((entry) => entry.id === doc.id)
      if (index >= 0) {
        documents[index] = doc
      }
    },
    async deleteDocument(id) {
      const index = documents.findIndex((document) => document.id === id)
      if (index >= 0) {
        documents.splice(index, 1)
      }
    },
    async duplicateDocument(id) {
      return id
    },
  }
}

describe('HomePage', () => {
  it('creates a document and navigates to the editor route', async () => {
    const service = createFakeService()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage service={service} />} />
          <Route path="/map/:documentId" element={<div>editor opened</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: '新建脑图' }))

    expect(await screen.findByText('editor opened')).toBeInTheDocument()
  })

  it('renames a document inline and persists through the service', async () => {
    const service = createFakeService()
    const saveSpy = vi.spyOn(service, 'saveDocument')

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: '重命名' }))
    const input = screen.getByLabelText('重命名脑图')
    await userEvent.clear(input)
    await userEvent.type(input, '新的主题板')
    fireEvent.blur(input)

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    expect(saveSpy.mock.calls[0]?.[0].title).toBe('新的主题板')
  })
})
