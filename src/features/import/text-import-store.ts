import { create } from 'zustand'
import type {
  AiRunStage,
  CodexApiError,
  TextImportCodexDiagnostic,
  TextImportCodexEvent,
  TextImportCodexExplainer,
  TextImportCrossFileMergeSuggestion,
  TextImportPreprocessHint,
  TextImportPreviewNode,
  TextImportResponse,
  TextImportRunStage,
  TextImportRunnerAttempt,
  TextImportRunnerObservationPhase,
  TextImportSourceType,
} from '../../../shared/ai-contract'
import type { CodexRequestFailureKind } from '../ai/ai-client'
import type { MindMapDocument } from '../documents/types'
import { buildAiContext } from '../ai/ai-context'
import {
  applyTextImportPreview,
  getInitialApprovedConflictIds,
} from './text-import-apply'
import {
  startTextImportBatchJob,
  startTextImportJob,
  type TextImportJobEvent,
  type TextImportJobHandle,
  type TextImportJobMode,
  type TextImportJobType,
} from './text-import-job'
import {
  sortTextImportBatchSources,
  type LocalTextImportBatchRequest,
  type SemanticMergeStage,
} from './local-text-import-core'
import { preprocessTextToImportHints } from './text-import-preprocess'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

interface ImportSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

interface ApplyTextImportResult {
  document: MindMapDocument
  selectedTopicId: string | null
  summary: string
  warnings: string[]
}

interface TextImportSourceFileState {
  sourceName: string
  sourceType: TextImportSourceType
  textLength: number
}

export interface TextImportErrorState {
  message: string
  rawMessage?: string
  code?: CodexApiError['code']
  kind?: CodexRequestFailureKind
  status?: number
  stage?: AiRunStage
  requestId?: string
}

export interface TextImportRunnerObservationState {
  attempt: TextImportRunnerAttempt
  phase: TextImportRunnerObservationPhase
  promptLength: number
  elapsedSinceSpawnMs?: number
  elapsedSinceLastEventMs?: number
  exitCode?: number
  hadJsonEvent?: boolean
  observedAt: number
  requestId?: string
}

export type TextImportCodexEventState = TextImportCodexEvent
export type TextImportCodexExplainerState = TextImportCodexExplainer
export type TextImportCodexDiagnosticState = TextImportCodexDiagnostic

export interface TextImportStatusTimelineEntry {
  id: string
  stage: TextImportRunStage
  message: string
  progress: number
  startedAt: number
  completedAt: number | null
  requestId?: string
  runnerObservations: TextImportRunnerObservationState[]
}

export type TextImportCurrentStatus =
  | {
      kind: 'status'
      stage: TextImportRunStage
      message: string
      progress: number
      at: number
      requestId?: string
    }
  | ({
      kind: 'runner_observation'
      at: number
    } & Omit<TextImportRunnerObservationState, 'observedAt'>)

interface TextImportState {
  isOpen: boolean
  sourceName: string | null
  sourceType: TextImportSourceType | null
  sourceFiles: TextImportSourceFileState[]
  rawText: string
  draftSourceName: string
  draftText: string
  preprocessedHints: TextImportPreprocessHint[]
  preview: TextImportResponse | null
  previewTree: TextImportPreviewNode[]
  crossFileMergeSuggestions: TextImportCrossFileMergeSuggestion[]
  approvedConflictIds: string[]
  runStage: AiRunStage
  semanticMergeStage: SemanticMergeStage
  statusText: string
  progress: number
  progressIndeterminate: boolean
  modeHint: string | null
  error: TextImportErrorState | null
  isPreviewing: boolean
  isApplying: boolean
  previewStartedAt: number | null
  previewFinishedAt: number | null
  activeJobId: string | null
  activeJobMode: TextImportJobMode | null
  activeJobType: TextImportJobType | null
  currentStatus: TextImportCurrentStatus | null
  latestCodexExplainer: TextImportCodexExplainerState | null
  latestCodexEvent: TextImportCodexEventState | null
  codexEventFeed: TextImportCodexEventState[]
  codexDiagnostics: TextImportCodexDiagnosticState[]
  statusTimeline: TextImportStatusTimelineEntry[]
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
  open: () => void
  close: () => void
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
  toggleConflictApproval: (conflictId: string) => void
  applyPreview: (document: MindMapDocument) => Promise<ApplyTextImportResult | null>
}

