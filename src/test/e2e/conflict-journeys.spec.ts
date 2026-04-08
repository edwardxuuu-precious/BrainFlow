import { expect, test, type Page, type BrowserContext, type Route, type TestInfo } from '@playwright/test'
import type {
  SyncAnalyzeConflictResponse,
  SyncConflictRecord,
  SyncConflictResolution,
  SyncEnvelope,
  SyncResolveConflictResponse,
  SyncWorkspaceSummary,
} from '../../../shared/sync-contract'
import type { AiConversation } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../../features/documents/document-factory'
import { createPendingConflictAnalysis, toDocumentContent } from '../../features/storage/domain/sync-records'
import { sanitizeArtifactName, writeConflictVerificationSummary, type ConflictVerificationEntry } from '../conflict-verification'

type DocumentPayload = ReturnType<typeof toDocumentContent>

interface DocumentConflictFixture {
  workspace: SyncWorkspaceSummary
  deviceId: string
  localRecord: SyncEnvelope<DocumentPayload>
  cloudRecord: SyncEnvelope<DocumentPayload> | null
  mergedPayload: DocumentPayload
  conflict: SyncConflictRecord<DocumentPayload>
}

interface ConversationConflictFixture {
  workspace: SyncWorkspaceSummary
  deviceId: string
  localRecord: SyncEnvelope<AiConversation>
  cloudRecord: SyncEnvelope<AiConversation>
  mergedPayload: AiConversation
  conflict: SyncConflictRecord<AiConversation>
}

const DATABASE_NAMES = [
  'brainflow-documents-v1',
  'brainflow-ai-v1',
  'brainflow-sync-meta-v1',
  'brainflow-sync-v2',
]

const verificationEntries: ConflictVerificationEntry[] = []
const entryByTitle = new Map<string, ConflictVerificationEntry>()

function buildWorkspace(): SyncWorkspaceSummary {
  return {
    id: 'workspace_e2e_conflicts',
    userId: 'user_stub_default',
    name: 'E2E Conflict Workspace',
    createdAt: 100,
    updatedAt: 100,
  }
}

