import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type {
  SyncAnalyzeConflictResponse,
  SyncConflictRecord,
  SyncEnvelope,
  SyncPullResponse,
  SyncResolveConflictResponse,
  SyncWorkspaceSummary,
} from '../../../../shared/sync-contract'
import type { MindMapDocument } from '../../documents/types'
import type { StorageConflictRecord } from '../domain/sync-records'
import type { CloudSyncIdb } from '../local/cloud-sync-idb'
import { writeConflictVerificationSummary, type ConflictVerificationEntry } from '../../../test/conflict-verification'

interface TestModules {
  App: typeof import('../../../App').default
  cloudSyncIdb: CloudSyncIdb
  createMindMapDocument: typeof import('../../documents/document-factory').createMindMapDocument
  createPendingConflictAnalysis: typeof import('../domain/sync-records').createPendingConflictAnalysis
  toDocumentContent: typeof import('../domain/sync-records').toDocumentContent
}

interface DocumentConflictFixture {
  workspace: SyncWorkspaceSummary
  deviceId: string
  document: MindMapDocument
  localRecord: SyncEnvelope<ReturnType<TestModules['toDocumentContent']>>
  cloudRecord: SyncEnvelope<ReturnType<TestModules['toDocumentContent']>> | null
  conflict: StorageConflictRecord
  mergedPayload: ReturnType<TestModules['toDocumentContent']>
}

const verificationEntries: ConflictVerificationEntry[] = []

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function loadTestModules(): Promise<TestModules> {
  vi.resetModules()

  const [{ default: App }, { cloudSyncIdb }, { createMindMapDocument }, syncRecords] = await Promise.all([
    import('../../../App'),
    import('../local/cloud-sync-idb'),
    import('../../documents/document-factory'),
    import('../domain/sync-records'),
  ])

  return {
    App,
    cloudSyncIdb,
    createMindMapDocument,
    createPendingConflictAnalysis: syncRecords.createPendingConflictAnalysis,
    toDocumentContent: syncRecords.toDocumentContent,
  }
}

function buildWorkspace(): SyncWorkspaceSummary {
  return {
    id: 'workspace_conflict_test',
    userId: 'user_stub_default',
    name: 'Conflict Test Workspace',
    createdAt: 100,
    updatedAt: 100,
  }
}

function buildDocumentFixture(
  modules: TestModules,
  options: {
    title: string
    conflictId: string
    ready: boolean
    cloudMissing?: boolean
    mergedRecommended?: boolean
  },
): DocumentConflictFixture {
  const workspace = buildWorkspace()
  const deviceId = 'device_conflict_test'
  const document = modules.createMindMapDocument(options.title)
  const baseContent = modules.toDocumentContent(document)
  const localPayload = {
    ...structuredClone(baseContent),
    title: `${options.title} Local`,
    updatedAt: 200,
  }
  const cloudPayload = {
    ...structuredClone(baseContent),
    title: `${options.title} Cloud`,
    updatedAt: 300,
  }
  const mergedPayload = {
    ...structuredClone(baseContent),
    title: `${options.title} Merged`,
    updatedAt: 400,
  }

  const localRecord: SyncEnvelope<typeof localPayload> = {
    id: document.id,
    userId: workspace.userId,
    workspaceId: workspace.id,
    deviceId,
    version: 2,
    baseVersion: 1,
    contentHash: `hash_local_${document.id}`,
    updatedAt: localPayload.updatedAt,
    deletedAt: null,
    syncStatus: 'conflict',
    payload: localPayload,
  }
  const cloudRecord: SyncEnvelope<typeof cloudPayload> | null = options.cloudMissing
    ? null
    : {
        id: document.id,
        userId: workspace.userId,
        workspaceId: workspace.id,
        deviceId: 'device_cloud',
        version: 3,
        baseVersion: 2,
        contentHash: `hash_cloud_${document.id}`,
        updatedAt: cloudPayload.updatedAt,
        deletedAt: null,
        syncStatus: 'conflict',
        payload: cloudPayload,
      }

  const baseConflict: SyncConflictRecord<typeof localPayload> = {
    ...modules.createPendingConflictAnalysis<typeof localPayload>(),
    id: options.conflictId,
    workspaceId: workspace.id,
    entityType: 'document',
    entityId: document.id,
    deviceId,
    localRecord,
    cloudRecord,
    localPayload,
    cloudPayload: cloudRecord?.payload ?? null,
    diffHints: {
      updatedAtDeltaMs: cloudRecord ? cloudRecord.updatedAt - localRecord.updatedAt : null,
      sameContentHash: false,
    },
    detectedAt: 500,
    resolvedAt: null,
  }

  const conflict: StorageConflictRecord = options.ready
    ? ({
        ...baseConflict,
        analysisStatus: 'ready',
        analysisSource: options.cloudMissing ? 'heuristic' : 'ai',
        recommendedResolution: options.cloudMissing
          ? 'save_local_copy'
          : options.mergedRecommended
            ? 'merged_payload'
            : 'use_cloud',
        confidence: 'high',
        summary: options.cloudMissing
          ? 'Cloud copy is missing, so the local copy should be preserved.'
          : options.mergedRecommended
            ? 'AI recommends applying the merged version for this document.'
            : 'Cloud content should win for this conflict.',
        reasons: options.cloudMissing
          ? ['The cloud version is missing for this entity.']
          : ['Both local and cloud contain meaningful edits.'],
        actionableResolutions: options.cloudMissing
          ? ['save_local_copy']
          : ['merged_payload', 'use_cloud', 'save_local_copy'],
        mergedPayload: options.mergedRecommended ? mergedPayload : null,
        analyzedAt: 700,
        analysisNote: null,
      } as StorageConflictRecord)
    : (baseConflict as StorageConflictRecord)

  return {
    workspace,
    deviceId,
    document,
    localRecord,
    cloudRecord,
    conflict,
    mergedPayload,
  }
}

