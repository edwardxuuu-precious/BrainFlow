import JSZip from 'jszip'
import type { AiConversation } from '../../../../shared/ai-contract'
import type {
  LocalStorageAdminStatus,
  StorageAdminServerStatusResponse,
} from '../../../../shared/storage-admin-contract'
import type { SyncConflictResolution } from '../../../../shared/sync-contract'
import { buildDerivedDocumentTitle, generateUniqueTitle } from '../../documents/document-title'
import type { MindMapDocument } from '../../documents/types'
import { storageAdminApiClient } from '../cloud/storage-admin-api'
import { computeContentHash } from '../core/content-hash'
import { cloudSyncOrchestrator } from '../sync/cloud-sync-orchestrator'
import { DocumentRepository } from './document-repository'
import { ConversationRepository } from './conversation-repository'
import { summarizeDocument } from '../adapters/indexeddb/local-index-adapter'
import { cloudSyncIdb } from '../local/cloud-sync-idb'
import { readLegacyWorkspaceSnapshotSummary } from '../local/legacy-reader'

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
const DEVICE_ID_KEY = 'brainflow-device-id'
const WORKSPACE_ID_KEY = 'brainflow-cloud-workspace-id'
const LEGACY_MIGRATION_COMPLETED_KEY = 'brainflow-legacy-migration-completed-v1'

function readJsonStorage<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(key, JSON.stringify(value))
}

function readBooleanStorage(key: string): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return localStorage.getItem(key) === 'true'
}

