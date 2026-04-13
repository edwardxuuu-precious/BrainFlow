import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalStorageAdminStatus } from '../../../shared/storage-admin-contract'
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { createMindMapDocument } from '../../features/documents/document-factory'

const { workspaceStorageServiceMock } = vi.hoisted(() => ({
  workspaceStorageServiceMock: {
    getStatus: vi.fn(),
    refreshAdminStatus: vi.fn(),
    getAdminStatus: vi.fn(),
    subscribe: vi.fn(),
    renameWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
  },
}))

vi.mock('../../features/storage/services/workspace-storage-service', () => ({
  workspaceStorageService: workspaceStorageServiceMock,
}))

import { HomePage } from './HomePage'

const COPY = {
  create: '新建脑图',
  rename: '重命名',
  renameInput: '重命名脑图',
  search: '搜索文档',
  noMatch: '没有匹配的文档',
  board: '新的主题板',
  roadmap: '路线图',
  research: '研究总览',
} as const

function createStorageStatus(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'local-only',
    workspaceName: 'Default Workspace',
    localSavedAt: null,
    cloudSyncedAt: null,
    isOnline: true,
    isSyncing: false,
    conflicts: [],
    pendingImportReport: null,
    migrationAvailable: true,
    lastSyncError: null,
    ...overrides,
  }
}

function createAdminStatus(name = 'Default Workspace'): LocalStorageAdminStatus {
  return {
    mode: 'local_postgres',
    checkedAt: 1_710_000_000_000,
    api: { reachable: true, checkedAt: 1_710_000_000_000 },
    database: {
      driver: 'postgres',
      configured: true,
      reachable: true,
      label: 'Local Postgres / brainflow',
      lastError: null,
      backupFormat: 'custom',
      lastBackupAt: null,
    },
    backup: { available: true, directory: 'backups/postgres', lastError: null },
    auth: { mode: 'stub', authenticated: true, username: 'admin' },
    workspace: { id: 'workspace_local', name },
    workspaces: [
      {
        id: 'workspace_local',
        userId: 'user_stub_default',
        name,
        createdAt: 1_709_999_000_000,
        updatedAt: 1_710_000_000_000,
        documentCount: 2,
        conversationCount: 0,
      },
    ],
    runtime: { canonicalOrigin: 'http://127.0.0.1:4173' },
    browserCacheSummary: {
      indexedDbAvailable: true,
      deviceId: 'device_local',
      workspaceId: 'workspace_local',
      pendingOpCount: 0,
      lastLocalWriteAt: null,
      lastCloudSyncAt: null,
      isOnline: true,
      isSyncing: false,
      lastSyncError: null,
      conflictCount: 0,
      legacyMigrationCompleted: true,
    },
    diagnostics: {
      currentOrigin: 'http://127.0.0.1:4173',
      canonicalOrigin: 'http://127.0.0.1:4173',
      legacyMigrationAvailable: false,
      legacyDocumentCount: 0,
      legacyConversationCount: 0,
    },
  }
}