async function seedDocumentConflict(modules: TestModules, fixture: DocumentConflictFixture): Promise<void> {
  localStorage.setItem('brainflow-device-id', JSON.stringify(fixture.deviceId))
  localStorage.setItem('brainflow-cloud-workspace-id', JSON.stringify(fixture.workspace.id))
  localStorage.setItem('brainflow-cloud-workspace-summary', JSON.stringify(fixture.workspace))

  await modules.cloudSyncIdb.saveDocument({
    ...fixture.localRecord,
    syncStatus: 'synced',
  })
  await modules.cloudSyncIdb.saveDeviceInfo({
    deviceId: fixture.deviceId,
    deviceLabel: 'This device',
    platform: 'test',
    lastSeenAt: 900,
    documents: {},
  })
  await modules.cloudSyncIdb.saveSyncState({
    workspaceId: fixture.workspace.id,
    lastPulledCursor: 4,
    lastPullAt: 800,
    lastPushAt: 800,
    isSyncing: false,
    lastError: null,
    hasConflicts: true,
    bootstrapCompletedAt: 700,
  })
  await modules.cloudSyncIdb.saveConflict(fixture.conflict)
}

function installSyncFetchMock(options: {
  analyzeResponse?: SyncAnalyzeConflictResponse<unknown>
  resolveResponse?: SyncResolveConflictResponse<unknown>
  analyzeDelayMs?: number
}) {
  const calls = {
    analyze: 0,
    resolve: 0,
    pull: 0,
  }

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const url = new URL(requestUrl, 'http://127.0.0.1')

    if (url.pathname === '/api/sync/pull') {
      calls.pull += 1
      const payload: SyncPullResponse<unknown> = {
        changes: [],
        nextCursor: 4,
        hasMore: false,
      }
      return createJsonResponse(payload)
    }

    if (url.pathname === '/api/sync/analyze-conflict') {
      calls.analyze += 1
      if (!options.analyzeResponse) {
        throw new Error('Unexpected analyze-conflict request in test.')
      }
      if (options.analyzeDelayMs) {
        await new Promise((resolve) => window.setTimeout(resolve, options.analyzeDelayMs))
      }
      return createJsonResponse(options.analyzeResponse)
    }

    if (url.pathname === '/api/sync/resolve-conflict') {
      calls.resolve += 1
      if (!options.resolveResponse) {
        throw new Error('Unexpected resolve-conflict request in test.')
      }
      return createJsonResponse(options.resolveResponse)
    }

    throw new Error(`Unhandled fetch in conflict experience test: ${url.pathname} ${init?.method ?? 'GET'}`)
  })

  return calls
}

