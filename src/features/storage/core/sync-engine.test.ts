import type { AiConversation } from '../../../../shared/ai-contract'
import type { MindMapDocument } from '../../documents/types'
import type {
  SyncConflict,
  SyncResourceShadowState,
  SyncTargetAdapter,
  SyncTargetConnection,
  SyncTargetSnapshot,
  StorageStatus,
} from './sync-types'
import type { ConversationStorageAdapter, DocumentStorageAdapter, LocalIndexAdapter } from './storage-types'
import { createMindMapDocument } from '../../documents/document-factory'

vi.mock('../adapters/indexeddb/sync-metadata-idb', () => ({
  SyncMetadataStore: vi.fn(),
}))

const testConnection: SyncTargetConnection = {
  id: 'test-conn',
  kind: 'filesystem' as const,
  label: 'Test',
  connectedAt: 1000,
}

function makeDocument(overrides: { id: string; title?: string; updatedAt?: number }): MindMapDocument {
  const base = createMindMapDocument(overrides.title ?? 'Test Doc')
  return {
    ...base,
    id: overrides.id,
    updatedAt: overrides.updatedAt ?? base.updatedAt,
  }
}

function createMockDocumentAdapter(): {
  [K in keyof DocumentStorageAdapter]: ReturnType<typeof vi.fn>
} {
  return {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    saveDocument: vi.fn().mockResolvedValue(undefined),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockConversationAdapter(): {
  [K in keyof ConversationStorageAdapter]: ReturnType<typeof vi.fn>
} {
  return {
    listSessions: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockLocalIndexAdapter(): {
  [K in keyof LocalIndexAdapter]: ReturnType<typeof vi.fn>
} {
  return {
    loadDocumentIndex: vi.fn().mockResolvedValue([]),
    saveDocumentIndex: vi.fn().mockResolvedValue(undefined),
    getRecentDocumentId: vi.fn().mockResolvedValue(null),
    setRecentDocumentId: vi.fn().mockResolvedValue(undefined),
    rebuildFromDocuments: vi.fn().mockResolvedValue([]),
  }
}

function createMockMetadataStore() {
  return {
    getConnection: vi.fn().mockResolvedValue(null),
    setConnection: vi.fn().mockResolvedValue(undefined),
    getStorageStatus: vi.fn().mockResolvedValue({ lastSuccessfulSaveAt: null, lastSuccessfulSaveTarget: null }),
    listConflicts: vi.fn().mockResolvedValue([]),
    saveConflict: vi.fn().mockResolvedValue(undefined),
    deleteConflict: vi.fn().mockResolvedValue(undefined),
    clearAllConflicts: vi.fn().mockResolvedValue(undefined),
    listShadows: vi.fn().mockResolvedValue([]),
    saveShadow: vi.fn().mockResolvedValue(undefined),
    deleteShadow: vi.fn().mockResolvedValue(undefined),
    setLastSuccessfulSave: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockTargetAdapter(kind: 'filesystem' | 'cloud' = 'filesystem'): {
  [K in keyof SyncTargetAdapter]: K extends 'kind' ? 'filesystem' | 'cloud' : ReturnType<typeof vi.fn>
} {
  return {
    kind,
    isSupported: vi.fn().mockReturnValue(true),
    connect: vi.fn().mockResolvedValue(testConnection),
    disconnect: vi.fn().mockResolvedValue(undefined),
    scan: vi.fn().mockResolvedValue({
      connection: testConnection,
      scannedAt: Date.now(),
      documents: [],
      conversations: [],
      manifestVersion: '1',
      resources: [],
    } satisfies SyncTargetSnapshot),
    writeDocument: vi.fn().mockResolvedValue(undefined),
    writeConversation: vi.fn().mockResolvedValue(undefined),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  }
}

// Lazy import so the vi.mock above takes effect
let SyncEngine: typeof import('./sync-engine').SyncEngine

beforeAll(async () => {
  const mod = await import('./sync-engine')
  SyncEngine = mod.SyncEngine
})

function buildEngine() {
  const documentAdapter = createMockDocumentAdapter()
  const conversationAdapter = createMockConversationAdapter()
  const localIndexAdapter = createMockLocalIndexAdapter()
  const metadataStore = createMockMetadataStore()
  const targetAdapter = createMockTargetAdapter()

  const engine = new SyncEngine(
    documentAdapter as unknown as DocumentStorageAdapter,
    conversationAdapter as unknown as ConversationStorageAdapter,
    localIndexAdapter as unknown as LocalIndexAdapter,
    metadataStore as any,
    targetAdapter as unknown as SyncTargetAdapter,
  )

  return { engine, documentAdapter, conversationAdapter, localIndexAdapter, metadataStore, targetAdapter }
}

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------
describe('getStatus', () => {
  test('returns local-only mode when no connection', async () => {
    const { engine, metadataStore } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(null)

    const status = await engine.getStatus()

    expect(status.mode).toBe('local-only')
    expect(status.activeConnection).toBeNull()
  })

  test('returns filesystem-connected when filesystem connection exists', async () => {
    const { engine, metadataStore } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(testConnection)

    const status = await engine.getStatus()

    expect(status.mode).toBe('filesystem-connected')
    expect(status.activeConnection).toEqual(testConnection)
  })
})

// ---------------------------------------------------------------------------
// connectTarget
// ---------------------------------------------------------------------------
describe('connectTarget', () => {
  test('calls targetAdapter.connect(), saves connection, scans target', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    // scanConnectedTarget (called inside connectTarget) reads getConnection
    metadataStore.getConnection.mockResolvedValue(testConnection)

    const status = await engine.connectTarget()

    expect(targetAdapter.connect).toHaveBeenCalled()
    expect(metadataStore.setConnection).toHaveBeenCalledWith(testConnection)
    expect(targetAdapter.scan).toHaveBeenCalledWith(testConnection)
    expect(status.mode).toBe('filesystem-connected')
  })
})

// ---------------------------------------------------------------------------
// disconnectTarget
// ---------------------------------------------------------------------------
describe('disconnectTarget', () => {
  test('calls targetAdapter.disconnect if present, clears connection and conflicts', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection
      .mockResolvedValueOnce(testConnection) // for disconnect logic
      .mockResolvedValue(null) // after clearing

    const status = await engine.disconnectTarget()

    expect(targetAdapter.disconnect).toHaveBeenCalledWith(testConnection)
    expect(metadataStore.setConnection).toHaveBeenCalledWith(null)
    expect(metadataStore.clearAllConflicts).toHaveBeenCalled()
    expect(status.mode).toBe('local-only')
  })
})

// ---------------------------------------------------------------------------
// notifyDocumentSaved
// ---------------------------------------------------------------------------
describe('notifyDocumentSaved', () => {
  test('skips if no connection', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(null)

    const doc = makeDocument({ id: 'doc-1' })
    await engine.notifyDocumentSaved(doc)

    expect(targetAdapter.writeDocument).not.toHaveBeenCalled()
  })

  test('skips if conflict exists for resource', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(testConnection)
    metadataStore.listConflicts.mockResolvedValue([
      { id: 'c1', resourceId: 'doc-1', resourceType: 'document' } as SyncConflict,
    ])

    const doc = makeDocument({ id: 'doc-1' })
    await engine.notifyDocumentSaved(doc)

    expect(targetAdapter.writeDocument).not.toHaveBeenCalled()
  })

  test('writes document to target and updates shadow when connected', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(testConnection)
    metadataStore.listConflicts.mockResolvedValue([])

    const doc = makeDocument({ id: 'doc-1', updatedAt: 2000 })
    await engine.notifyDocumentSaved(doc)

    expect(targetAdapter.writeDocument).toHaveBeenCalledWith(testConnection, doc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'document',
        documentId: 'doc-1',
        lastDirection: 'push',
      }),
    )
    expect(metadataStore.setLastSuccessfulSave).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// notifyDocumentDeleted
// ---------------------------------------------------------------------------
describe('notifyDocumentDeleted', () => {
  test('skips if no connection', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(null)

    await engine.notifyDocumentDeleted('doc-1')

    expect(targetAdapter.deleteDocument).not.toHaveBeenCalled()
  })

  test('deletes from target and removes shadow when connected', async () => {
    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(testConnection)

    await engine.notifyDocumentDeleted('doc-1')

    expect(targetAdapter.deleteDocument).toHaveBeenCalledWith(testConnection, 'doc-1')
    expect(metadataStore.deleteShadow).toHaveBeenCalledWith('doc-1')
    expect(metadataStore.setLastSuccessfulSave).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// scanConnectedTarget
// ---------------------------------------------------------------------------
describe('scanConnectedTarget', () => {
  function setupScan(opts: {
    localDocs?: MindMapDocument[]
    targetDocs?: MindMapDocument[]
    shadows?: SyncResourceShadowState[]
  }) {
    const ctx = buildEngine()
    const { metadataStore, targetAdapter, documentAdapter } = ctx

    metadataStore.getConnection.mockResolvedValue(testConnection)
    documentAdapter.listDocuments.mockResolvedValue(opts.localDocs ?? [])
    metadataStore.listShadows.mockResolvedValue(opts.shadows ?? [])
    targetAdapter.scan.mockResolvedValue({
      connection: testConnection,
      scannedAt: Date.now(),
      documents: opts.targetDocs ?? [],
      conversations: [],
      manifestVersion: '1',
      resources: [],
    } satisfies SyncTargetSnapshot)

    return ctx
  }

  test('both hashes equal — saves shadow, no conflict', async () => {
    const doc = makeDocument({ id: 'doc-1', updatedAt: 1000 })
    const { engine, metadataStore } = setupScan({
      localDocs: [doc],
      targetDocs: [doc], // same object => same hash
    })

    await engine.scanConnectedTarget()

    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-1', lastDirection: 'pull' }),
    )
    expect(metadataStore.saveConflict).not.toHaveBeenCalled()
  })

  test('only target exists — pulls to local', async () => {
    const targetDoc = makeDocument({ id: 'doc-t', updatedAt: 2000 })
    const { engine, documentAdapter, metadataStore } = setupScan({
      localDocs: [],
      targetDocs: [targetDoc],
    })

    await engine.scanConnectedTarget()

    expect(documentAdapter.saveDocument).toHaveBeenCalledWith(targetDoc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-t', lastDirection: 'pull' }),
    )
  })

  test('only local exists (no prior shadow) — pushes to target', async () => {
    const localDoc = makeDocument({ id: 'doc-l', updatedAt: 3000 })
    const { engine, targetAdapter, metadataStore } = setupScan({
      localDocs: [localDoc],
      targetDocs: [],
      shadows: [],
    })

    await engine.scanConnectedTarget()

    expect(targetAdapter.writeDocument).toHaveBeenCalledWith(testConnection, localDoc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-l', lastDirection: 'push' }),
    )
  })

  test('both exist, no shadow — creates conflict', async () => {
    const localDoc = makeDocument({ id: 'doc-c', updatedAt: 1000 })
    const targetDoc = makeDocument({ id: 'doc-c', updatedAt: 2000 })
    const { engine, metadataStore } = setupScan({
      localDocs: [localDoc],
      targetDocs: [targetDoc],
      shadows: [],
    })

    await engine.scanConnectedTarget()

    expect(metadataStore.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-c' }),
    )
  })

  test('local matches shadow, target changed — pulls target', async () => {
    const localDoc = makeDocument({ id: 'doc-p', updatedAt: 1000 })
    const targetDoc = makeDocument({ id: 'doc-p', updatedAt: 2000 })

    // We need the shadow hash to match localDoc's hash. We compute it by importing.
    const { computeContentHash } = await import('./content-hash')
    const localHash = await computeContentHash(localDoc)

    const { engine, documentAdapter, metadataStore } = setupScan({
      localDocs: [localDoc],
      targetDocs: [targetDoc],
      shadows: [
        {
          resourceType: 'document',
          resourceId: 'doc-p',
          documentId: 'doc-p',
          sessionId: null,
          lastSyncedHash: localHash,
          lastSyncedUpdatedAt: 1000,
          lastDirection: 'push',
        },
      ],
    })

    await engine.scanConnectedTarget()

    expect(documentAdapter.saveDocument).toHaveBeenCalledWith(targetDoc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-p', lastDirection: 'pull' }),
    )
  })

  test('target matches shadow, local changed — pushes local', async () => {
    const localDoc = makeDocument({ id: 'doc-q', updatedAt: 3000 })
    const targetDoc = makeDocument({ id: 'doc-q', updatedAt: 1000 })

    const { computeContentHash } = await import('./content-hash')
    const targetHash = await computeContentHash(targetDoc)

    const { engine, targetAdapter, metadataStore } = setupScan({
      localDocs: [localDoc],
      targetDocs: [targetDoc],
      shadows: [
        {
          resourceType: 'document',
          resourceId: 'doc-q',
          documentId: 'doc-q',
          sessionId: null,
          lastSyncedHash: targetHash,
          lastSyncedUpdatedAt: 1000,
          lastDirection: 'pull',
        },
      ],
    })

    await engine.scanConnectedTarget()

    expect(targetAdapter.writeDocument).toHaveBeenCalledWith(testConnection, localDoc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-q', lastDirection: 'push' }),
    )
  })

  test('both changed from shadow — creates conflict', async () => {
    const localDoc = makeDocument({ id: 'doc-r', updatedAt: 3000 })
    const targetDoc = makeDocument({ id: 'doc-r', updatedAt: 4000 })

    const { engine, metadataStore } = setupScan({
      localDocs: [localDoc],
      targetDocs: [targetDoc],
      shadows: [
        {
          resourceType: 'document',
          resourceId: 'doc-r',
          documentId: 'doc-r',
          sessionId: null,
          lastSyncedHash: 'sha256:old-hash-that-matches-neither',
          lastSyncedUpdatedAt: 1000,
          lastDirection: 'push',
        },
      ],
    })

    await engine.scanConnectedTarget()

    expect(metadataStore.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-r' }),
    )
  })
})

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------
describe('resolveConflict', () => {
  test('keep-local — writes local to target', async () => {
    const localDoc = makeDocument({ id: 'doc-x', updatedAt: 5000 })
    const targetDoc = makeDocument({ id: 'doc-x', updatedAt: 4000 })

    const conflict: SyncConflict = {
      id: 'conflict:document:doc-x',
      resourceType: 'document',
      resourceId: 'doc-x',
      documentId: 'doc-x',
      sessionId: null,
      localUpdatedAt: 5000,
      targetUpdatedAt: 4000,
      localHash: 'sha256:local',
      targetHash: 'sha256:target',
      suggestedWinner: 'local',
      detectedAt: Date.now(),
      localDocument: localDoc,
      targetDocument: targetDoc,
    }

    const { engine, metadataStore, targetAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(testConnection)
    metadataStore.listConflicts.mockResolvedValue([conflict])

    await engine.resolveConflict('conflict:document:doc-x', 'keep-local')

    expect(targetAdapter.writeDocument).toHaveBeenCalledWith(testConnection, localDoc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-x', lastDirection: 'push' }),
    )
    expect(metadataStore.deleteConflict).toHaveBeenCalledWith('conflict:document:doc-x')
  })

  test('keep-target — writes target to local', async () => {
    const localDoc = makeDocument({ id: 'doc-y', updatedAt: 5000 })
    const targetDoc = makeDocument({ id: 'doc-y', updatedAt: 6000 })

    const conflict: SyncConflict = {
      id: 'conflict:document:doc-y',
      resourceType: 'document',
      resourceId: 'doc-y',
      documentId: 'doc-y',
      sessionId: null,
      localUpdatedAt: 5000,
      targetUpdatedAt: 6000,
      localHash: 'sha256:local',
      targetHash: 'sha256:target',
      suggestedWinner: 'target',
      detectedAt: Date.now(),
      localDocument: localDoc,
      targetDocument: targetDoc,
    }

    const { engine, metadataStore, documentAdapter, localIndexAdapter } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(testConnection)
    metadataStore.listConflicts.mockResolvedValue([conflict])

    await engine.resolveConflict('conflict:document:doc-y', 'keep-target')

    expect(documentAdapter.saveDocument).toHaveBeenCalledWith(targetDoc)
    expect(metadataStore.saveShadow).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-y', lastDirection: 'pull' }),
    )
    expect(metadataStore.deleteConflict).toHaveBeenCalledWith('conflict:document:doc-y')
    // keep-target for a document triggers rebuildLocalIndex
    expect(localIndexAdapter.rebuildFromDocuments).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// subscribe
// ---------------------------------------------------------------------------
describe('subscribe', () => {
  test('listener receives status immediately on subscribe', async () => {
    const { engine, metadataStore } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(null)

    const listener = vi.fn()
    engine.subscribe(listener)

    // The listener is called asynchronously via a microtask
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    const status: StorageStatus = listener.mock.calls[0][0]
    expect(status.mode).toBe('local-only')
  })

  test('unsubscribe stops notifications', async () => {
    const { engine, metadataStore } = buildEngine()
    metadataStore.getConnection.mockResolvedValue(null)

    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    unsubscribe()

    // Trigger emitStatus via getStatus-related path
    await engine.disconnectTarget()

    // Listener should still only have been called once (the initial call)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