function createDocumentConflictFixture(options: {
  title: string
  conflictId: string
  ready?: boolean
  cloudMissing?: boolean
  mergedRecommended?: boolean
}): DocumentConflictFixture {
  const workspace = buildWorkspace()
  const deviceId = 'device_e2e_conflicts'
  const document = createMindMapDocument(options.title)
  const baseContent = toDocumentContent(document)
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

  const localRecord: SyncEnvelope<DocumentPayload> = {
    id: document.id,
    userId: workspace.userId,
    workspaceId: workspace.id,
    deviceId,
    version: 2,
    baseVersion: 1,
    contentHash: `hash_local_${document.id}`,
    updatedAt: 200,
    deletedAt: null,
    syncStatus: 'conflict',
    payload: localPayload,
  }
  const cloudRecord: SyncEnvelope<DocumentPayload> | null = options.cloudMissing
    ? null
    : {
        id: document.id,
        userId: workspace.userId,
        workspaceId: workspace.id,
        deviceId: 'device_cloud',
        version: 3,
        baseVersion: 2,
        contentHash: `hash_cloud_${document.id}`,
        updatedAt: 300,
        deletedAt: null,
        syncStatus: 'conflict',
        payload: cloudPayload,
      }

  const baseConflict: SyncConflictRecord<DocumentPayload> = {
    ...createPendingConflictAnalysis<DocumentPayload>(),
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

  return {
    workspace,
    deviceId,
    localRecord,
    cloudRecord,
    mergedPayload,
    conflict: options.ready
      ? {
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
          analyzedAt: 900,
          analysisNote: null,
        }
      : baseConflict,
  }
}

function createConversationConflictFixture(): ConversationConflictFixture {
  const workspace = buildWorkspace()
  const deviceId = 'device_e2e_conflicts'
  const documentId = 'doc_conversation_conflict'
  const localPayload: AiConversation = {
    id: 'session_conflict',
    documentId,
    documentTitle: 'Conversation Conflict Document',
    sessionId: 'session_conflict',
    title: 'Conversation Session Local',
    messages: [
      { id: 'm1', role: 'user', content: 'Local branch idea', createdAt: 10 },
      { id: 'm2', role: 'assistant', content: 'Local assistant reply', createdAt: 20 },
    ],
    updatedAt: 200,
    archivedAt: null,
  }
  const cloudPayload: AiConversation = {
    ...structuredClone(localPayload),
    title: 'Conversation Session Cloud',
    messages: [
      { id: 'm1', role: 'user', content: 'Cloud branch idea', createdAt: 10 },
      { id: 'm2', role: 'assistant', content: 'Cloud assistant reply', createdAt: 30 },
    ],
    updatedAt: 300,
  }
  const mergedPayload: AiConversation = {
    ...structuredClone(localPayload),
    title: 'Conversation Session Merged',
    messages: [
      ...localPayload.messages,
      { id: 'm3', role: 'assistant', content: 'Merged assistant reply', createdAt: 40 },
    ],
    updatedAt: 400,
  }

  const localRecord: SyncEnvelope<AiConversation> = {
    id: localPayload.sessionId,
    userId: workspace.userId,
    workspaceId: workspace.id,
    deviceId,
    version: 2,
    baseVersion: 1,
    contentHash: 'hash_conversation_local',
    updatedAt: 200,
    deletedAt: null,
    syncStatus: 'conflict',
    payload: localPayload,
  }
  const cloudRecord: SyncEnvelope<AiConversation> = {
    id: cloudPayload.sessionId,
    userId: workspace.userId,
    workspaceId: workspace.id,
    deviceId: 'device_cloud',
    version: 3,
    baseVersion: 2,
    contentHash: 'hash_conversation_cloud',
    updatedAt: 300,
    deletedAt: null,
    syncStatus: 'conflict',
    payload: cloudPayload,
  }

  return {
    workspace,
    deviceId,
    localRecord,
    cloudRecord,
    mergedPayload,
    conflict: {
      ...createPendingConflictAnalysis<AiConversation>(),
      id: 'conflict_conversation_pending',
      workspaceId: workspace.id,
      entityType: 'conversation',
      entityId: localPayload.sessionId,
      deviceId,
      localRecord,
      cloudRecord,
      localPayload,
      cloudPayload,
      diffHints: {
        updatedAtDeltaMs: 100,
        sameContentHash: false,
      },
      detectedAt: 500,
      resolvedAt: null,
    },
  }
}

function createEntry(scenario: string): ConflictVerificationEntry {
  return {
    layer: 'e2e',
    scenario,
    passed: false,
    keyAssertions: {},
    recommendedResolution: null,
    userChoice: null,
    finalPersistence: 'unknown',
    forbiddenActionVisible: null,
    screenshotPaths: [],
    tracePath: null,
    notes: [],
  }
}

async function waitForPageStability(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.readyState === 'complete')
  await page.waitForTimeout(100)
}

async function createStoragePage(context: BrowserContext): Promise<Page> {
  const storagePage = await context.newPage()
  await storagePage.goto('/__vite_ping')
  await waitForPageStability(storagePage)
  return storagePage
}

async function deleteDatabase(page: Page, name: string): Promise<void> {
  await page.evaluate(async (databaseName) => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  }, name)
}

async function resetWorkspace(context: BrowserContext): Promise<void> {
  const storagePage = await createStoragePage(context)
  try {
    await storagePage.evaluate(() => localStorage.clear())
    for (const name of DATABASE_NAMES) {
      await deleteDatabase(storagePage, name)
    }
    await storagePage.waitForTimeout(50)
  } finally {
    await storagePage.close()
  }
}

