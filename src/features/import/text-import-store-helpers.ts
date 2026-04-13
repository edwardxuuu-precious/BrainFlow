import type {
  AiRunStage,
  CodexApiError,
  TextImportArchetype,
  TextImportCrossFileMergeSuggestion,
  TextImportPreprocessHint,
  TextImportPreviewNode,
  TextImportPreset,
  TextImportProgressAttempt,
  TextImportProgressEntry,
  TextImportProgressTone,
  TextImportResponse,
  TextImportRunStage,
  TextImportSourceType,
  TextImportTraceEntry,
} from '../../../shared/ai-contract'
import {
  formatTextImportClassificationConfidence,
  type TextImportSourcePlanningSummary,
} from '../../../shared/text-import-semantics'
import type { CodexRequestFailureKind } from '../ai/ai-client'
import type { MindMapDocument } from '../documents/types'
import { buildAiContext } from '../ai/ai-context'
import {
  buildTextImportDiagnostics,
  createEmptyTextImportTimings,
} from './text-import-diagnostics'
import {
  buildTextImportDraftTree,
} from './text-import-preview-edit'
import { buildTextImportPreviewTree } from './text-import-preview-tree'
import type {
  TextImportJobEvent,
  TextImportJobMode,
  TextImportJobType,
} from './text-import-job'
import type { SemanticMergeStage } from './local-text-import-core'

export interface ImportSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

export interface ApplyTextImportResult {
  document: MindMapDocument
  selectedTopicId: string | null
  summary: string
  warnings: string[]
}

export interface TextImportSourceFileState {
  sourceName: string
  sourceType: TextImportSourceType
  textLength: number
}

export interface CachedTextImportSource {
  sourceName: string
  sourceType: TextImportSourceType
  rawText: string
}

export type TextImportAnchorMode = 'document_root' | 'current_selection'

export interface TextImportErrorState {
  message: string
  rawMessage?: string
  code?: CodexApiError['code']
  kind?: CodexRequestFailureKind
  status?: number
  stage?: AiRunStage
  requestId?: string
}

export interface TextImportState {
  isOpen: boolean
  sourceName: string | null
  sourceType: TextImportSourceType | null
  sourceFiles: TextImportSourceFileState[]
  rawText: string
  draftSourceName: string
  draftText: string
  preprocessedHints: TextImportPreprocessHint[]
  preview: TextImportResponse | null
  draftTree: TextImportPreviewNode[]
  previewTree: TextImportPreviewNode[]
  draftConfirmed: boolean
  planningSummaries: TextImportSourcePlanningSummary[]
  crossFileMergeSuggestions: TextImportCrossFileMergeSuggestion[]
  approvedConflictIds: string[]
  runStage: AiRunStage
  semanticMergeStage: SemanticMergeStage
  statusText: string
  progress: number
  progressIndeterminate: boolean
  progressEntries: TextImportProgressEntry[]
  traceEntries: TextImportTraceEntry[]
  modeHint: string | null
  error: TextImportErrorState | null
  isPreviewing: boolean
  isApplying: boolean
  previewStartedAt: number | null
  previewFinishedAt: number | null
  activeJobId: string | null
  activeJobMode: TextImportJobMode | null
  activeJobType: TextImportJobType | null
  semanticCandidateCount: number
  semanticAdjudicatedCount: number
  semanticFallbackCount: number
  fileCount: number
  completedFileCount: number
  currentFileName: string | null
  applyProgress: number
  appliedCount: number
  totalOperations: number
  currentApplyLabel: string | null
  presetOverride: TextImportPreset | null
  archetypeOverride: TextImportArchetype | null
  anchorMode: TextImportAnchorMode
  cachedSources: CachedTextImportSource[]
  open: () => void
  close: () => void
  resetSession: () => void
  setPresetOverride: (value: TextImportPreset | null) => void
  setArchetypeOverride: (value: TextImportArchetype | null) => void
  setAnchorMode: (value: TextImportAnchorMode) => void
  setDraftSourceName: (value: string) => void
  setDraftText: (value: string) => void
  previewFile: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    file: File,
  ) => Promise<void>
  previewFiles: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    files: File[],
  ) => Promise<void>
  previewText: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    options?: { sourceName?: string; sourceType?: TextImportSourceType; rawText?: string },
  ) => Promise<void>
  rerunPreviewWithPreset: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    preset: TextImportPreset | null,
  ) => Promise<void>
  rerunPreviewWithArchetype: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    archetype: TextImportArchetype | null,
  ) => Promise<void>
  toggleConflictApproval: (conflictId: string) => void
  confirmDraft: () => void
  renamePreviewNode: (nodeId: string, title: string) => void
  promotePreviewNode: (nodeId: string) => void
  demotePreviewNode: (nodeId: string) => void
  deletePreviewNode: (nodeId: string) => void
  applyPreview: (document: MindMapDocument) => Promise<ApplyTextImportResult | null>
}

