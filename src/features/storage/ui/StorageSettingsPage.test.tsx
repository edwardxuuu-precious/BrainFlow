import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalStorageAdminStatus } from '../../../../shared/storage-admin-contract'
import type { ImportReport, WorkspaceStorageStatus } from '../services/workspace-storage-service'

const { workspaceStorageServiceMock, authSessionServiceMock } = vi.hoisted(() => ({
  workspaceStorageServiceMock: {
    getStatus: vi.fn(),
    refreshAdminStatus: vi.fn(),
    getAdminStatus: vi.fn(),
    subscribe: vi.fn(),
    discardLocalConflicts: vi.fn(),
    exportBackupToDownload: vi.fn(),
    importBackup: vi.fn(),
    downloadDatabaseBackup: vi.fn(),
    migrateLegacyDataToPrimaryStorage: vi.fn(),
    switchWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
  },
  authSessionServiceMock: {
    logout: vi.fn(),
  },
}))

vi.mock('../services/workspace-storage-service', () => ({
  workspaceStorageService: workspaceStorageServiceMock,
}))

vi.mock('../../auth/auth-session-service', () => ({
  authSessionService: authSessionServiceMock,
}))

import { StorageSettingsPage } from './StorageSettingsPage'

function createSyncStatus(): WorkspaceStorageStatus {
  return {
    mode: 'cloud-connected',
    workspaceName: 'Default Workspace',
    localSavedAt: 1_710_000_000_000,
    cloudSyncedAt: 1_710_000_100_000,
    isOnline: true,
    isSyncing: false,
    conflicts: [],
    pendingImportReport: null,
    migrationAvailable: false,
    lastSyncError: null,
  }
}

function createOrphanConversationConflict(id: string): WorkspaceStorageStatus['conflicts'][number] {
  return {
    id,
    workspaceId: 'workspace_local',
    entityType: 'conversation',
    entityId: `session_${id}`,
    deviceId: 'device_local',
    localRecord: {
      id: `session_${id}`,
      userId: 'user_stub_default',
      workspaceId: 'workspace_local',
      deviceId: 'device_local',
      version: 2,
      baseVersion: 1,
      contentHash: `hash_${id}`,
      updatedAt: 1_710_000_210_000,
      deletedAt: null,
      syncStatus: 'conflict',
      payload: {
        id: `session_${id}`,
        sessionId: `session_${id}`,
        documentId: 'doc_local',
        documentTitle: 'Default Workspace',
        title: `Orphan Conflict ${id}`,
        messages: [],
        updatedAt: 1_710_000_210_000,
        archivedAt: null,
      },
    },
    cloudRecord: null,
    localPayload: {
      id: `session_${id}`,
      sessionId: `session_${id}`,
      documentId: 'doc_local',
      documentTitle: 'Default Workspace',
      title: `Orphan Conflict ${id}`,
      messages: [],
      updatedAt: 1_710_000_210_000,
      archivedAt: null,
    },
    cloudPayload: null,
    diffHints: {
      updatedAtDeltaMs: null,
      sameContentHash: false,
    },
    analysisStatus: 'ready',
    analysisSource: 'heuristic',
    recommendedResolution: 'save_local_copy',
    confidence: 'high',
    summary: 'Main-database record is missing.',
    reasons: ['Authoritative record is unavailable.'],
    actionableResolutions: ['save_local_copy'],
    mergedPayload: null,
    analyzedAt: 1_710_000_220_000,
    analysisNote: null,
    detectedAt: 1_710_000_220_000,
    resolvedAt: null,
  }
}