const INITIAL_STATE = {
  isOpen: false,
  sourceName: null,
  sourceType: null as TextImportSourceType | null,
  sourceFiles: [] as TextImportSourceFileState[],
  rawText: '',
  draftSourceName: 'Pasted text',
  draftText: '',
  preprocessedHints: [] as TextImportPreprocessHint[],
  preview: null as TextImportResponse | null,
  previewTree: [] as TextImportPreviewNode[],
  crossFileMergeSuggestions: [] as TextImportCrossFileMergeSuggestion[],
  approvedConflictIds: [] as string[],
  runStage: 'idle' as AiRunStage,
  semanticMergeStage: 'idle' as SemanticMergeStage,
  statusText: '',
  progress: 0,
  progressIndeterminate: false,
  modeHint: null as string | null,
  error: null as TextImportErrorState | null,
  isPreviewing: false,
  isApplying: false,
  previewStartedAt: null as number | null,
  previewFinishedAt: null as number | null,
  activeJobId: null as string | null,
  activeJobMode: null as TextImportJobMode | null,
  activeJobType: null as TextImportJobType | null,
  currentStatus: null as TextImportCurrentStatus | null,
  latestCodexExplainer: null as TextImportCodexExplainerState | null,
  latestCodexEvent: null as TextImportCodexEventState | null,
  codexEventFeed: [] as TextImportCodexEventState[],
  codexDiagnostics: [] as TextImportCodexDiagnosticState[],
  statusTimeline: [] as TextImportStatusTimelineEntry[],
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
}

let activeJobHandle: TextImportJobHandle | null = null

function cancelActiveJob(): void {
  activeJobHandle?.cancel()
  activeJobHandle = null
}

function createModeHint(mode: TextImportJobMode, jobType: TextImportJobType): string {
  if (mode === 'local_markdown') {
    return jobType === 'batch'
      ? 'Using the local text batch pipeline. Imported branches stay safe, while semantic merges only apply when the target topic is unchanged.'
      : 'Using the local text import pipeline. Semantic merges only apply when the target topic is unchanged.'
  }

  return jobType === 'batch'
    ? 'Using the Codex import batch pipeline for Markdown analysis. Non-Markdown files stay on the local import path.'
    : 'Using the Codex import pipeline for Markdown analysis.'
}

function createSelectionContext(
  document: MindMapDocument,
  selection: ImportSelectionSnapshot,
) {
  return buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId)
}