function createFallbackAdminServerStatus(message: string | null = null): StorageAdminServerStatusResponse {
  const checkedAt = Date.now()
  return {
    mode: 'local_postgres',
    checkedAt,
    api: {
      reachable: false,
      checkedAt,
    },
    database: {
      driver: 'postgres',
      configured: false,
      reachable: false,
      label: null,
      lastError: message,
      backupFormat: 'custom',
      lastBackupAt: null,
    },
    backup: {
      available: false,
      directory: null,
      lastError: null,
    },
    auth: {
      mode: 'stub',
      authenticated: true,
      username: null,
    },
    workspace: {
      id: null,
      name: null,
    },
    workspaces: [],
    runtime: {
      canonicalOrigin: null,
    },
  }
}

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
  private adminServerStatus: StorageAdminServerStatusResponse | null = null
  private legacySummaryPromise: Promise<Awaited<ReturnType<typeof readLegacyWorkspaceSnapshotSummary>>> | null = null

  constructor() {
    this.documentRepository = new DocumentRepository()
    this.conversationRepository = new ConversationRepository()
  }

  async initialize(): Promise<void> {
    await cloudSyncOrchestrator.initialize()
    // 启动时自动修复重复标题（静默执行，不阻塞初始化）
    void this.repairDuplicateTitlesOnStartup()
  }

  private async repairDuplicateTitlesOnStartup(): Promise<void> {
    try {
      const repairedCount = await this.documentRepository.repairDuplicateTitles()
      if (repairedCount > 0) {
        console.info(`[WorkspaceStorage] 已自动修复 ${repairedCount} 个重复标题`)
      }
    } catch (error) {
      // 修复失败不应影响应用正常运行
      console.error('[WorkspaceStorage] 修复重复标题失败:', error)
    }
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

  async migrateLegacyDataToPrimaryStorage(workspaceName?: string): Promise<LocalStorageAdminStatus> {
    await cloudSyncOrchestrator.migrateLegacyToCloud(workspaceName)
    return this.getAdminStatus()
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

  async downloadDatabaseBackup(): Promise<void> {
    const { blob, meta } = await storageAdminApiClient.downloadDatabaseBackup()
    downloadBlob(blob, meta.fileName)
  }

  async createWorkspace(name: string): Promise<LocalStorageAdminStatus> {
    await storageAdminApiClient.createWorkspace({ name: name.trim() })
    return this.refreshAdminStatus()
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<LocalStorageAdminStatus> {
    const response = await storageAdminApiClient.renameWorkspace(workspaceId, { name: name.trim() })
    const currentWorkspaceId = readJsonStorage<string>(WORKSPACE_ID_KEY)

    if (currentWorkspaceId === workspaceId) {
      writeJsonStorage(WORKSPACE_ID_KEY, workspaceId)
      await cloudSyncOrchestrator.updateCurrentWorkspaceSummary(workspaceId, {
        name: response.workspace.name,
      })
    }

    return this.refreshAdminStatus()
  }

  async switchWorkspace(workspaceId: string): Promise<LocalStorageAdminStatus> {
    await cloudSyncOrchestrator.switchWorkspace(workspaceId)
    this.pendingImportReport = null

    const [status] = await Promise.all([
      this.adminServerStatus ? this.getAdminStatus() : this.refreshAdminStatus(),
      this.documentRepository.rebuildLocalIndex(),
    ])
    return status
  }

  async deleteWorkspace(workspaceId: string): Promise<LocalStorageAdminStatus> {
    await storageAdminApiClient.deleteWorkspace(workspaceId)
    return this.refreshAdminStatus()
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

    const existingDocuments = await this.documentRepository.listAllDocuments()
    const existingDocumentIds = new Set(existingDocuments.map((document) => document.id))
    const existingTitles = existingDocuments.map((document) => document.title)
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

          // 生成唯一的副本标题
          const copyBaseTitle = buildDerivedDocumentTitle(document.title, '（导入副本）')
          const uniqueTitle = generateUniqueTitle(copyBaseTitle, existingTitles)
          existingTitles.push(uniqueTitle)

          await this.documentRepository.saveDocument({
            ...structuredClone(document),
            id: copyId,
            title: uniqueTitle,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        } else {
          // 即使是新文档，也要确保标题唯一
          const uniqueTitle = generateUniqueTitle(document.title, existingTitles)
          existingTitles.push(uniqueTitle)
          
          await this.documentRepository.saveDocument({
            ...document,
            title: uniqueTitle,
          })
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

  async discardLocalConflicts(conflictIds: string[]): Promise<WorkspaceStorageStatus> {
    await cloudSyncOrchestrator.discardLocalConflicts(conflictIds)
    await this.documentRepository.rebuildLocalIndex()
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

  async getAdminStatus(): Promise<LocalStorageAdminStatus> {
    const serverStatus = this.adminServerStatus ?? createFallbackAdminServerStatus()
    return this.buildAdminStatus(serverStatus)
  }

  async refreshAdminStatus(): Promise<LocalStorageAdminStatus> {
    try {
      this.adminServerStatus = await storageAdminApiClient.getStatus()
    } catch (error) {
      this.adminServerStatus = createFallbackAdminServerStatus(
        error instanceof Error ? error.message : '无法获取本机存储状态。',
      )
    }

    return this.buildAdminStatus(this.adminServerStatus)
  }

  private getLegacySnapshotSummary() {
    if (!this.legacySummaryPromise) {
      this.legacySummaryPromise = readLegacyWorkspaceSnapshotSummary()
    }

    return this.legacySummaryPromise
  }

  private async buildAdminStatus(
    serverStatus: StorageAdminServerStatusResponse,
  ): Promise<LocalStorageAdminStatus> {
    const syncStatus = cloudSyncOrchestrator.getStatus()
    const browserWorkspaceId = readJsonStorage<string>(WORKSPACE_ID_KEY)
    const [pendingOps, legacySummary] = await Promise.all([
      cloudSyncIdb.listPendingOps(),
      this.getLegacySnapshotSummary(),
    ])
    const legacyMigrationCompleted = readBooleanStorage(LEGACY_MIGRATION_COMPLETED_KEY)
    const currentWorkspace =
      (browserWorkspaceId
        ? serverStatus.workspaces.find((workspace) => workspace.id === browserWorkspaceId) ?? null
        : null) ??
      (serverStatus.workspace.id
        ? serverStatus.workspaces.find((workspace) => workspace.id === serverStatus.workspace.id) ?? null
        : null)

    return {
      ...serverStatus,
      workspace: currentWorkspace
        ? {
            id: currentWorkspace.id,
            name: currentWorkspace.name,
          }
        : serverStatus.workspace,
      browserCacheSummary: {
        indexedDbAvailable: typeof indexedDB !== 'undefined',
        deviceId: readJsonStorage<string>(DEVICE_ID_KEY),
        workspaceId: browserWorkspaceId,
        pendingOpCount: pendingOps.length,
        lastLocalWriteAt: syncStatus.localSavedAt,
        lastCloudSyncAt: syncStatus.cloudSyncedAt,
        isOnline: syncStatus.isOnline,
        isSyncing: syncStatus.isSyncing,
        lastSyncError: syncStatus.state?.lastError ?? null,
        conflictCount: syncStatus.conflicts.length,
        legacyMigrationCompleted,
      },
      diagnostics: {
        currentOrigin: typeof window === 'undefined' ? null : window.location.origin,
        canonicalOrigin: serverStatus.runtime.canonicalOrigin,
        legacyMigrationAvailable: !legacyMigrationCompleted && legacySummary.hasLegacyData,
        legacyDocumentCount: legacySummary.documentCount,
        legacyConversationCount: legacySummary.conversationCount,
      },
    }
  }
}

export const workspaceStorageService = new WorkspaceStorageService()