async function seedSyncDatabase(
  context: BrowserContext,
  input: {
    workspace: SyncWorkspaceSummary
    deviceId: string
    documentRecord?: SyncEnvelope<DocumentPayload>
    conversationRecord?: SyncEnvelope<AiConversation>
    conflict: SyncConflictRecord<unknown>
  },
): Promise<void> {
  const storagePage = await createStoragePage(context)
  try {
    await storagePage.evaluate(async (payload) => {
      localStorage.setItem('brainflow-device-id', JSON.stringify(payload.deviceId))
      localStorage.setItem('brainflow-cloud-workspace-id', JSON.stringify(payload.workspace.id))
      localStorage.setItem('brainflow-cloud-workspace-summary', JSON.stringify(payload.workspace))

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('brainflow-sync-v2')

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction(
            [
              'documents_cache',
              'conversations_cache',
              'sync_state',
              'device_info',
              'sync_conflicts',
            ],
            'readwrite',
          )

          transaction.objectStore('sync_state').put({
            workspaceId: payload.workspace.id,
            lastPulledCursor: 4,
            lastPullAt: 800,
            lastPushAt: 800,
            isSyncing: false,
            lastError: null,
            hasConflicts: true,
            bootstrapCompletedAt: 700,
          })
          transaction.objectStore('device_info').put({
            deviceId: payload.deviceId,
            deviceLabel: 'This device',
            platform: 'playwright',
            lastSeenAt: 900,
            documents: {},
          })

          if (payload.documentRecord) {
            transaction.objectStore('documents_cache').put({
              ...payload.documentRecord,
              syncStatus: 'synced',
            })
          }

          if (payload.conversationRecord) {
            transaction.objectStore('conversations_cache').put({
              ...payload.conversationRecord,
              syncStatus: 'synced',
            })
          }

          transaction.objectStore('sync_conflicts').put(payload.conflict)

          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => reject(transaction.error)
        }
      })
    }, input)
  } finally {
    await storagePage.close()
  }
}

async function readDocumentTitle(page: Page, documentId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    return new Promise<string | null>((resolve) => {
      const request = indexedDB.open('brainflow-sync-v2')

      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('documents_cache', 'readonly')
        const store = transaction.objectStore('documents_cache')
        const getRequest = store.get(id)
        getRequest.onerror = () => {
          database.close()
          resolve(null)
        }
        getRequest.onsuccess = () => {
          database.close()
          resolve((getRequest.result?.payload?.title as string | undefined) ?? null)
        }
      }
    })
  }, documentId)
}

async function readConversationTitle(page: Page, sessionId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    return new Promise<string | null>((resolve) => {
      const request = indexedDB.open('brainflow-sync-v2')
      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('conversations_cache', 'readonly')
        const store = transaction.objectStore('conversations_cache')
        const getRequest = store.get(id)
        getRequest.onerror = () => {
          database.close()
          resolve(null)
        }
        getRequest.onsuccess = () => {
          database.close()
          resolve((getRequest.result?.payload?.title as string | undefined) ?? null)
        }
      }
    })
  }, sessionId)
}

async function readConflictRecord(page: Page, conflictId: string): Promise<Record<string, unknown> | null> {
  return page.evaluate(async (id) => {
    return new Promise<Record<string, unknown> | null>((resolve) => {
      const request = indexedDB.open('brainflow-sync-v2')
      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('sync_conflicts', 'readonly')
        const store = transaction.objectStore('sync_conflicts')
        const getRequest = store.get(id)
        getRequest.onerror = () => {
          database.close()
          resolve(null)
        }
        getRequest.onsuccess = () => {
          database.close()
          resolve((getRequest.result as Record<string, unknown> | null) ?? null)
        }
      }
    })
  }, conflictId)
}

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  })
}

async function installSyncRoutes(
  page: Page,
  options: {
    analyzeResponse?: SyncAnalyzeConflictResponse<unknown>
    analyzeDelayMs?: number
    analyzeStatus?: number
    resolveHandler?: (resolution: SyncConflictResolution) => SyncResolveConflictResponse<unknown>
    workspace?: SyncWorkspaceSummary
  },
): Promise<void> {
  const workspace = options.workspace ?? buildWorkspace()

  await page.route('**/api/sync/pull*', async (route) => {
    await fulfillJson(route, {
      changes: [],
      nextCursor: 4,
      hasMore: false,
    })
  })

  await page.route('**/api/sync/bootstrap', async (route) => {
    await fulfillJson(route, {
      workspace,
      documents: [],
      conversations: [],
      cursor: 4,
      bootstrappedAt: 700,
    })
  })

  await page.route('**/api/sync/push', async (route) => {
    await fulfillJson(route, {
      applied: [],
      cursor: 4,
      serverTime: 800,
    })
  })

  await page.route('**/api/sync/analyze-conflict', async (route) => {
    if (options.analyzeDelayMs) {
      await page.waitForTimeout(options.analyzeDelayMs)
    }

    if (options.analyzeStatus && options.analyzeStatus >= 400) {
      await route.fulfill({
        status: options.analyzeStatus,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ error: 'analysis unavailable' }),
      })
      return
    }

    if (!options.analyzeResponse) {
      throw new Error('Missing analyze response for sync route mock.')
    }

    await fulfillJson(route, options.analyzeResponse)
  })

  await page.route('**/api/sync/resolve-conflict', async (route) => {
    if (!options.resolveHandler) {
      throw new Error('Missing resolve handler for sync route mock.')
    }

    const request = route.request().postDataJSON() as { resolution: SyncConflictResolution }
    await fulfillJson(route, options.resolveHandler(request.resolution))
  })
}

