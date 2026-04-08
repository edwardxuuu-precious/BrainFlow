import type { AiConversation } from '../../../../shared/ai-contract'
import { createMindMapDocument } from '../../documents/document-factory'
import type { MindMapDocument } from '../../documents/types'
import type { ConversationStorageAdapter, DocumentStorageAdapter, LocalIndexAdapter } from './storage-types'
import type {
  StorageMode,
  StorageStatus,
  SyncResourceShadowState,
  SyncResolution,
  SyncTargetAdapter,
} from './sync-types'
import { computeContentHash } from './content-hash'
import { createSyncConflict } from './conflict-manager'
import { MutationQueue } from './mutation-queue'
import { SyncMetadataStore } from '../adapters/indexeddb/sync-metadata-idb'

type Listener = (status: StorageStatus) => void

function createSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function buildDocumentSummaryFallback(documents: MindMapDocument[]): string | null {
  return documents[0]?.id ?? null
}

function buildShadowState(
  resourceType: 'document' | 'conversation',
  documentId: string,
  sessionId: string | null,
  hash: string | null,
  updatedAt: number | null,
  direction: 'push' | 'pull',
): SyncResourceShadowState {
  return {
    resourceType,
    resourceId: resourceType === 'document' ? documentId : `${documentId}:${sessionId ?? 'unknown'}`,
    documentId,
    sessionId,
    lastSyncedHash: hash,
    lastSyncedUpdatedAt: updatedAt,
    lastDirection: direction,
  }
}

async function indexByHash<T extends { id?: string; documentId?: string; sessionId?: string | null }>(
  items: T[],
  getResourceId: (item: T) => string,
): Promise<Map<string, { value: T; hash: string }>> {
  const entries = await Promise.all(
    items.map(async (item) => [getResourceId(item), { value: item, hash: await computeContentHash(item) }] as const),
  )

  return new Map(entries)
}

export class SyncEngine {
  private readonly documentAdapter: DocumentStorageAdapter
  private readonly conversationAdapter: ConversationStorageAdapter
  private readonly localIndexAdapter: LocalIndexAdapter
  private readonly metadataStore: SyncMetadataStore
  private readonly targetAdapter: SyncTargetAdapter
  private readonly listeners = new Set<Listener>()
  private readonly queue = new MutationQueue()

  constructor(
    documentAdapter: DocumentStorageAdapter,
    conversationAdapter: ConversationStorageAdapter,
    localIndexAdapter: LocalIndexAdapter,
    metadataStore: SyncMetadataStore,
    targetAdapter: SyncTargetAdapter,
  ) {
    this.documentAdapter = documentAdapter
    this.conversationAdapter = conversationAdapter
    this.localIndexAdapter = localIndexAdapter
    this.metadataStore = metadataStore
    this.targetAdapter = targetAdapter
  }

  async initialize(): Promise<void> {
    const connection = await this.metadataStore.getConnection()
    if (connection && this.targetAdapter.kind === connection.kind) {
      await this.scanConnectedTarget().catch(() => undefined)
    }
    await this.emitStatus()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    void this.getStatus().then((status) => listener(status))

    return () => {
      this.listeners.delete(listener)
    }
  }

  async getStatus(): Promise<StorageStatus> {
    const connection = await this.metadataStore.getConnection()
    const status = await this.metadataStore.getStorageStatus()
    const conflicts = await this.metadataStore.listConflicts()
    const mode: StorageMode = connection
      ? connection.kind === 'filesystem'
        ? 'filesystem-connected'
        : 'cloud-connected'
      : 'local-only'

    return {
      mode,
      activeConnection: connection,
      lastSuccessfulSaveAt: status.lastSuccessfulSaveAt,
      lastSuccessfulSaveTarget: status.lastSuccessfulSaveTarget,
      conflicts,
      pendingImportReport: null,
    }
  }

  async connectTarget(): Promise<StorageStatus> {
    const connection = await this.targetAdapter.connect()
    await this.metadataStore.setConnection(connection)
    await this.scanConnectedTarget()
    return this.emitStatus()
  }

