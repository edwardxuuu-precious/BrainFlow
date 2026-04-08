import type {
  PendingSyncOp,
  SyncConflictAnalysisConfidence,
  SyncConflictAnalysisSource,
  SyncConflictRecord,
  SyncEnvelope,
  SyncStatus,
  SyncWorkspaceSummary,
} from '../../../../shared/sync-contract'
import type { AiConversation } from '../../../../shared/ai-contract'
import type {
  MindMapDocument,
  MindMapDocumentContent,
  MindMapViewport,
  MindMapWorkspaceState,
} from '../../documents/types'
import { normalizeDocument } from '../adapters/indexeddb/legacy-document-local-service'

export interface DeviceDocumentState {
  documentId: string
  viewport: MindMapViewport
  workspace: MindMapWorkspaceState
  updatedAt: number
}

export interface DeviceInfoRecord {
  deviceId: string
  deviceLabel: string
  platform: string
  lastSeenAt: number
  documents: Record<string, DeviceDocumentState>
}

export interface SyncStateRecord {
  workspaceId: string
  lastPulledCursor: number
  lastPullAt: number | null
  lastPushAt: number | null
  isSyncing: boolean
  lastError: string | null
  hasConflicts: boolean
  bootstrapCompletedAt: number | null
}

export type SyncedDocumentRecord = SyncEnvelope<MindMapDocumentContent>
export type SyncedConversationRecord = SyncEnvelope<AiConversation>
export type DocumentPendingOp = PendingSyncOp<MindMapDocumentContent>
export type ConversationPendingOp = PendingSyncOp<AiConversation>
export type StoragePendingOp = DocumentPendingOp | ConversationPendingOp
export type StorageConflictRecord =
  | SyncConflictRecord<MindMapDocumentContent>
  | SyncConflictRecord<AiConversation>

export interface CloudSyncStatus {
  workspace: SyncWorkspaceSummary | null
  state: SyncStateRecord | null
  localSavedAt: number | null
  cloudSyncedAt: number | null
  isOnline: boolean
  isSyncing: boolean
  conflicts: StorageConflictRecord[]
}

interface ConflictAnalysisFields<TPayload> {
  analysisStatus: SyncConflictRecord<TPayload>['analysisStatus']
  analysisSource: SyncConflictAnalysisSource | null
  recommendedResolution: SyncConflictRecord<TPayload>['recommendedResolution']
  confidence: SyncConflictAnalysisConfidence | null
  summary: string | null
  reasons: string[]
  actionableResolutions: SyncConflictRecord<TPayload>['actionableResolutions']
  mergedPayload?: TPayload | null
  analyzedAt: number | null
  analysisNote?: string | null
}

export function createPendingConflictAnalysis<TPayload>(): ConflictAnalysisFields<TPayload> {
  return {
    analysisStatus: 'pending',
    analysisSource: null,
    recommendedResolution: null,
    confidence: null,
    summary: null,
    reasons: [],
    actionableResolutions: [],
    mergedPayload: null,
    analyzedAt: null,
    analysisNote: null,
  }
}

export function normalizeStorageConflictRecord<TPayload>(
  conflict: SyncConflictRecord<TPayload>,
): SyncConflictRecord<TPayload> {
  const pending = createPendingConflictAnalysis<TPayload>()
  return {
    ...pending,
    ...conflict,
    analysisStatus: conflict.analysisStatus ?? pending.analysisStatus,
    analysisSource: conflict.analysisSource ?? pending.analysisSource,
    recommendedResolution: conflict.recommendedResolution ?? pending.recommendedResolution,
    confidence: conflict.confidence ?? pending.confidence,
    summary: conflict.summary ?? pending.summary,
    reasons: Array.isArray(conflict.reasons) ? conflict.reasons : pending.reasons,
    actionableResolutions: Array.isArray(conflict.actionableResolutions)
      ? conflict.actionableResolutions
      : pending.actionableResolutions,
    mergedPayload:
      'mergedPayload' in conflict
        ? (conflict.mergedPayload ?? pending.mergedPayload)
        : pending.mergedPayload,
    analyzedAt: conflict.analyzedAt ?? pending.analyzedAt,
    analysisNote: conflict.analysisNote ?? pending.analysisNote,
  }
}

export function normalizeConversationId(conversation: AiConversation): string {
  return conversation.id ?? conversation.sessionId
}

export function toDocumentContent(document: MindMapDocument): MindMapDocumentContent {
  const normalized = normalizeDocument(document)
  const { viewport: _viewport, workspace: _workspace, ...content } = normalized
  return content
}

export function toDeviceDocumentState(document: MindMapDocument): DeviceDocumentState {
  const normalized = normalizeDocument(document)
  return {
    documentId: normalized.id,
    viewport: normalized.viewport,
    workspace: normalized.workspace,
    updatedAt: Date.now(),
  }
}

export function mergeDocumentWithDeviceState(
  content: MindMapDocumentContent,
  state: DeviceDocumentState | null,
): MindMapDocument {
  return normalizeDocument({
    ...content,
    viewport: state?.viewport ?? { x: 0, y: 0, zoom: 1 },
    workspace: state?.workspace ?? {
      selectedTopicId: content.rootTopicId,
      chrome: {
        leftSidebarOpen: true,
        rightSidebarOpen: true,
      },
      hierarchyCollapsedTopicIds: [],
      activeImportBundleId: null,
      activeKnowledgeViewId: null,
    },
  })
}

export function getSyncStatusTone(status: SyncStatus): 'accent' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'synced':
      return 'success'
    case 'local_saved_pending_sync':
    case 'syncing_push':
    case 'syncing_pull':
      return 'accent'
    case 'conflict':
      return 'warning'
    case 'sync_error':
    default:
      return 'danger'
  }
}