async function captureConflictScreenshot(
  page: Page,
  testInfo: TestInfo,
  label: string,
  entry: ConflictVerificationEntry,
): Promise<void> {
  const artifactName = `${sanitizeArtifactName(testInfo.title)}-${sanitizeArtifactName(label)}.png`
  const screenshotPath = testInfo.outputPath(artifactName)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  entry.screenshotPaths.push(screenshotPath)
}

test.beforeEach(async ({ context }) => {
  await context.tracing.start({ screenshots: true, snapshots: true })
})

test.afterEach(async ({ context, page }, testInfo) => {
  const entry = entryByTitle.get(testInfo.title)
  const tracePath = testInfo.outputPath(`${sanitizeArtifactName(testInfo.title)}.zip`)
  await context.tracing.stop({ path: tracePath })

  if (entry) {
    entry.tracePath = tracePath
    entry.passed = testInfo.status === testInfo.expectedStatus
    if (!entry.passed) {
      const failureScreenshot = testInfo.outputPath(`${sanitizeArtifactName(testInfo.title)}-failure.png`)
      await page.screenshot({ path: failureScreenshot, fullPage: true })
      entry.screenshotPaths.push(failureScreenshot)
      entry.notes.push(`Playwright status: ${testInfo.status}`)
    }
    verificationEntries.push(entry)
    entryByTitle.delete(testInfo.title)
  }
})

test.afterAll(async () => {
  writeConflictVerificationSummary(
    'output/e2e/conflict-summary.json',
    'conflict-e2e',
    verificationEntries,
  )
})

test('handles a complex document conflict from analysis to merged resolution', async ({
  context,
  page,
}) => {
  const entry = createEntry('document-complex-conflict-lifecycle')
  entryByTitle.set(test.info().title, entry)

  const fixture = createDocumentConflictFixture({
    title: 'Complex Conflict Journey',
    conflictId: 'conflict_complex_document',
    mergedRecommended: true,
  })

  await resetWorkspace(context)
  await seedSyncDatabase(context, {
    workspace: fixture.workspace,
    deviceId: fixture.deviceId,
    documentRecord: fixture.localRecord,
    conflict: fixture.conflict,
  })
  await installSyncRoutes(page, {
    workspace: fixture.workspace,
    analyzeResponse: {
      analysisSource: 'ai',
      recommendedResolution: 'merged_payload',
      confidence: 'high',
      summary: 'AI recommends applying the merged version for this document.',
      reasons: ['Both local and cloud contain meaningful edits.'],
      actionableResolutions: ['merged_payload', 'use_cloud', 'save_local_copy'],
      mergedPayload: fixture.mergedPayload,
      analyzedAt: 1000,
      analysisNote: null,
    },
    analyzeDelayMs: 250,
    resolveHandler: () => ({
      resolvedRecord: {
        ...fixture.localRecord,
        version: 4,
        baseVersion: 3,
        updatedAt: 1100,
        syncStatus: 'synced',
        payload: fixture.mergedPayload,
      },
      cursor: 12,
    }),
  })

  await page.goto('/settings')
  await expect(page.getByTestId('storage-settings-conflict-queue')).toBeVisible()
  await expect(page.getByTestId('storage-conflict-dialog')).toBeVisible()
  const pendingStateObserved = await page.getByTestId('storage-conflict-analysis-pending').isVisible()

  await expect(page.getByTestId('storage-conflict-recommendation-card')).toContainText(
    'AI recommends applying the merged version for this document.',
  )
  await captureConflictScreenshot(page, test.info(), 'document-merge-recommendation', entry)

  entry.keyAssertions.pendingStateObserved = pendingStateObserved
  entry.keyAssertions.recommendationRendered = true
  entry.recommendedResolution = 'merged_payload'

  await page.getByTestId('storage-conflict-action-merged_payload').click()
  await expect(page.getByTestId('storage-settings-no-conflicts')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText(fixture.mergedPayload.title, { exact: true })).toBeVisible()

  const storedTitle = await readDocumentTitle(page, fixture.localRecord.id)
  entry.keyAssertions.noConflictsAfterResolve = true
  entry.keyAssertions.mergedTitleVisibleOnHome = storedTitle === fixture.mergedPayload.title
  entry.userChoice = 'merged_payload'
  entry.finalPersistence = storedTitle ?? 'missing'
  entry.forbiddenActionVisible = null
})