  async disconnectTarget(): Promise<StorageStatus> {
    const connection = await this.metadataStore.getConnection()
    if (connection && this.targetAdapter.disconnect) {
      await this.targetAdapter.disconnect(connection)
    }
    await Promise.all([
      this.metadataStore.setConnection(null),
      this.metadataStore.clearAllConflicts(),
    ])
    return this.emitStatus()
  }

  async scanConnectedTarget(): Promise<StorageStatus> {
    const connection = await this.metadataStore.getConnection()
    if (!connection || connection.kind !== this.targetAdapter.kind) {
      return this.emitStatus()
    }

    const snapshot = await this.targetAdapter.scan(connection)
    const [localDocuments, localConversations, shadows] = await Promise.all([
      this.documentAdapter.listDocuments(),
      this.conversationAdapter.listSessions(undefined, { includeArchived: true }),
      this.metadataStore.listShadows(),
    ])

    const localDocumentMap = await indexByHash(localDocuments, (document) => document.id)
    const localConversationMap = await indexByHash(
      localConversations,
      (session) => `${session.documentId}:${session.sessionId}`,
    )
    const targetDocumentMap = await indexByHash(snapshot.documents, (document) => document.id)
    const targetConversationMap = await indexByHash(
      snapshot.conversations,
      (session) => `${session.documentId}:${session.sessionId}`,
    )
    const shadowMap = new Map(shadows.map((shadow) => [shadow.resourceId, shadow]))
    const resourceIds = new Set<string>([
      ...localDocumentMap.keys(),
      ...localConversationMap.keys(),
      ...targetDocumentMap.keys(),
      ...targetConversationMap.keys(),
    ])

    await this.metadataStore.clearAllConflicts()
    let shouldRepairIndex = false

    for (const resourceId of resourceIds) {
      const localDocument = localDocumentMap.get(resourceId)
      const targetDocument = targetDocumentMap.get(resourceId)
      const localConversation = localConversationMap.get(resourceId)
      const targetConversation = targetConversationMap.get(resourceId)
      const resourceType = localDocument || targetDocument ? 'document' : 'conversation'
      const shadow = shadowMap.get(resourceId)
      const localHash = localDocument?.hash ?? localConversation?.hash ?? null
      const targetHash = targetDocument?.hash ?? targetConversation?.hash ?? null
      const localUpdatedAt =
        localDocument?.value.updatedAt ?? localConversation?.value.updatedAt ?? null
      const targetUpdatedAt =
        targetDocument?.value.updatedAt ?? targetConversation?.value.updatedAt ?? null
      const documentId =
        localDocument?.value.id ??
        targetDocument?.value.id ??
        localConversation?.value.documentId ??
        targetConversation?.value.documentId ??
        'unknown-document'
      const sessionId =
        localConversation?.value.sessionId ?? targetConversation?.value.sessionId ?? null

      if (localHash && targetHash && localHash === targetHash) {
        await this.metadataStore.saveShadow(
          buildShadowState(resourceType, documentId, sessionId, localHash, localUpdatedAt, 'pull'),
        )
        continue
      }

      if (!localHash && targetHash) {
        if (targetDocument) {
          await this.documentAdapter.saveDocument(targetDocument.value)
          shouldRepairIndex = true
        } else if (targetConversation) {
          await this.conversationAdapter.saveSession(targetConversation.value)
        }

        await this.metadataStore.saveShadow(
          buildShadowState(resourceType, documentId, sessionId, targetHash, targetUpdatedAt, 'pull'),
        )
        continue
      }

      if (localHash && !targetHash) {
        if (shadow?.lastSyncedHash && shadow.lastSyncedHash !== localHash) {
          const conflict = createSyncConflict({
            resourceType,
            documentId,
            sessionId,
            localUpdatedAt,
            targetUpdatedAt,
            localHash,
            targetHash,
            localDocument: localDocument?.value,
            localConversation: localConversation?.value,
          })
          await this.metadataStore.saveConflict(conflict)
          continue
        }

        if (localDocument) {
          await this.targetAdapter.writeDocument(connection, localDocument.value)
        } else if (localConversation) {
          await this.targetAdapter.writeConversation(connection, localConversation.value)
        }

        await this.metadataStore.saveShadow(
          buildShadowState(resourceType, documentId, sessionId, localHash, localUpdatedAt, 'push'),
        )
        await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
        continue
      }

      if (!shadow?.lastSyncedHash) {
        const conflict = createSyncConflict({
          resourceType,
          documentId,
          sessionId,
          localUpdatedAt,
          targetUpdatedAt,
          localHash,
          targetHash,
          localDocument: localDocument?.value,
          targetDocument: targetDocument?.value,
          localConversation: localConversation?.value,
          targetConversation: targetConversation?.value,
        })
        await this.metadataStore.saveConflict(conflict)
        continue
      }

      if (localHash === shadow.lastSyncedHash && targetHash) {
        if (targetDocument) {
          await this.documentAdapter.saveDocument(targetDocument.value)
          shouldRepairIndex = true
        } else if (targetConversation) {
          await this.conversationAdapter.saveSession(targetConversation.value)
        }

        await this.metadataStore.saveShadow(
          buildShadowState(resourceType, documentId, sessionId, targetHash, targetUpdatedAt, 'pull'),
        )
        continue
      }

      if (targetHash === shadow.lastSyncedHash && localHash) {
        if (localDocument) {
          await this.targetAdapter.writeDocument(connection, localDocument.value)
        } else if (localConversation) {
          await this.targetAdapter.writeConversation(connection, localConversation.value)
        }

        await this.metadataStore.saveShadow(
          buildShadowState(resourceType, documentId, sessionId, localHash, localUpdatedAt, 'push'),
        )
        await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
        continue
      }

      const conflict = createSyncConflict({
        resourceType,
        documentId,
        sessionId,
        localUpdatedAt,
        targetUpdatedAt,
        localHash,
        targetHash,
        localDocument: localDocument?.value,
        targetDocument: targetDocument?.value,
        localConversation: localConversation?.value,
        targetConversation: targetConversation?.value,
      })
      await this.metadataStore.saveConflict(conflict)
    }

    if (shouldRepairIndex) {
      await this.rebuildLocalIndex()
    }

    return this.emitStatus()
  }

