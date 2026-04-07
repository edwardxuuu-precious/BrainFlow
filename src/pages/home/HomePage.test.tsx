import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { createMindMapDocument } from '../../features/documents/document-factory'
import { HomePage } from './HomePage'

const COPY = {
  create: '\u65b0\u5efa\u8111\u56fe',
  rename: '\u91cd\u547d\u540d',
  renameInput: '\u91cd\u547d\u540d\u8111\u56fe',
  search: '\u641c\u7d22\u6587\u6863',
  noMatch: '\u6ca1\u6709\u5339\u914d\u7684\u6587\u6863',
  board: '\u65b0\u7684\u4e3b\u9898\u677f',
  roadmap: '\u8def\u7ebf\u56fe',
  research: '\u7814\u7a76\u603b\u89c8',
} as const

afterEach(() => {
  vi.restoreAllMocks()
})

function createFakeService(): DocumentService & { documents: MindMapDocument[] } {
  const initial = createMindMapDocument(COPY.roadmap)
  initial.updatedAt = 100

  const research = createMindMapDocument(COPY.research)
  research.updatedAt = 200

  const documents = [research, initial]

  return {
    documents,
    async createDocument(title) {
      const next = createMindMapDocument(title ?? '\u672a\u547d\u540d\u8111\u56fe')
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
      const document = documents.find((entry) => entry.id === id)
      if (!document) {
        return id
      }

      const duplicated = {
        ...structuredClone(document),
        id: `${document.id}-copy`,
        title: `${document.title} \u526f\u672c`,
      }
      documents.unshift(duplicated)
      return duplicated.id
    },
  }
}

describe('HomePage', () => {
  it('renders one stable random quote and moves legacy status info into the footer', async () => {
    const service = createFakeService()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    await screen.findByText('人是欲望的动物，欲望得不到满足便痛苦，得到满足便无聊。')
    expect(screen.queryByText('Document Workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Local First')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+\s+Docs/)).not.toBeInTheDocument()

    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('本地模式')).toBeInTheDocument()
    expect(within(footer).getByText('本地存储')).toBeInTheDocument()
    expect(within(footer).getByText('工作区状态')).toBeInTheDocument()
    expect(within(footer).getByText('自动保存 / 离线优先 / 无云依赖')).toBeInTheDocument()
    expect(within(footer).getByText('IndexedDB / localStorage')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(footer).getByText(`${service.documents.length} 份脑图 · Atelier Slate`)).toBeInTheDocument(),
    )
    expect(screen.getAllByText('本地存储')).toHaveLength(1)
  })

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

    await userEvent.click(await screen.findByRole('button', { name: COPY.create }))

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

    await userEvent.click((await screen.findAllByRole('button', { name: COPY.rename }))[0])
    const input = screen.getByLabelText(COPY.renameInput)
    await userEvent.clear(input)
    await userEvent.type(input, COPY.board)
    fireEvent.blur(input)

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1))
    expect(saveSpy.mock.calls[0]?.[0].title).toBe(COPY.board)
  })

  it('filters documents by local search query', async () => {
    const service = createFakeService()

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    const search = await screen.findByRole('searchbox', { name: COPY.search })
    await userEvent.type(search, '\u7814\u7a76')

    expect(screen.getByText(COPY.research)).toBeInTheDocument()
    expect(screen.queryByText(COPY.roadmap)).not.toBeInTheDocument()
  })

  it('shows the empty-search state when nothing matches', async () => {
    const service = createFakeService()

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    const search = await screen.findByRole('searchbox', { name: COPY.search })
    await userEvent.type(search, '\u4e0d\u5b58\u5728')

    expect(screen.getByText(COPY.noMatch)).toBeInTheDocument()
  })
})