function createErrorState(
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

function isCodexWaitingStage(stage: TextImportRunStage): boolean {
  return stage === 'waiting_codex_primary' || stage === 'waiting_codex_repair'
}

function createTimelineEntryId(stage: TextImportRunStage, startedAt: number): string {
  return `${stage}_${startedAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function updateTimelineWithStatus(
  timeline: TextImportStatusTimelineEntry[],
  event: Extract<TextImportJobEvent, { type: 'status' }>,
  timestamp: number,
): TextImportStatusTimelineEntry[] {
  const nextTimeline = [...timeline]
  const lastEntry = nextTimeline.at(-1)

  if (lastEntry && lastEntry.stage === event.stage && lastEntry.completedAt === null) {
    nextTimeline[nextTimeline.length - 1] = {
      ...lastEntry,
      message: event.message,
      progress: event.progress,
      requestId: event.requestId ?? lastEntry.requestId,
    }
    return nextTimeline
  }

  if (lastEntry && lastEntry.completedAt === null) {
    nextTimeline[nextTimeline.length - 1] = {
      ...lastEntry,
      completedAt: timestamp,
    }
  }

  nextTimeline.push({
    id: createTimelineEntryId(event.stage, timestamp),
    stage: event.stage,
    message: event.message,
    progress: event.progress,
    startedAt: timestamp,
    completedAt: null,
    requestId: event.requestId,
    runnerObservations: [],
  })

  return nextTimeline
}

function updateTimelineWithRunnerObservation(
  timeline: TextImportStatusTimelineEntry[],
  event: Extract<TextImportJobEvent, { type: 'runner_observation' }>,
  timestamp: number,
): TextImportStatusTimelineEntry[] {
  if (timeline.length === 0) {
    return timeline
  }

  const nextTimeline = [...timeline]
  const lastEntry = nextTimeline.at(-1)
  if (!lastEntry) {
    return nextTimeline
  }

  nextTimeline[nextTimeline.length - 1] = {
    ...lastEntry,
    runnerObservations: [
      ...lastEntry.runnerObservations,
      {
        attempt: event.attempt,
        phase: event.phase,
        promptLength: event.promptLength,
        elapsedSinceSpawnMs: event.elapsedSinceSpawnMs,
        elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
        exitCode: event.exitCode,
        hadJsonEvent: event.hadJsonEvent,
        observedAt: timestamp,
        requestId: event.requestId,
      },
    ],
  }

  return nextTimeline
}

function closeActiveTimelineEntry(
  timeline: TextImportStatusTimelineEntry[],
  timestamp: number,
): TextImportStatusTimelineEntry[] {
  const lastEntry = timeline.at(-1)
  if (!lastEntry || lastEntry.completedAt !== null) {
    return timeline
  }

  const nextTimeline = [...timeline]
  nextTimeline[nextTimeline.length - 1] = {
    ...lastEntry,
    completedAt: timestamp,
  }
  return nextTimeline
}

function appendCodexEvent(
  feed: TextImportCodexEventState[],
  event: Extract<TextImportJobEvent, { type: 'codex_event' }>,
): TextImportCodexEventState[] {
  const nextFeed = [
    ...feed,
    {
      attempt: event.attempt,
      eventType: event.eventType,
      at: event.at,
      summary: event.summary,
      rawJson: event.rawJson,
      requestId: event.requestId,
    },
  ]

  return nextFeed.length > 50 ? nextFeed.slice(-50) : nextFeed
}

function appendCodexDiagnostic(
  diagnostics: TextImportCodexDiagnosticState[],
  event: Extract<TextImportJobEvent, { type: 'codex_diagnostic' }>,
): TextImportCodexDiagnosticState[] {
  const nextDiagnostics = [
    ...diagnostics,
    {
      attempt: event.attempt,
      category: event.category,
      at: event.at,
      message: event.message,
      rawLine: event.rawLine,
      requestId: event.requestId,
    },
  ]

  return nextDiagnostics.length > 50 ? nextDiagnostics.slice(-50) : nextDiagnostics
}

async function startSinglePreview(
  set: (
    partial:
      | Partial<TextImportState>
      | ((state: TextImportState) => Partial<TextImportState>),
  ) => void,
  document: MindMapDocument,
  selection: ImportSelectionSnapshot,
  sourceName: string,
  sourceType: TextImportSourceType,
  rawText: string,
): Promise<void> {
  const normalizedText = rawText.replace(/\r\n?/g, '\n').trim()
  if (!normalizedText) {
    set({
      error: createErrorState('Select a text file or paste content before generating an import preview.'),
      preview: null,
      previewTree: [],
      crossFileMergeSuggestions: [],
      approvedConflictIds: [],
      runStage: 'error',
      statusText: '',
      progress: 0,
      progressIndeterminate: false,
      currentStatus: null,
      latestCodexExplainer: null,
      latestCodexEvent: null,
      codexEventFeed: [],
      codexDiagnostics: [],
      statusTimeline: [],
      applyProgress: 0,
      appliedCount: 0,
      totalOperations: 0,
      currentApplyLabel: null,
      isPreviewing: false,
    })
    return
  }

  cancelActiveJob()

  const preprocessedHints = preprocessTextToImportHints(normalizedText)
  const request = {
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context: createSelectionContext(document, selection),
    anchorTopicId: selection.activeTopicId ?? document.rootTopicId,
    sourceName,
    sourceType,
    rawText: normalizedText,
    preprocessedHints,
  }

  const queuedEvents: TextImportJobEvent[] = []
  let expectedJobId: string | null = null
  const handleJobEvent = (event: TextImportJobEvent) => {
    if (expectedJobId === null) {
      queuedEvents.push(event)
      return
    }
    if (activeJobHandle?.jobId !== expectedJobId) {
      return
    }

    if (event.type === 'status') {
      const timestamp = Date.now()
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        runStage: event.stage,
        semanticMergeStage: event.semanticMergeStage ?? 'idle',
        statusText: event.message,
        progress: event.progress,
        progressIndeterminate: event.mode === 'codex_import' && isCodexWaitingStage(event.stage),
        modeHint: createModeHint(event.mode, event.jobType),
        fileCount: event.fileCount ?? 1,
        completedFileCount: event.completedFileCount ?? 0,
        currentFileName: event.currentFileName ?? sourceName,
        semanticCandidateCount: event.semanticCandidateCount ?? 0,
        semanticAdjudicatedCount: event.semanticAdjudicatedCount ?? 0,
        semanticFallbackCount: event.semanticFallbackCount ?? 0,
        currentStatus: {
          kind: 'status',
          stage: event.stage,
          message: event.message,
          progress: event.progress,
          at: timestamp,
          requestId: event.requestId,
        },
        statusTimeline: updateTimelineWithStatus(state.statusTimeline, event, timestamp),
      }))
      return
    }

    if (event.type === 'runner_observation') {
      const timestamp = Date.now()
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        currentStatus: {
          kind: 'runner_observation',
          attempt: event.attempt,
          phase: event.phase,
          promptLength: event.promptLength,
          elapsedSinceSpawnMs: event.elapsedSinceSpawnMs,
          elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
          exitCode: event.exitCode,
          hadJsonEvent: event.hadJsonEvent,
          requestId: event.requestId,
          at: timestamp,
        },
        statusTimeline: updateTimelineWithRunnerObservation(state.statusTimeline, event, timestamp),
      }))
      return
    }

    if (event.type === 'codex_event') {
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        latestCodexEvent: {
          attempt: event.attempt,
          eventType: event.eventType,
          at: event.at,
          summary: event.summary,
          rawJson: event.rawJson,
          requestId: event.requestId,
        },
        codexEventFeed: appendCodexEvent(state.codexEventFeed, event),
      }))
      return
    }

    if (event.type === 'codex_explainer') {
      set({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        latestCodexExplainer: {
          attempt: event.attempt,
          at: event.at,
          headline: event.headline,
          reason: event.reason,
          evidence: event.evidence,
          requestId: event.requestId,
        },
      })
      return
    }

    if (event.type === 'codex_diagnostic') {
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        codexDiagnostics: appendCodexDiagnostic(state.codexDiagnostics, event),
      }))
      return
    }

    if (event.type === 'preview') {
      set({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        preview: event.data,
        previewTree: buildTextImportPreviewTree(event.data.previewNodes),
        crossFileMergeSuggestions: event.data.crossFileMergeSuggestions ?? [],
        approvedConflictIds: getInitialApprovedConflictIds(event.data),
        modeHint: createModeHint(event.mode, event.jobType),
        error: null,
      })
      return
    }

    if (event.type === 'error') {
      activeJobHandle = null
      const finishedAt = Date.now()
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        error: createErrorState(event.message, {
          rawMessage: event.rawMessage,
          code: event.code,
          kind: event.kind,
          status: event.status,
          stage: event.stage,
          requestId: event.requestId,
        }),
        preview: null,
        previewTree: [],
        crossFileMergeSuggestions: [],
        isPreviewing: false,
        runStage: 'error',
        statusText: '',
        progress: 0,
        progressIndeterminate: false,
        modeHint: createModeHint(event.mode, event.jobType),
        previewFinishedAt: finishedAt,
        activeJobId: null,
        currentStatus: null,
        statusTimeline: closeActiveTimelineEntry(state.statusTimeline, finishedAt),
        semanticCandidateCount: 0,
        semanticAdjudicatedCount: 0,
        semanticFallbackCount: 0,
        currentFileName: event.currentFileName ?? sourceName,
      }))
      return
    }

    activeJobHandle = null
    const finishedAt = Date.now()
    set((state) => ({
      activeJobMode: event.mode,
      activeJobType: event.jobType,
      preview: event.data,
      previewTree: buildTextImportPreviewTree(event.data.previewNodes),
      crossFileMergeSuggestions: event.data.crossFileMergeSuggestions ?? [],
      approvedConflictIds: getInitialApprovedConflictIds(event.data),
      isPreviewing: false,
      runStage: 'completed',
      semanticMergeStage: 'review_ready',
      statusText: 'Import preview is ready. Additive branches are safe to apply; semantic merges will skip topics that changed after preview generation.',
      progress: 100,
      progressIndeterminate: false,
      modeHint: createModeHint(event.mode, event.jobType),
      error: null,
      previewFinishedAt: finishedAt,
      activeJobId: null,
      currentStatus: null,
      statusTimeline: closeActiveTimelineEntry(state.statusTimeline, finishedAt),
      fileCount: event.data.batch?.fileCount ?? 1,
      completedFileCount: event.data.batch?.completedFileCount ?? 1,
      currentFileName: null,
      semanticCandidateCount: event.data.semanticMerge?.candidateCount ?? 0,
      semanticAdjudicatedCount: event.data.semanticMerge?.adjudicatedCount ?? 0,
      semanticFallbackCount: event.data.semanticMerge?.fallbackCount ?? 0,
    }))
  }

  const jobHandle = startTextImportJob(request, handleJobEvent)
  expectedJobId = jobHandle.jobId
  activeJobHandle = jobHandle
  const previewQueuedAt = Date.now()
  const initialStatusText =
    jobHandle.mode === 'local_markdown'
      ? 'Preparing the local text import pipeline...'
      : 'Preparing the Codex import pipeline for Markdown analysis...'

  set({
    isOpen: true,
    sourceName,
    sourceType,
    sourceFiles: [{ sourceName, sourceType, textLength: normalizedText.length }],
    rawText: normalizedText,
    draftSourceName: sourceName,
    draftText: normalizedText,
    preprocessedHints,
    preview: null,
    previewTree: [],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    runStage: 'extracting_input',
    semanticMergeStage: 'idle',
    statusText: initialStatusText,
    progress: 4,
    progressIndeterminate: false,
    modeHint: createModeHint(jobHandle.mode, jobHandle.jobType),
    error: null,
    isPreviewing: true,
    isApplying: false,
    previewStartedAt: previewQueuedAt,
    previewFinishedAt: null,
    activeJobId: jobHandle.jobId,
    activeJobMode: jobHandle.mode,
    activeJobType: jobHandle.jobType,
    currentStatus: {
      kind: 'status',
      stage: 'extracting_input',
      message: initialStatusText,
      progress: 4,
      at: previewQueuedAt,
    },
    latestCodexExplainer: null,
    latestCodexEvent: null,
    codexEventFeed: [],
    codexDiagnostics: [],
    statusTimeline: [
      {
        id: createTimelineEntryId('extracting_input', previewQueuedAt),
        stage: 'extracting_input',
        message: initialStatusText,
        progress: 4,
        startedAt: previewQueuedAt,
        completedAt: null,
        runnerObservations: [],
      },
    ],
    semanticCandidateCount: 0,
    semanticAdjudicatedCount: 0,
    semanticFallbackCount: 0,
    fileCount: 1,
    completedFileCount: 0,
    currentFileName: sourceName,
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
  })

  while (queuedEvents.length > 0) {
    const queuedEvent = queuedEvents.shift()
    if (queuedEvent) {
      handleJobEvent(queuedEvent)
    }
  }
}

async function startBatchPreview(
  set: (
    partial:
      | Partial<TextImportState>
      | ((state: TextImportState) => Partial<TextImportState>),
  ) => void,
  document: MindMapDocument,
  selection: ImportSelectionSnapshot,
  files: File[],
): Promise<void> {
  if (files.length === 0) {
    return
  }

  cancelActiveJob()
  const previewQueuedAt = Date.now()
  set({
    isOpen: true,
    error: null,
    isPreviewing: true,
    statusText: 'Reading selected text files...',
    progress: 2,
    progressIndeterminate: false,
    runStage: 'extracting_input',
    semanticMergeStage: 'idle',
    preview: null,
    previewTree: [],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    fileCount: files.length,
    completedFileCount: 0,
    currentFileName: files[0]?.name ?? null,
    previewStartedAt: previewQueuedAt,
    previewFinishedAt: null,
    sourceType: 'file',
    currentStatus: {
      kind: 'status',
      stage: 'extracting_input',
      message: 'Reading selected text files...',
      progress: 2,
      at: previewQueuedAt,
    },
    latestCodexExplainer: null,
    latestCodexEvent: null,
    codexEventFeed: [],
    codexDiagnostics: [],
    statusTimeline: [
      {
        id: createTimelineEntryId('extracting_input', previewQueuedAt),
        stage: 'extracting_input',
        message: 'Reading selected text files...',
        progress: 2,
        startedAt: previewQueuedAt,
        completedAt: null,
        runnerObservations: [],
      },
    ],
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
  })

  const loadedFiles = await Promise.all(
    files.map(async (file) => {
      const rawText = await file.text()
      return {
        sourceName: file.name,
        sourceType: 'file' as const,
        rawText,
        preprocessedHints: preprocessTextToImportHints(rawText),
      }
    }),
  )
  const sortedFiles = sortTextImportBatchSources(loadedFiles)
  const batchRequest: LocalTextImportBatchRequest = {
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context: createSelectionContext(document, selection),
    anchorTopicId: selection.activeTopicId ?? document.rootTopicId,
    files: sortedFiles,
  }

  const queuedEvents: TextImportJobEvent[] = []
  let expectedJobId: string | null = null
  const handleJobEvent = (event: TextImportJobEvent) => {
    if (expectedJobId === null) {
      queuedEvents.push(event)
      return
    }
    if (activeJobHandle?.jobId !== expectedJobId) {
      return
    }

    if (event.type === 'status') {
      const timestamp = Date.now()
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        runStage: event.stage,
        semanticMergeStage: event.semanticMergeStage ?? 'idle',
        statusText: event.message,
        progress: event.progress,
        progressIndeterminate: event.mode === 'codex_import' && isCodexWaitingStage(event.stage),
        modeHint: createModeHint(event.mode, event.jobType),
        fileCount: event.fileCount ?? sortedFiles.length,
        completedFileCount: event.completedFileCount ?? 0,
        currentFileName: event.currentFileName ?? null,
        semanticCandidateCount: event.semanticCandidateCount ?? 0,
        semanticAdjudicatedCount: event.semanticAdjudicatedCount ?? 0,
        semanticFallbackCount: event.semanticFallbackCount ?? 0,
        currentStatus: {
          kind: 'status',
          stage: event.stage,
          message: event.message,
          progress: event.progress,
          at: timestamp,
          requestId: event.requestId,
        },
        statusTimeline: updateTimelineWithStatus(state.statusTimeline, event, timestamp),
      }))
      return
    }

    if (event.type === 'runner_observation') {
      const timestamp = Date.now()
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        currentStatus: {
          kind: 'runner_observation',
          attempt: event.attempt,
          phase: event.phase,
          promptLength: event.promptLength,
          elapsedSinceSpawnMs: event.elapsedSinceSpawnMs,
          elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
          exitCode: event.exitCode,
          hadJsonEvent: event.hadJsonEvent,
          requestId: event.requestId,
          at: timestamp,
        },
        statusTimeline: updateTimelineWithRunnerObservation(state.statusTimeline, event, timestamp),
      }))
      return
    }

    if (event.type === 'codex_event') {
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        latestCodexEvent: {
          attempt: event.attempt,
          eventType: event.eventType,
          at: event.at,
          summary: event.summary,
          rawJson: event.rawJson,
          requestId: event.requestId,
        },
        codexEventFeed: appendCodexEvent(state.codexEventFeed, event),
      }))
      return
    }

    if (event.type === 'codex_explainer') {
      set({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        latestCodexExplainer: {
          attempt: event.attempt,
          at: event.at,
          headline: event.headline,
          reason: event.reason,
          evidence: event.evidence,
          requestId: event.requestId,
        },
      })
      return
    }

    if (event.type === 'codex_diagnostic') {
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        codexDiagnostics: appendCodexDiagnostic(state.codexDiagnostics, event),
      }))
      return
    }

    if (event.type === 'preview') {
      set({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        preview: event.data,
        previewTree: buildTextImportPreviewTree(event.data.previewNodes),
        crossFileMergeSuggestions: event.data.crossFileMergeSuggestions ?? [],
        approvedConflictIds: getInitialApprovedConflictIds(event.data),
        modeHint: createModeHint(event.mode, event.jobType),
        error: null,
      })
      return
    }

    if (event.type === 'error') {
      activeJobHandle = null
      const finishedAt = Date.now()
      set((state) => ({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        error: createErrorState(event.message, {
          rawMessage: event.rawMessage,
          code: event.code,
          kind: event.kind,
          status: event.status,
          stage: event.stage,
          requestId: event.requestId,
        }),
        preview: null,
        previewTree: [],
        crossFileMergeSuggestions: [],
        isPreviewing: false,
        runStage: 'error',
        statusText: '',
        progress: 0,
        progressIndeterminate: false,
        modeHint: createModeHint(event.mode, event.jobType),
        previewFinishedAt: finishedAt,
        activeJobId: null,
        currentStatus: null,
        statusTimeline: closeActiveTimelineEntry(state.statusTimeline, finishedAt),
        semanticCandidateCount: 0,
        semanticAdjudicatedCount: 0,
        semanticFallbackCount: 0,
        currentFileName: event.currentFileName ?? null,
      }))
      return
    }

    activeJobHandle = null
    const finishedAt = Date.now()
    set((state) => ({
      activeJobMode: event.mode,
      activeJobType: event.jobType,
      preview: event.data,
      previewTree: buildTextImportPreviewTree(event.data.previewNodes),
      crossFileMergeSuggestions: event.data.crossFileMergeSuggestions ?? [],
      approvedConflictIds: getInitialApprovedConflictIds(event.data),
      isPreviewing: false,
      runStage: 'completed',
      semanticMergeStage: 'review_ready',
      statusText: 'Batch import preview is ready. Imported branches are safe to apply, and semantic merges will only touch unchanged topics.',
      progress: 100,
      progressIndeterminate: false,
      modeHint: createModeHint(event.mode, event.jobType),
      error: null,
      previewFinishedAt: finishedAt,
      activeJobId: null,
      currentStatus: null,
      statusTimeline: closeActiveTimelineEntry(state.statusTimeline, finishedAt),
      fileCount: event.data.batch?.fileCount ?? sortedFiles.length,
      completedFileCount: event.data.batch?.completedFileCount ?? sortedFiles.length,
      currentFileName: null,
      semanticCandidateCount: event.data.semanticMerge?.candidateCount ?? 0,
      semanticAdjudicatedCount: event.data.semanticMerge?.adjudicatedCount ?? 0,
      semanticFallbackCount: event.data.semanticMerge?.fallbackCount ?? 0,
    }))
  }

  const jobHandle = startTextImportBatchJob(batchRequest, handleJobEvent)
  expectedJobId = jobHandle.jobId
  activeJobHandle = jobHandle

  set({
    sourceName: `${sortedFiles.length} files`,
    sourceFiles: sortedFiles.map((file) => ({
      sourceName: file.sourceName,
      sourceType: file.sourceType,
      textLength: file.rawText.length,
    })),
    rawText: '',
    draftSourceName: `${sortedFiles.length} files`,
    draftText: '',
    preprocessedHints: sortedFiles.flatMap((file) => file.preprocessedHints),
    activeJobId: jobHandle.jobId,
    activeJobMode: jobHandle.mode,
    activeJobType: jobHandle.jobType,
    modeHint: createModeHint(jobHandle.mode, jobHandle.jobType),
    statusText:
      jobHandle.mode === 'local_markdown'
        ? 'Preparing the local text batch pipeline...'
        : 'Preparing the Codex import batch pipeline...',
    semanticCandidateCount: 0,
    semanticAdjudicatedCount: 0,
    semanticFallbackCount: 0,
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
  })

  while (queuedEvents.length > 0) {
    const queuedEvent = queuedEvents.shift()
    if (queuedEvent) {
      handleJobEvent(queuedEvent)
    }
  }
}

export const useTextImportStore = create<TextImportState>((set, get) => ({
  ...INITIAL_STATE,

  open: () => set({ isOpen: true, error: null }),
  close: () => set({ isOpen: false }),
  setDraftSourceName: (value) => set({ draftSourceName: value }),
  setDraftText: (value) => set({ draftText: value }),
  previewFile: async (document, selection, file) => {
    await startSinglePreview(set, document, selection, file.name, 'file', await file.text())
  },
  previewFiles: async (document, selection, files) => {
    if (files.length <= 1) {
      const [file] = files
      if (file) {
        await startSinglePreview(set, document, selection, file.name, 'file', await file.text())
      }
      return
    }
    await startBatchPreview(set, document, selection, files)
  },
  previewText: async (document, selection, options) => {
    const state = get()
    const sourceName = (options?.sourceName ?? state.draftSourceName.trim()) || 'Pasted text'
    const sourceType = options?.sourceType ?? state.sourceType ?? 'paste'
    const rawText = options?.rawText ?? state.draftText
    await startSinglePreview(set, document, selection, sourceName, sourceType, rawText)
  },
  toggleConflictApproval: (conflictId) =>
    set((state) => ({
      approvedConflictIds: state.approvedConflictIds.includes(conflictId)
        ? state.approvedConflictIds.filter((item) => item !== conflictId)
        : [...state.approvedConflictIds, conflictId],
    })),
  applyPreview: async (document) => {
    const state = get()
    if (!state.preview) {
      set({ error: createErrorState('No import preview is available to apply.') })
      return null
    }

    const totalOperations = state.preview.operations.filter(
      (operation) =>
        operation.risk === 'low' ||
        (operation.conflictId && state.approvedConflictIds.includes(operation.conflictId)),
    ).length

    set({
      isApplying: true,
      runStage: 'applying_changes',
      statusText: `Applying 0/${totalOperations} operations...`,
      progress: 0,
      progressIndeterminate: false,
      applyProgress: 0,
      appliedCount: 0,
      totalOperations,
      currentApplyLabel: null,
      currentStatus: null,
      error: null,
    })

    try {
      const result = await applyTextImportPreview(document, state.preview, state.approvedConflictIds, {
        batchSize: 25,
        onProgress: (progressUpdate) => {
          set({
            applyProgress: Math.round((progressUpdate.processedCount / progressUpdate.totalOperations) * 100),
            appliedCount: progressUpdate.processedCount,
            totalOperations: progressUpdate.totalOperations,
            currentApplyLabel: progressUpdate.currentLabel,
            progress: Math.round((progressUpdate.processedCount / progressUpdate.totalOperations) * 100),
            statusText: `Applying ${progressUpdate.processedCount}/${progressUpdate.totalOperations} operations...`,
          })
        },
      })
      const processedTotal = result.appliedCount + result.skippedCount
      set({
        isApplying: false,
        runStage: 'completed',
        statusText: result.appliedSummary,
        progress: 100,
        applyProgress: 100,
        appliedCount: processedTotal,
        totalOperations: processedTotal,
        currentApplyLabel: null,
        error: null,
      })
      return {
        document: result.document,
        selectedTopicId: result.selectedTopicId,
        summary: result.appliedSummary,
        warnings: result.warnings,
      }
    } catch (error) {
      set({
        isApplying: false,
        runStage: 'error',
        statusText: '',
        progress: 0,
        progressIndeterminate: false,
        applyProgress: 0,
        appliedCount: 0,
        totalOperations: 0,
        currentApplyLabel: null,
        error: createErrorState(
          error instanceof Error ? error.message : 'Failed to apply the import preview.',
          { stage: 'applying_changes' },
        ),
      })
      return null
    }
  },
}))

export function resetTextImportStore(): void {
  cancelActiveJob()
  useTextImportStore.setState(INITIAL_STATE)
}