  async notifyDocumentSaved(document: MindMapDocument): Promise<void> {
    const connection = await this.metadataStore.getConnection()
    if (!connection) {
      return
    }

    const resourceId = document.id
    const existingConflict = (await this.metadataStore.listConflicts()).find(
      (conflict) => conflict.resourceId === resourceId,
    )
    if (existingConflict) {
      return
    }

    await this.queue.enqueue(`document:${document.id}`, async () => {
      await this.targetAdapter.writeDocument(connection, document)
      const hash = await computeContentHash(document)
      await this.metadataStore.saveShadow(
        buildShadowState('document', document.id, null, hash, document.updatedAt, 'push'),
      )
      await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
      await this.emitStatus()
    })
  }

  async notifyConversationSaved(session: AiConversation): Promise<void> {
    const connection = await this.metadataStore.getConnection()
    if (!connection) {
      return
    }

    const resourceId = `${session.documentId}:${session.sessionId}`
    const existingConflict = (await this.metadataStore.listConflicts()).find(
      (conflict) => conflict.resourceId === resourceId,
    )
    if (existingConflict) {
      return
    }

    await this.queue.enqueue(`conversation:${resourceId}`, async () => {
      await this.targetAdapter.writeConversation(connection, session)
      const hash = await computeContentHash(session)
      await this.metadataStore.saveShadow(
        buildShadowState('conversation', session.documentId, session.sessionId, hash, session.updatedAt, 'push'),
      )
      await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
      await this.emitStatus()
    })
  }

  async notifyDocumentDeleted(documentId: string): Promise<void> {
    const connection = await this.metadataStore.getConnection()
    if (!connection) {
      return
    }

    await this.queue.enqueue(`document:${documentId}`, async () => {
      await this.targetAdapter.deleteDocument(connection, documentId)
      await this.metadataStore.deleteShadow(documentId)
      await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
      await this.emitStatus()
    })
  }

  async notifyConversationDeleted(documentId: string, sessionId: string): Promise<void> {
    const connection = await this.metadataStore.getConnection()
    if (!connection) {
      return
    }

    const resourceId = `${documentId}:${sessionId}`
    await this.queue.enqueue(`conversation:${resourceId}`, async () => {
      await this.targetAdapter.deleteConversation(connection, documentId, sessionId)
      await this.metadataStore.deleteShadow(resourceId)
      await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
      await this.emitStatus()
    })
  }