export const INITIAL_STATE = {
  isOpen: false,
  sourceName: null,
  sourceType: null as TextImportSourceType | null,
  sourceFiles: [] as TextImportSourceFileState[],
  rawText: '',
  draftSourceName: 'Pasted text',
  draftText: '',
  preprocessedHints: [] as TextImportPreprocessHint[],
  preview: null as TextImportResponse | null,
  draftTree: [] as TextImportPreviewNode[],
  previewTree: [] as TextImportPreviewNode[],
  draftConfirmed: false,
  planningSummaries: [] as TextImportSourcePlanningSummary[],
  crossFileMergeSuggestions: [] as TextImportCrossFileMergeSuggestion[],
  approvedConflictIds: [] as string[],
  runStage: 'idle' as AiRunStage,
  semanticMergeStage: 'idle' as SemanticMergeStage,
  statusText: '',
  progress: 0,
  progressIndeterminate: false,
  progressEntries: [] as TextImportProgressEntry[],
  traceEntries: [] as TextImportTraceEntry[],
  modeHint: null as string | null,
  error: null as TextImportErrorState | null,
  isPreviewing: false,
  isApplying: false,
  previewStartedAt: null as number | null,
  previewFinishedAt: null as number | null,
  activeJobId: null as string | null,
  activeJobMode: null as TextImportJobMode | null,
  activeJobType: null as TextImportJobType | null,
  semanticCandidateCount: 0,
  semanticAdjudicatedCount: 0,
  semanticFallbackCount: 0,
  fileCount: 0,
  completedFileCount: 0,
  currentFileName: null as string | null,
  applyProgress: 0,
  appliedCount: 0,
  totalOperations: 0,
  currentApplyLabel: null as string | null,
  presetOverride: null as TextImportPreset | null,
  archetypeOverride: null as TextImportArchetype | null,
  anchorMode: 'document_root' as TextImportAnchorMode,
  cachedSources: [] as CachedTextImportSource[],
}

export function createResetSessionState(): Partial<TextImportState> {
  return {
    sourceName: INITIAL_STATE.sourceName,
    sourceType: INITIAL_STATE.sourceType,
    sourceFiles: [],
    rawText: INITIAL_STATE.rawText,
    draftSourceName: INITIAL_STATE.draftSourceName,
    draftText: INITIAL_STATE.draftText,
    preprocessedHints: [],
    preview: INITIAL_STATE.preview,
    draftTree: [],
    previewTree: [],
    draftConfirmed: INITIAL_STATE.draftConfirmed,
    planningSummaries: [],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    runStage: INITIAL_STATE.runStage,
    semanticMergeStage: INITIAL_STATE.semanticMergeStage,
    statusText: INITIAL_STATE.statusText,
    progress: INITIAL_STATE.progress,
    progressIndeterminate: INITIAL_STATE.progressIndeterminate,
    progressEntries: [],
    traceEntries: [],
    modeHint: INITIAL_STATE.modeHint,
    error: INITIAL_STATE.error,
    isPreviewing: INITIAL_STATE.isPreviewing,
    isApplying: INITIAL_STATE.isApplying,
    previewStartedAt: INITIAL_STATE.previewStartedAt,
    previewFinishedAt: INITIAL_STATE.previewFinishedAt,
    activeJobId: INITIAL_STATE.activeJobId,
    activeJobMode: INITIAL_STATE.activeJobMode,
    activeJobType: INITIAL_STATE.activeJobType,
    semanticCandidateCount: INITIAL_STATE.semanticCandidateCount,
    semanticAdjudicatedCount: INITIAL_STATE.semanticAdjudicatedCount,
    semanticFallbackCount: INITIAL_STATE.semanticFallbackCount,
    fileCount: INITIAL_STATE.fileCount,
    completedFileCount: INITIAL_STATE.completedFileCount,
    currentFileName: INITIAL_STATE.currentFileName,
    applyProgress: INITIAL_STATE.applyProgress,
    appliedCount: INITIAL_STATE.appliedCount,
    totalOperations: INITIAL_STATE.totalOperations,
    currentApplyLabel: INITIAL_STATE.currentApplyLabel,
    presetOverride: INITIAL_STATE.presetOverride,
    archetypeOverride: INITIAL_STATE.archetypeOverride,
    anchorMode: INITIAL_STATE.anchorMode,
    cachedSources: [],
  }
}

