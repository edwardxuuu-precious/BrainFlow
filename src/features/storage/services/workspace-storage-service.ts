import JSZip from 'jszip'
import type { AiConversation } from '../../../../shared/ai-contract'
import type { SyncConflictResolution } from '../../../../shared/sync-contract'
import type { MindMapDocument } from '../../documents/types'
import { computeContentHash } from '../core/content-hash'
import { cloudSyncOrchestrator } from '../sync/cloud-sync-orchestrator'
import { DocumentRepository } from './document-repository'
import { ConversationRepository } from './conversation-repository'
import { summarizeDocument } from '../adapters/indexeddb/local-index-adapter'

export interface ImportFailure {
  kind: 'manifest' | 'document' | 'conversation' | 'index'
  path: string
  message: string
}

export interface ImportReport {
  success: boolean
  importedDocuments: number
  importedConversations: number
  duplicatedDocuments: Array<{ oldId: string; newId: string }>
  failures: ImportFailure[]
  warnings: string[]
}

export interface WorkspaceStorageStatus {
  mode: 'cloud-connected' | 'local-only'
  workspaceName: string | null
  localSavedAt: number | null
  cloudSyncedAt: number | null
  isOnline: boolean
  isSyncing: boolean
  conflicts: Awaited<ReturnType<typeof cloudSyncOrchestrator['getStatus']>>['conflicts']
  pendingImportReport: ImportReport | null
  migrationAvailable: boolean
  lastSyncError: string | null
}

const BACKUP_SCHEMA_VERSION = 'brainflow-backup-v2'
const APP_VERSION = '0.0.0'