function createAdminStatus(overrides?: Partial<LocalStorageAdminStatus>): LocalStorageAdminStatus {
  return {
    mode: 'local_postgres',
    checkedAt: 1_710_000_200_000,
    api: { reachable: true, checkedAt: 1_710_000_200_000 },
    database: {
      driver: 'postgres',
      configured: true,
      reachable: true,
      label: 'Local Postgres / brainflow',
      lastError: null,
      backupFormat: 'custom',
      lastBackupAt: 1_710_000_180_000,
    },
    backup: { available: true, directory: 'backups/postgres', lastError: null },
    auth: { mode: 'stub', authenticated: true, username: 'admin' },
    workspace: { id: 'workspace_local', name: 'Default Workspace' },
    workspaces: [
      {
        id: 'workspace_local',
        userId: 'user_stub_default',
        name: 'Default Workspace',
        createdAt: 1_709_999_000_000,
        updatedAt: 1_710_000_180_000,
        documentCount: 2,
        conversationCount: 1,
      },
      {
        id: 'workspace_archive',
        userId: 'user_stub_default',
        name: 'Archive Workspace',
        createdAt: 1_709_998_000_000,
        updatedAt: 1_710_000_120_000,
        documentCount: 1,
        conversationCount: 0,
      },
    ],
    runtime: { canonicalOrigin: 'http://127.0.0.1:4173' },
    browserCacheSummary: {
      indexedDbAvailable: true,
      deviceId: 'device_local',
      workspaceId: 'workspace_local',
      pendingOpCount: 2,
      lastLocalWriteAt: 1_710_000_150_000,
      lastCloudSyncAt: 1_710_000_100_000,
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
    ...overrides,
  }
}

function createImportReport(): ImportReport {
  return {
    success: true,
    importedDocuments: 2,
    importedConversations: 3,
    duplicatedDocuments: [],
    failures: [],
    warnings: [],
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StorageSettingsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  const syncStatus = createSyncStatus()
  const adminStatus = createAdminStatus()

  workspaceStorageServiceMock.getStatus.mockReturnValue(syncStatus)
  workspaceStorageServiceMock.refreshAdminStatus.mockResolvedValue(adminStatus)
  workspaceStorageServiceMock.getAdminStatus.mockResolvedValue(adminStatus)
  workspaceStorageServiceMock.subscribe.mockImplementation(() => () => undefined)
  workspaceStorageServiceMock.discardLocalConflicts.mockResolvedValue(createSyncStatus())
  workspaceStorageServiceMock.exportBackupToDownload.mockResolvedValue(undefined)
  workspaceStorageServiceMock.importBackup.mockResolvedValue(createImportReport())
  workspaceStorageServiceMock.downloadDatabaseBackup.mockResolvedValue(undefined)
  workspaceStorageServiceMock.migrateLegacyDataToPrimaryStorage.mockResolvedValue(adminStatus)
  workspaceStorageServiceMock.switchWorkspace.mockResolvedValue(
    createAdminStatus({
      workspace: { id: 'workspace_archive', name: 'Archive Workspace' },
      browserCacheSummary: {
        indexedDbAvailable: true,
        deviceId: 'device_local',
        workspaceId: 'workspace_archive',
        pendingOpCount: 0,
        lastLocalWriteAt: 1_710_000_220_000,
        lastCloudSyncAt: 1_710_000_220_000,
        isOnline: true,
        isSyncing: false,
        lastSyncError: null,
        conflictCount: 0,
        legacyMigrationCompleted: true,
      },
    }),
  )
  workspaceStorageServiceMock.deleteWorkspace.mockResolvedValue(
    createAdminStatus({
      workspaces: [
        {
          id: 'workspace_local',
          userId: 'user_stub_default',
          name: 'Default Workspace',
          createdAt: 1_709_999_000_000,
          updatedAt: 1_710_000_180_000,
          documentCount: 2,
          conversationCount: 1,
        },
      ],
    }),
  )
  workspaceStorageServiceMock.createWorkspace.mockResolvedValue(
    createAdminStatus({
      workspaces: [
        ...adminStatus.workspaces,
        {
          id: 'workspace_new',
          userId: 'user_stub_default',
          name: 'New Workspace',
          createdAt: 1_710_000_220_000,
          updatedAt: 1_710_000_220_000,
          documentCount: 0,
          conversationCount: 0,
        },
      ],
    }),
  )
  workspaceStorageServiceMock.renameWorkspace.mockResolvedValue(
    createAdminStatus({
      workspace: { id: 'workspace_local', name: 'Renamed Workspace' },
      workspaces: [
        {
          id: 'workspace_local',
          userId: 'user_stub_default',
          name: 'Renamed Workspace',
          createdAt: 1_709_999_000_000,
          updatedAt: 1_710_000_240_000,
          documentCount: 2,
          conversationCount: 1,
        },
        adminStatus.workspaces[1],
      ],
    }),
  )
  authSessionServiceMock.logout.mockResolvedValue(undefined)
})

describe('StorageSettingsPage', () => {
  it('renders the workspace and advanced panels', async () => {
    renderPage()

    expect(await screen.findByTestId('storage-settings-workspace-panel')).toBeInTheDocument()
    expect(screen.getByTestId('storage-settings-advanced')).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: '\u65b0\u5efa\u5de5\u4f5c\u533a' })).toBeInTheDocument()
  })

  it('shows the import report after restoring a ZIP', async () => {
    renderPage()

    await screen.findByTestId('storage-settings-workspace-panel')
    const file = new File(['backup'], 'workspace.zip', { type: 'application/zip' })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    })

    await waitFor(() => expect(workspaceStorageServiceMock.importBackup).toHaveBeenCalledWith(file))
    expect(await screen.findByText('Import Report')).toBeInTheDocument()
  })

  it('creates a workspace from the management panel', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '\u65b0\u5efa\u5de5\u4f5c\u533a' }))
    await userEvent.type(screen.getByPlaceholderText('\u4f8b\u5982\uff1a\u4ea7\u54c1\u8111\u56fe\u5e93'), 'New Workspace')
    await userEvent.click(screen.getByRole('button', { name: '\u521b\u5efa\u5de5\u4f5c\u533a' }))

    await waitFor(() => expect(workspaceStorageServiceMock.createWorkspace).toHaveBeenCalledWith('New Workspace'))
  })

  it('renames the current workspace', async () => {
    renderPage()

    const row = await screen.findByTestId('storage-settings-workspace-workspace_local')
    await userEvent.click(within(row).getByRole('button', { name: '\u91cd\u547d\u540d\u5de5\u4f5c\u533a' }))
    const input = screen.getByDisplayValue('Default Workspace')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed Workspace')
    await userEvent.click(screen.getByRole('button', { name: '\u4fdd\u5b58\u540d\u79f0' }))

    await waitFor(() =>
      expect(workspaceStorageServiceMock.renameWorkspace).toHaveBeenCalledWith(
        'workspace_local',
        'Renamed Workspace',
      ),
    )
  })

  it('requires the full workspace name before deleting', async () => {
    renderPage()

    const row = await screen.findByTestId('storage-settings-workspace-workspace_archive')
    await userEvent.click(within(row).getByRole('button', { name: '\u5220\u9664\u5de5\u4f5c\u533a' }))
    const confirmButton = screen.getByRole('button', { name: '\u786e\u8ba4\u5220\u9664' })
    expect(confirmButton).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText('Archive Workspace'), 'Archive Workspace')
    expect(confirmButton).toBeEnabled()
    await userEvent.click(confirmButton)

    await waitFor(() => expect(workspaceStorageServiceMock.deleteWorkspace).toHaveBeenCalledWith('workspace_archive'))
  })

  it('clears orphan conflicts from the queue in one action', async () => {
    const syncStatus = createSyncStatus()
    syncStatus.conflicts = [
      createOrphanConversationConflict('conflict_orphan_1'),
      createOrphanConversationConflict('conflict_orphan_2'),
    ]
    workspaceStorageServiceMock.getStatus.mockReturnValue(syncStatus)

    renderPage()

    const button = await screen.findByRole('button', {
      name: '\u6e05\u9664 2 \u6761\u65e0\u4e3b\u51b2\u7a81',
    })
    await userEvent.click(button)

    await waitFor(() =>
      expect(workspaceStorageServiceMock.discardLocalConflicts).toHaveBeenCalledWith([
        'conflict_orphan_1',
        'conflict_orphan_2',
      ]),
    )
    expect(
      await screen.findByText('\u5df2\u6e05\u9664 2 \u6761\u65e0\u4e3b\u51b2\u7a81\u3002'),
    ).toBeInTheDocument()
  })
})