export function resolveImportAnchorTopicId(
  document: MindMapDocument,
  selection: ImportSelectionSnapshot,
  anchorMode: TextImportAnchorMode,
): string {
  if (
    anchorMode === 'current_selection' &&
    selection.activeTopicId &&
    document.topics[selection.activeTopicId]
  ) {
    return selection.activeTopicId
  }

  return document.rootTopicId
}

export function createModeHint(mode: TextImportJobMode, jobType: TextImportJobType): string {
  void mode
  if (jobType === 'batch') {
    return 'Using the skill-backed import pipeline. Each file is converted into an ordered logic map before semantic merge review.'
  }

  return 'Using the skill-backed import pipeline. The source is converted into a logic tree with evidence attachment and strict task extraction.'
}

export function createSelectionContext(
  document: MindMapDocument,
  selection: ImportSelectionSnapshot,
) {
  return buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId, {
    useFullDocument: true,
  })
}

export function createErrorState(
  message: string,
  options?: Omit<TextImportErrorState, 'message'>,
): TextImportErrorState {
  return {
    message,
    rawMessage: options?.rawMessage,
    code: options?.code,
    kind: options?.kind,
    status: options?.status,
    stage: options?.stage,
    requestId: options?.requestId,
  }
}

export function isCodexWaitingStage(stage: TextImportRunStage): boolean {
  return stage === 'waiting_codex_primary' || stage === 'waiting_codex_repair'
}

export function resolveProgressToneFromStage(stage: TextImportRunStage): TextImportProgressTone {
  if (stage === 'repairing_structure') {
    return 'warning'
  }

  if (isCodexWaitingStage(stage)) {
    return 'waiting'
  }

  return 'info'
}

export function resolveProgressAttempt(
  mode: TextImportJobMode,
  stage: TextImportRunStage,
): TextImportProgressAttempt {
  if (mode === 'local_markdown') {
    return 'local'
  }

  if (
    stage === 'repairing_structure' ||
    stage === 'starting_codex_repair' ||
    stage === 'waiting_codex_repair' ||
    stage === 'parsing_repair_result'
  ) {
    return 'repair'
  }

  return 'primary'
}