function buildDocumentCopyId(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function buildSessionCopyId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

async function parseJsonEntry<T>(archive: JSZip, path: string): Promise<T> {
  const file = archive.file(path)
  if (!file) {
    throw new Error(`Missing file: ${path}`)
  }

  return JSON.parse(await file.async('text')) as T
}

function buildBackupPath(kind: 'document' | 'conversation', value: MindMapDocument | AiConversation): string {
  if (kind === 'document') {
    return `documents/${(value as MindMapDocument).id}.json`
  }

  const session = value as AiConversation
  return `conversations/${session.documentId}/${session.sessionId}.json`
}

export class WorkspaceStorageService {
  readonly documentRepository: DocumentRepository
  readonly conversationRepository: ConversationRepository
  private pendingImportReport: ImportReport | null = null

  constructor() {
    this.documentRepository = new DocumentRepository()
    this.conversationRepository = new ConversationRepository()
  }

  initialize(): Promise<void> {
    return cloudSyncOrchestrator.initialize()
  }

  subscribe(listener: (status: WorkspaceStorageStatus) => void): () => void {
    let skippedInitialEmission = false
    return cloudSyncOrchestrator.subscribe((syncStatus) => {
      const nextStatus: WorkspaceStorageStatus = {
        mode: syncStatus.workspace ? 'cloud-connected' : 'local-only',
        workspaceName: syncStatus.workspace?.name ?? null,
        localSavedAt: syncStatus.localSavedAt,
        cloudSyncedAt: syncStatus.cloudSyncedAt,
        isOnline: syncStatus.isOnline,
        isSyncing: syncStatus.isSyncing,
        conflicts: syncStatus.conflicts,
        pendingImportReport: this.pendingImportReport,
        migrationAvailable: true,
        lastSyncError: syncStatus.state?.lastError ?? null,
      }

      if (!skippedInitialEmission) {
        skippedInitialEmission = true
        return
      }

      listener(nextStatus)
    })
  }

  getStatus(): WorkspaceStorageStatus {
    const syncStatus = cloudSyncOrchestrator.getStatus()
    return {
      mode: syncStatus.workspace ? 'cloud-connected' : 'local-only',
      workspaceName: syncStatus.workspace?.name ?? null,
      localSavedAt: syncStatus.localSavedAt,
      cloudSyncedAt: syncStatus.cloudSyncedAt,
      isOnline: syncStatus.isOnline,
      isSyncing: syncStatus.isSyncing,
      conflicts: syncStatus.conflicts,
      pendingImportReport: this.pendingImportReport,
      migrationAvailable: true,
      lastSyncError: syncStatus.state?.lastError ?? null,
    }
  }

  async syncNow(): Promise<WorkspaceStorageStatus> {
    await cloudSyncOrchestrator.triggerSync('manual')
    return this.getStatus()
  }

  async migrateLocalDataToCloud(workspaceName?: string): Promise<WorkspaceStorageStatus> {
    await cloudSyncOrchestrator.migrateLegacyToCloud(workspaceName)
    return this.getStatus()
  }

  async exportBackup(): Promise<Blob> {
    const createdAt = Date.now()
    const [documents, conversations] = await Promise.all([
      this.documentRepository.listAllDocuments(),
      this.conversationRepository.listAllSessions({ includeArchived: true }),
    ])

    const archive = new JSZip()
    const entries: Array<{ kind: 'index' | 'document' | 'conversation'; path: string; id: string; hash: string }> = []
    const index = documents.map((document) => summarizeDocument(document))

    const indexPath = 'documents/index.json'
    archive.file(indexPath, `${JSON.stringify(index, null, 2)}\n`)
    entries.push({
      kind: 'index',
      path: indexPath,
      id: 'document-index',
      hash: await computeContentHash(index),
    })

    for (const document of documents) {
      const path = buildBackupPath('document', document)
      archive.file(path, `${JSON.stringify(document, null, 2)}\n`)
      entries.push({
        kind: 'document',
        path,
        id: document.id,
        hash: await computeContentHash(document),
      })
    }

    for (const conversation of conversations) {
      const path = buildBackupPath('conversation', conversation)
      archive.file(path, `${JSON.stringify(conversation, null, 2)}\n`)
      entries.push({
        kind: 'conversation',
        path,
        id: `${conversation.documentId}:${conversation.sessionId}`,
        hash: await computeContentHash(conversation),
      })
    }

    archive.file(
      'manifest.json',
      `${JSON.stringify(
        {
          schemaVersion: BACKUP_SCHEMA_VERSION,
          createdAt,
          exportedAt: Date.now(),
          appVersion: APP_VERSION,
          documentCount: documents.length,
          conversationCount: conversations.length,
          entries,
        },
        null,
        2,
      )}\n`,
    )

    return archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  }

  async exportBackupToDownload(): Promise<void> {
    const blob = await this.exportBackup()
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadBlob(blob, `brainflow-backup-${stamp}.zip`)
  }

  async importBackup(file: File): Promise<ImportReport> {
    const archive = await JSZip.loadAsync(await file.arrayBuffer())
    const failures: ImportFailure[] = []
    const warnings: string[] = []

    const manifest = await parseJsonEntry<{
      schemaVersion: string
      entries: Array<{ kind: 'document' | 'conversation' | 'index'; path: string }>
    }>(archive, 'manifest.json').catch((error) => {
      const report: ImportReport = {
        success: false,
        importedDocuments: 0,
        importedConversations: 0,
        duplicatedDocuments: [],
        failures: [
          {
            kind: 'manifest',
            path: 'manifest.json',
            message: error instanceof Error ? error.message : 'Unable to read manifest.json',
          },
        ],
        warnings,
      }
      this.pendingImportReport = report
      return null
    })

    if (!manifest) {
      return this.pendingImportReport as ImportReport
    }

    if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      const report: ImportReport = {
        success: false,
        importedDocuments: 0,
        importedConversations: 0,
        duplicatedDocuments: [],
        failures: [
          {
            kind: 'manifest',
            path: 'manifest.json',
            message: `Incompatible backup schema: ${manifest.schemaVersion}`,
          },
        ],
        warnings,
      }
      this.pendingImportReport = report
      return report
    }

    const existingDocumentIds = new Set(
      (await this.documentRepository.listAllDocuments()).map((document) => document.id),
    )
    const documentIdRemap = new Map<string, string>()
    const duplicatedDocuments: Array<{ oldId: string; newId: string }> = []
    let importedDocuments = 0
    let importedConversations = 0

    for (const entry of manifest.entries.filter((item) => item.kind === 'document')) {
      try {
        const document = await parseJsonEntry<MindMapDocument>(archive, entry.path)
        if (existingDocumentIds.has(document.id)) {
          const copyId = buildDocumentCopyId()
          documentIdRemap.set(document.id, copyId)
          duplicatedDocuments.push({ oldId: document.id, newId: copyId })
          warnings.push(`Duplicate documentId ${document.id} imported as a copy.`)

          await this.documentRepository.saveDocument({
            ...structuredClone(document),
            id: copyId,
            title: `${document.title}（导入副本）`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        } else {
          await this.documentRepository.saveDocument(document)
          existingDocumentIds.add(document.id)
        }
        importedDocuments += 1
      } catch (error) {
        failures.push({
          kind: 'document',
          path: entry.path,
          message: error instanceof Error ? error.message : 'Document import failed',
        })
      }
    }

    for (const entry of manifest.entries.filter((item) => item.kind === 'conversation')) {
      try {
        const conversation = await parseJsonEntry<AiConversation>(archive, entry.path)
        const documentId = documentIdRemap.get(conversation.documentId) ?? conversation.documentId
        const documentWasCopied = documentIdRemap.has(conversation.documentId)
        const existing = await this.conversationRepository.getSession(documentId, conversation.sessionId)
        const sessionId = documentWasCopied || existing ? buildSessionCopyId() : conversation.sessionId

        await this.conversationRepository.saveSession({
          ...conversation,
          id: sessionId,
          documentId,
          sessionId,
          updatedAt: Date.now(),
        })

        importedConversations += 1
      } catch (error) {
        failures.push({
          kind: 'conversation',
          path: entry.path,
          message: error instanceof Error ? error.message : 'Conversation import failed',
        })
      }
    }

    await this.documentRepository.rebuildLocalIndex()
    this.pendingImportReport = {
      success: failures.every((failure) => failure.kind !== 'manifest'),
      importedDocuments,
      importedConversations,
      duplicatedDocuments,
      failures,
      warnings,
    }
    await cloudSyncOrchestrator.triggerSync('backup_import')
    return this.pendingImportReport
  }

  async resolveConflict(
    conflictId: string,
    resolution: SyncConflictResolution,
    mergedPayload?: unknown,
  ): Promise<WorkspaceStorageStatus> {
    await cloudSyncOrchestrator.resolveConflict(conflictId, resolution, mergedPayload)
    return this.getStatus()
  }

  clearPendingImportReport(): void {
    this.pendingImportReport = null
  }

  async connectFolder(): Promise<WorkspaceStorageStatus> {
    return this.getStatus()
  }

  async rescanFolder(): Promise<WorkspaceStorageStatus> {
    return this.getStatus()
  }

  async disconnectFolder(): Promise<WorkspaceStorageStatus> {
    return this.getStatus()
  }
}

export const workspaceStorageService = new WorkspaceStorageService()