  async resolveConflict(conflictId: string, resolution: SyncResolution): Promise<StorageStatus> {
    const conflicts = await this.metadataStore.listConflicts()
    const conflict = conflicts.find((entry) => entry.id === conflictId)
    const connection = await this.metadataStore.getConnection()

    if (!conflict || !connection) {
      return this.emitStatus()
    }

    if (resolution === 'keep-target') {
      if (conflict.targetDocument) {
        await this.documentAdapter.saveDocument(conflict.targetDocument)
        await this.rebuildLocalIndex()
      } else if (conflict.targetConversation) {
        await this.conversationAdapter.saveSession(conflict.targetConversation)
      }

      await this.metadataStore.saveShadow(
        buildShadowState(
          conflict.resourceType,
          conflict.documentId,
          conflict.sessionId,
          conflict.targetHash,
          conflict.targetUpdatedAt,
          'pull',
        ),
      )
    } else if (resolution === 'save-as-copy') {
      if (conflict.resourceType === 'document' && conflict.localDocument && conflict.targetDocument) {
        await this.targetAdapter.writeDocument(connection, conflict.localDocument)
        const duplicateId = createMindMapDocument().id
        const duplicateDocument: MindMapDocument = {
          ...structuredClone(conflict.targetDocument),
          id: duplicateId,
          title: `${conflict.targetDocument.title}（来自同步副本）`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        await this.documentAdapter.saveDocument(duplicateDocument)
        await this.targetAdapter.writeDocument(connection, duplicateDocument)
        await this.metadataStore.saveShadow(
          buildShadowState('document', duplicateId, null, await computeContentHash(duplicateDocument), duplicateDocument.updatedAt, 'push'),
        )
        await this.rebuildLocalIndex()
      } else if (
        conflict.resourceType === 'conversation' &&
        conflict.localConversation &&
        conflict.targetConversation
      ) {
        await this.targetAdapter.writeConversation(connection, conflict.localConversation)
        const duplicateConversation: AiConversation = {
          ...structuredClone(conflict.targetConversation),
          sessionId: createSessionId(),
          title: `${conflict.targetConversation.title}（同步副本）`,
          updatedAt: Date.now(),
        }
        await this.conversationAdapter.saveSession(duplicateConversation)
        await this.targetAdapter.writeConversation(connection, duplicateConversation)
        await this.metadataStore.saveShadow(
          buildShadowState(
            'conversation',
            duplicateConversation.documentId,
            duplicateConversation.sessionId,
            await computeContentHash(duplicateConversation),
            duplicateConversation.updatedAt,
            'push',
          ),
        )
      }

      await this.metadataStore.saveShadow(
        buildShadowState(
          conflict.resourceType,
          conflict.documentId,
          conflict.sessionId,
          conflict.localHash,
          conflict.localUpdatedAt,
          'push',
        ),
      )
    } else {
      if (conflict.localDocument) {
        await this.targetAdapter.writeDocument(connection, conflict.localDocument)
      } else if (conflict.localConversation) {
        await this.targetAdapter.writeConversation(connection, conflict.localConversation)
      }

      await this.metadataStore.saveShadow(
        buildShadowState(
          conflict.resourceType,
          conflict.documentId,
          conflict.sessionId,
          conflict.localHash,
          conflict.localUpdatedAt,
          'push',
        ),
      )
    }

    await this.metadataStore.deleteConflict(conflict.id)
    await this.metadataStore.setLastSuccessfulSave(connection.label, Date.now())
    return this.emitStatus()
  }

  private async rebuildLocalIndex(): Promise<void> {
    const documents = await this.documentAdapter.listDocuments()
    const summaries = await this.localIndexAdapter.rebuildFromDocuments(documents)
    const recentId = await this.localIndexAdapter.getRecentDocumentId()
    if (recentId && summaries.some((summary) => summary.id === recentId)) {
      return
    }
    await this.localIndexAdapter.setRecentDocumentId(buildDocumentSummaryFallback(documents))
  }

  private async emitStatus(): Promise<StorageStatus> {
    const status = await this.getStatus()
    this.listeners.forEach((listener) => listener(status))
    return status
  }
}