test('only offers local copy when the cloud record is missing and shows the new copy after resolution', async ({
  context,
  page,
}) => {
  const entry = createEntry('document-cloud-missing-copy-only')
  entryByTitle.set(test.info().title, entry)

  const fixture = createDocumentConflictFixture({
    title: 'Cloud Missing Journey',
    conflictId: 'conflict_cloud_missing',
    ready: true,
    cloudMissing: true,
  })
  const extraCopyRecord: SyncEnvelope<DocumentPayload> = {
    ...fixture.localRecord,
    id: `${fixture.localRecord.id}_copy`,
    version: 1,
    baseVersion: null,
    updatedAt: 1200,
    syncStatus: 'synced',
    payload: {
      ...fixture.localRecord.payload,
      id: `${fixture.localRecord.id}_copy`,
      title: 'Cloud Missing Journey Copy',
      updatedAt: 1200,
    },
  }

  await resetWorkspace(context)
  await seedSyncDatabase(context, {
    workspace: fixture.workspace,
    deviceId: fixture.deviceId,
    documentRecord: fixture.localRecord,
    conflict: fixture.conflict,
  })
  await installSyncRoutes(page, {
    workspace: fixture.workspace,
    analyzeResponse: undefined,
    resolveHandler: () => ({
      resolvedRecord: fixture.localRecord,
      extraCreatedRecord: extraCopyRecord,
      cursor: 13,
    }),
  })

  await page.goto('/settings')
  await expect(page.getByTestId('storage-conflict-dialog')).toBeVisible()
  await expect(page.getByTestId('storage-conflict-action-save_local_copy')).toBeVisible()
  await expect(page.getByTestId('storage-conflict-action-use_cloud')).toHaveCount(0)
  await captureConflictScreenshot(page, test.info(), 'cloud-missing-recommendation', entry)

  entry.keyAssertions.onlyLocalCopyActionVisible = true
  entry.recommendedResolution = 'save_local_copy'
  entry.forbiddenActionVisible = false

  await page.getByTestId('storage-conflict-action-save_local_copy').click()
  await expect(page.getByTestId('storage-settings-no-conflicts')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Cloud Missing Journey Copy', { exact: true })).toBeVisible()

  const copiedTitle = await readDocumentTitle(page, extraCopyRecord.id)
  entry.keyAssertions.copyVisibleAfterResolve = copiedTitle === 'Cloud Missing Journey Copy'
  entry.userChoice = 'save_local_copy'
  entry.finalPersistence = copiedTitle ?? 'missing'
})

test('lets the user dismiss now and continue later from the settings queue', async ({ context, page }) => {
  const entry = createEntry('dismiss-and-resume-from-settings')
  entryByTitle.set(test.info().title, entry)

  const fixture = createDocumentConflictFixture({
    title: 'Dismiss Later Journey',
    conflictId: 'conflict_dismiss_later',
    ready: true,
    mergedRecommended: true,
  })

  await resetWorkspace(context)
  await seedSyncDatabase(context, {
    workspace: fixture.workspace,
    deviceId: fixture.deviceId,
    documentRecord: fixture.localRecord,
    conflict: fixture.conflict,
  })
  await installSyncRoutes(page, {
    workspace: fixture.workspace,
    resolveHandler: () => ({
      resolvedRecord: fixture.localRecord,
      cursor: 14,
    }),
  })

  await page.goto('/settings')
  await expect(page.getByTestId('storage-conflict-dialog')).toBeVisible()
  await page.getByTestId('storage-conflict-dismiss').click()
  await expect(page.getByTestId(`storage-settings-conflict-${fixture.conflict.id}`)).toBeVisible()
  await captureConflictScreenshot(page, test.info(), 'dismissed-conflict-queue', entry)

  await page.reload()
  await expect(page.getByTestId(`storage-settings-conflict-${fixture.conflict.id}`)).toBeVisible()

  entry.keyAssertions.dismissClosedDialog = true
  entry.keyAssertions.queueRetainedConflict = true
  entry.keyAssertions.reloadStillShowsConflict = true
  entry.recommendedResolution = fixture.conflict.recommendedResolution
  entry.userChoice = 'dismiss'
  entry.finalPersistence = 'conflict-retained'
})

test('handles conversation conflicts and persists the authoritative session after confirmation', async ({
  context,
  page,
}) => {
  const entry = createEntry('conversation-conflict-resolution')
  entryByTitle.set(test.info().title, entry)

  const fixture = createConversationConflictFixture()

  await resetWorkspace(context)
  await seedSyncDatabase(context, {
    workspace: fixture.workspace,
    deviceId: fixture.deviceId,
    documentRecord: createDocumentConflictFixture({
      title: 'Conversation Conflict Document',
      conflictId: 'seed_document',
      ready: true,
      mergedRecommended: true,
    }).localRecord,
    conversationRecord: fixture.localRecord,
    conflict: fixture.conflict,
  })
  await installSyncRoutes(page, {
    workspace: fixture.workspace,
    analyzeResponse: {
      analysisSource: 'ai',
      recommendedResolution: 'use_cloud',
      confidence: 'medium',
      summary: 'The cloud conversation should be restored for this session.',
      reasons: ['The cloud session is newer and already complete.'],
      actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
      mergedPayload: fixture.mergedPayload,
      analyzedAt: 1000,
      analysisNote: null,
    },
    resolveHandler: () => ({
      resolvedRecord: {
        ...fixture.cloudRecord,
        syncStatus: 'synced',
      },
      cursor: 15,
    }),
  })

  await page.goto('/settings')
  await expect(page.getByTestId('storage-conflict-dialog')).toBeVisible()
  await expect(page.getByTestId('storage-conflict-recommendation-card')).toContainText(
    'The cloud conversation should be restored for this session.',
  )
  await captureConflictScreenshot(page, test.info(), 'conversation-recommendation', entry)

  await page.getByTestId('storage-conflict-action-use_cloud').click()
  await expect(page.getByTestId('storage-settings-no-conflicts')).toBeVisible()

  const conversationTitle = await readConversationTitle(page, fixture.localRecord.id)
  entry.keyAssertions.conversationRecommendationVisible = true
  entry.keyAssertions.conversationPersisted = conversationTitle === fixture.cloudRecord.payload.title
  entry.recommendedResolution = 'use_cloud'
  entry.userChoice = 'use_cloud'
  entry.finalPersistence = conversationTitle ?? 'missing'
})

test('falls back to heuristic guidance when AI analysis is unavailable', async ({ context, page }) => {
  const entry = createEntry('ai-unavailable-fallback')
  entryByTitle.set(test.info().title, entry)

  const fixture = createDocumentConflictFixture({
    title: 'AI Fallback Journey',
    conflictId: 'conflict_ai_fallback',
    mergedRecommended: true,
  })

  await resetWorkspace(context)
  await seedSyncDatabase(context, {
    workspace: fixture.workspace,
    deviceId: fixture.deviceId,
    documentRecord: fixture.localRecord,
    conflict: fixture.conflict,
  })
  await installSyncRoutes(page, {
    workspace: fixture.workspace,
    analyzeStatus: 503,
    resolveHandler: () => ({
      resolvedRecord: fixture.localRecord,
      cursor: 16,
    }),
  })

  await page.goto('/settings')
  await expect(page.getByTestId('storage-conflict-dialog')).toBeVisible()
  await expect(page.getByTestId('storage-conflict-action-save_local_copy')).toBeVisible()
  await captureConflictScreenshot(page, test.info(), 'ai-fallback-ready', entry)

  const conflictRecord = await readConflictRecord(page, fixture.conflict.id)

  entry.keyAssertions.fallbackActionVisible = true
  entry.keyAssertions.fallbackPersisted =
    conflictRecord?.analysisSource === 'heuristic_fallback' &&
    conflictRecord?.analysisStatus === 'ready'
  entry.recommendedResolution = (conflictRecord?.recommendedResolution as string | null) ?? null
  entry.userChoice = null
  entry.finalPersistence = `${conflictRecord?.analysisSource ?? 'missing'}:${conflictRecord?.analysisStatus ?? 'missing'}`
})