describe('Storage conflict experience', () => {
  afterAll(() => {
    writeConflictVerificationSummary(
      'output/e2e/conflict-vitest-summary.json',
      'conflict-vitest',
      verificationEntries,
    )
  })

  it('reanalyzes pending conflicts on app bootstrap and shows a ready recommendation', async () => {
    const modules = await loadTestModules()
    const fixture = buildDocumentFixture(modules, {
      title: 'Pending AI Conflict',
      conflictId: 'conflict_pending_ai',
      ready: false,
      mergedRecommended: true,
    })
    await seedDocumentConflict(modules, fixture)
    const calls = installSyncFetchMock({
      analyzeResponse: {
        analysisSource: 'ai',
        recommendedResolution: 'merged_payload',
        confidence: 'high',
        summary: 'AI recommends applying the merged version for this document.',
        reasons: ['Both local and cloud contain meaningful edits.'],
        actionableResolutions: ['merged_payload', 'use_cloud', 'save_local_copy'],
        mergedPayload: fixture.mergedPayload,
        analyzedAt: 900,
        analysisNote: null,
      },
      analyzeDelayMs: 80,
    })

    window.history.pushState({}, '', '/settings')
    render(<modules.App />)

    await screen.findByTestId('storage-settings-conflict-queue')
    await waitFor(() => {
      expect(calls.analyze).toBe(1)
    })

    expect(calls.analyze).toBe(1)
    let persistedConflict = await modules.cloudSyncIdb.getConflict(fixture.conflict.id)
    await waitFor(async () => {
      persistedConflict = await modules.cloudSyncIdb.getConflict(fixture.conflict.id)
      expect(persistedConflict?.analysisStatus).toBe('ready')
    })
    expect(persistedConflict?.analysisStatus).toBe('ready')
    expect(persistedConflict?.recommendedResolution).toBe('merged_payload')

    verificationEntries.push({
      layer: 'app',
      scenario: 'pending-conflict-bootstrap-analysis',
      passed: true,
      keyAssertions: {
        queueVisible: true,
        recommendationVisible:
          persistedConflict?.summary === 'AI recommends applying the merged version for this document.',
        analyzeCalledOnce: calls.analyze === 1,
        persistedReady: persistedConflict?.analysisStatus === 'ready',
      },
      recommendedResolution: persistedConflict?.recommendedResolution ?? null,
      userChoice: null,
      finalPersistence: persistedConflict?.analysisStatus ?? 'missing',
      forbiddenActionVisible: null,
      screenshotPaths: [],
      tracePath: null,
      notes: [],
    })
  })

  it('keeps a dismissed conflict available in settings and does not reanalyze ready conflicts', async () => {
    const modules = await loadTestModules()
    const fixture = buildDocumentFixture(modules, {
      title: 'Cloud Missing Conflict',
      conflictId: 'conflict_cloud_missing',
      ready: true,
      cloudMissing: true,
    })
    await seedDocumentConflict(modules, fixture)

    const calls = installSyncFetchMock({})
    window.history.pushState({}, '', '/settings')
    const { unmount } = render(<modules.App />)

    await screen.findByTestId('storage-settings-conflict-queue')
    await screen.findByTestId('storage-conflict-dialog')
    expect(screen.getByTestId('storage-conflict-action-save_local_copy')).toBeInTheDocument()
    expect(screen.queryByTestId('storage-conflict-action-use_cloud')).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByTestId('storage-conflict-dismiss'))

    await waitFor(() => {
      expect(screen.queryByTestId('storage-conflict-dialog')).not.toBeInTheDocument()
    })

    const queueItem = await screen.findByTestId(`storage-settings-conflict-${fixture.conflict.id}`)
    expect(queueItem).toHaveTextContent('Cloud copy is missing, so the local copy should be preserved.')
    expect(calls.analyze).toBe(0)

    verificationEntries.push({
      layer: 'app',
      scenario: 'dismissed-conflict-remains-visible-in-settings',
      passed: true,
      keyAssertions: {
        noCloudAction: screen.queryByTestId('storage-conflict-action-use_cloud') === null,
        dismissedDialogClosed: screen.queryByTestId('storage-conflict-dialog') === null,
        queueItemVisible: true,
        readyConflictSkippedAnalyze: calls.analyze === 0,
      },
      recommendedResolution: fixture.conflict.recommendedResolution,
      userChoice: 'dismiss',
      finalPersistence: 'conflict-still-visible-in-settings',
      forbiddenActionVisible: false,
      screenshotPaths: [],
      tracePath: null,
      notes: [],
    })

    unmount()
  })

  it('resolves merged recommendations and persists the resulting state', async () => {
    const modules = await loadTestModules()
    const fixture = buildDocumentFixture(modules, {
      title: 'Merged Resolution Conflict',
      conflictId: 'conflict_merged_resolution',
      ready: true,
      mergedRecommended: true,
    })
    await seedDocumentConflict(modules, fixture)

    const mergedRecord: SyncEnvelope<typeof fixture.mergedPayload> = {
      ...fixture.localRecord,
      version: 4,
      baseVersion: 3,
      updatedAt: 1000,
      syncStatus: 'synced',
      payload: fixture.mergedPayload,
    }

    const calls = installSyncFetchMock({
      resolveResponse: {
        resolvedRecord: mergedRecord,
        cursor: 10,
      },
    })

    window.history.pushState({}, '', '/settings')
    render(<modules.App />)

    await screen.findByTestId('storage-settings-conflict-queue')
    await screen.findByTestId('storage-conflict-action-merged_payload')
    await userEvent.setup().click(screen.getByTestId('storage-conflict-action-merged_payload'))

    await screen.findByTestId('storage-settings-no-conflicts')

    const storedConflict = await modules.cloudSyncIdb.getConflict(fixture.conflict.id)
    const storedDocument = await modules.cloudSyncIdb.getDocument(fixture.document.id)

    expect(calls.resolve).toBe(1)
    expect(storedConflict).toBeNull()
    expect(storedDocument?.payload.title).toBe(fixture.mergedPayload.title)

    verificationEntries.push({
      layer: 'app',
      scenario: 'merged-recommendation-resolution-persists',
      passed: true,
      keyAssertions: {
        mergeActionVisible: true,
        resolveCalledOnce: calls.resolve === 1,
        conflictsCleared: storedConflict === null,
        mergedTitlePersisted: storedDocument?.payload.title === fixture.mergedPayload.title,
      },
      recommendedResolution: fixture.conflict.recommendedResolution,
      userChoice: 'merged_payload',
      finalPersistence: storedDocument?.payload.title ?? 'missing',
      forbiddenActionVisible: null,
      screenshotPaths: [],
      tracePath: null,
      notes: [],
    })
  })
})