function createFakeService(): DocumentService & { documents: MindMapDocument[] } {
  const initial = createMindMapDocument(COPY.roadmap)
  initial.updatedAt = 100
  const research = createMindMapDocument(COPY.research)
  research.updatedAt = 200
  const documents = [research, initial]

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
      const document = documents.find((entry) => entry.id === id)
      if (!document) return id
      const duplicated = {
        ...structuredClone(document),
        id: `${document.id}-copy`,
        title: `${document.title} 副本`,
      }
      documents.unshift(duplicated)
      return duplicated.id
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HomePage', () => {
  it('renders footer info and header workspace selector', async () => {
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus('Atelier Slate'))
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus('Atelier Slate'))
    workspaceStorageServiceMock.subscribe.mockImplementation(() => () => undefined)
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus('Atelier Slate'))
    const service = createFakeService()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    // Footer 显示基本信息
    const footer = await screen.findByRole('contentinfo')
    expect(within(footer).getByText('本地模式')).toBeInTheDocument()
    expect(within(footer).getByText('本地存储')).toBeInTheDocument()
    expect(within(footer).getByText('当前工作区')).toBeInTheDocument()
    // 等待文档加载完成
    await waitFor(() => {
      expect(within(footer).getByText(`${service.documents.length} 份脑图`, { exact: false })).toBeInTheDocument()
    })

    // Header 显示工作区选择器和设置按钮
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('button', { name: /数据存储与同步/i })).toBeInTheDocument()
    expect(within(header).getByText('Atelier Slate')).toBeInTheDocument()
  })

  it('creates a document and navigates to the editor route', async () => {
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.subscribe.mockImplementation(() => () => undefined)
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus())
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
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.subscribe.mockImplementation(() => () => undefined)
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus())
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
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.subscribe.mockImplementation(() => () => undefined)
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus())
    const service = createFakeService()

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    const search = await screen.findByRole('searchbox', { name: COPY.search })
    await userEvent.type(search, '研究')
    expect(screen.getByText(COPY.research)).toBeInTheDocument()
    expect(screen.queryByText(COPY.roadmap)).not.toBeInTheDocument()
  })

  it('refreshes the document list when workspace storage emits an update', async () => {
    let storageListener: ((status: ReturnType<typeof createStorageStatus>) => void) | null = null
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.subscribe.mockImplementation(
      (listener: (status: ReturnType<typeof createStorageStatus>) => void) => {
        storageListener = listener
        return () => undefined
      },
    )
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus())
    const service = createFakeService()

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    await screen.findByText(COPY.research)

    const switchedDocument = createMindMapDocument('Edward Workspace Board')
    switchedDocument.updatedAt = 300
    service.documents.splice(0, service.documents.length, switchedDocument)

    expect(storageListener).toBeTypeOf('function')
    if (!storageListener) {
      throw new Error('Expected workspace storage listener to be registered.')
    }
    const emitStorageUpdate = storageListener as (status: ReturnType<typeof createStorageStatus>) => void
    emitStorageUpdate(createStorageStatus({ cloudSyncedAt: 300 }))

    await screen.findByText('Edward Workspace Board')
    expect(screen.queryByText(COPY.research)).not.toBeInTheDocument()
  })

  it('ignores sync-only heartbeat updates from workspace storage', async () => {
    let storageListener: ((status: ReturnType<typeof createStorageStatus>) => void) | null = null
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus())
    workspaceStorageServiceMock.subscribe.mockImplementation(
      (listener: (status: ReturnType<typeof createStorageStatus>) => void) => {
        storageListener = listener
        return () => undefined
      },
    )
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus())
    const service = createFakeService()
    const listSpy = vi.spyOn(service, 'listDocuments')

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    await screen.findByText(COPY.research)
    listSpy.mockClear()

    expect(storageListener).toBeTypeOf('function')
    if (!storageListener) {
      throw new Error('Expected workspace storage listener to be registered.')
    }

    const emitStorageHeartbeat = storageListener as (status: ReturnType<typeof createStorageStatus>) => void
    emitStorageHeartbeat(createStorageStatus({ isSyncing: true }))
    emitStorageHeartbeat(createStorageStatus({ isSyncing: false }))

    expect(listSpy).not.toHaveBeenCalled()
  })

  it('renames the current workspace from the header dropdown', async () => {
    workspaceStorageServiceMock.getStatus.mockReturnValue(createStorageStatus())
    workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(createAdminStatus('Workspace Alpha'))
    workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(createAdminStatus('Workspace Alpha'))
    workspaceStorageServiceMock.subscribe.mockImplementation(() => () => undefined)
    workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(createAdminStatus('Workspace Beta'))
    const service = createFakeService()

    render(
      <MemoryRouter>
        <HomePage service={service} />
      </MemoryRouter>,
    )

    // 点击工作区选择器打开下拉菜单
    await userEvent.click(await screen.findByRole('button', { name: /Workspace Alpha/i }))
    
    // 点击重命名选项
    await userEvent.click(screen.getByText('重命名当前工作区'))
    
    const input = screen.getByPlaceholderText('输入新的工作区名称')
    await userEvent.clear(input)
    await userEvent.type(input, 'Workspace Beta')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(workspaceStorageServiceMock.renameWorkspace).toHaveBeenCalledWith(
        'workspace_local',
        'Workspace Beta',
      )
    })
  })
})