export function buildStatusProgressEntry(
  event: Extract<TextImportJobEvent, { type: 'status' }>,
): TextImportProgressEntry {
  const replaceKey = isCodexWaitingStage(event.stage) ? `progress:${event.stage}` : undefined
  return {
    id: replaceKey ?? `status_${event.stage}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestampMs: Date.now(),
    stage: event.stage,
    message: event.message,
    tone: resolveProgressToneFromStage(event.stage),
    source: 'status',
    attempt: resolveProgressAttempt(event.mode, event.stage),
    replaceKey,
    currentFileName: event.currentFileName ?? null,
    requestId: event.requestId,
  }
}

export function mergeProgressEntries(
  current: TextImportProgressEntry[],
  nextEntry: TextImportProgressEntry,
): TextImportProgressEntry[] {
  const entries = [...current]
  const replaceKey = nextEntry.replaceKey?.trim()
  const replaceIndex =
    replaceKey ? entries.findIndex((entry) => entry.replaceKey === replaceKey) : -1

  if (replaceIndex >= 0) {
    const previous = entries[replaceIndex]
    entries[replaceIndex] = {
      ...previous,
      ...nextEntry,
      id: previous.id,
      replaceKey: previous.replaceKey ?? nextEntry.replaceKey,
    }
  } else {
    const existingIndex = entries.findIndex((entry) => entry.id === nextEntry.id)
    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry
    } else {
      entries.push(nextEntry)
    }
  }

  return entries
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .slice(-12)
}

export function mergeTraceEntries(
  current: TextImportTraceEntry[],
  nextEntry: TextImportTraceEntry,
): TextImportTraceEntry[] {
  const entries = [...current]
  const replaceKey = nextEntry.replaceKey?.trim()
  const replaceIndex =
    replaceKey ? entries.findIndex((entry) => entry.replaceKey === replaceKey) : -1

  if (replaceIndex >= 0) {
    const previous = entries[replaceIndex]
    entries[replaceIndex] = {
      ...previous,
      ...nextEntry,
      id: previous.id,
      replaceKey: previous.replaceKey ?? nextEntry.replaceKey,
    }
  } else {
    const existingIndex = entries.findIndex((entry) => entry.id === nextEntry.id)
    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry
    } else {
      entries.push(nextEntry)
    }
  }

  return entries
    .sort((left, right) =>
      left.sequence === right.sequence
        ? left.timestampMs - right.timestampMs
        : left.sequence - right.sequence,
    )
    .slice(-200)
}

function confidenceRank(value: TextImportSourcePlanningSummary['confidence']): number {
  switch (value) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
    default:
      return 1
  }
}

function lowerConfidence(
  left: TextImportSourcePlanningSummary['confidence'],
  right: TextImportSourcePlanningSummary['confidence'],
): TextImportSourcePlanningSummary['confidence'] {
  return confidenceRank(left) <= confidenceRank(right) ? left : right
}

function mergePlanningSummaryWithClassification(
  summary: TextImportSourcePlanningSummary,
  classification: NonNullable<TextImportResponse['classification']>,
): TextImportSourcePlanningSummary {
  const archetypeConfidence = formatTextImportClassificationConfidence(classification.confidence)

  return {
    ...summary,
    resolvedArchetype: classification.archetype,
    confidence: summary.isManual
      ? 'high'
      : lowerConfidence(summary.presetConfidence, archetypeConfidence),
    archetypeConfidence,
    archetypeRationale: classification.rationale,
    rationale: `${summary.presetRationale} ${classification.rationale}`.trim(),
  }
}

export function mergePlanningSummariesWithPreview(
  planningSummaries: TextImportSourcePlanningSummary[],
  preview: TextImportResponse,
): TextImportSourcePlanningSummary[] {
  if (planningSummaries.length === 0) {
    return planningSummaries
  }

  if (preview.batch?.jobType === 'batch' && preview.batch.files?.length) {
    const classificationBySource = new Map(
      preview.batch.files
        .filter((file) => file.classification)
        .map((file) => [file.sourceName, file.classification] as const),
    )

    return planningSummaries.map((summary) => {
      const classification = classificationBySource.get(summary.sourceName)
      return classification ? mergePlanningSummaryWithClassification(summary, classification) : summary
    })
  }

  if (planningSummaries.length === 1 && preview.classification) {
    return [mergePlanningSummaryWithClassification(planningSummaries[0], preview.classification)]
  }

  return planningSummaries
}

export function applyImportDiagnostics(
  preview: TextImportResponse,
  options: {
    preprocessMs: number
    planningMs: number
    planningSummaries: TextImportSourcePlanningSummary[]
  },
): TextImportResponse {
  return {
    ...preview,
    diagnostics: buildTextImportDiagnostics({
      timings: {
        ...(preview.diagnostics?.timings ?? createEmptyTextImportTimings()),
        preprocessMs: options.preprocessMs,
        planningMs: options.planningMs,
        totalMs:
          options.preprocessMs +
          options.planningMs +
          (preview.diagnostics?.timings.parseTreeMs ?? 0) +
          (preview.diagnostics?.timings.batchComposeMs ?? 0) +
          (preview.diagnostics?.timings.semanticCandidateMs ?? 0) +
          (preview.diagnostics?.timings.semanticAdjudicationMs ?? 0) +
          (preview.diagnostics?.timings.previewEditMs ?? 0),
      },
      response: preview,
      artifactReuse:
        preview.diagnostics?.artifactReuse ?? {
          contentKey: 'store',
          planKey: 'store',
          reusedSemanticHints: false,
          reusedSemanticUnits: false,
          reusedPlannedStructure: false,
        },
      planningSummaries: options.planningSummaries,
      semanticAdjudication: preview.diagnostics?.semanticAdjudication,
      dirtySubtreeIds: preview.diagnostics?.dirtySubtreeIds,
      lastEditAction: preview.diagnostics?.lastEditAction ?? null,
    }),
  }
}

export function buildEditedDraftState(
  state: Pick<TextImportState, 'preview' | 'approvedConflictIds'>,
  preview: TextImportResponse,
): Partial<TextImportState> {
  return {
    preview,
    draftTree: buildTextImportDraftTree(preview),
    previewTree: buildTextImportPreviewTree(preview.previewNodes),
    draftConfirmed: false,
    crossFileMergeSuggestions: preview.crossFileMergeSuggestions ?? [],
    approvedConflictIds: state.approvedConflictIds.filter((conflictId) =>
      preview.conflicts.some((conflict) => conflict.id === conflictId),
    ),
  }
}
