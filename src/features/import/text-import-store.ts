import { create } from 'zustand'
import type {
  TextImportArchetype,
  TextImportPreset,
  TextImportSourceType,
} from '../../../shared/ai-contract'
import {
  resolveTextImportPlanningOptions,
} from '../../../shared/text-import-semantics'
import type { MindMapDocument } from '../documents/types'
import {
  applyTextImportPreview,
  getInitialApprovedConflictIds,
} from './text-import-apply'
import {
  applyTextImportPreviewEdit,
  buildTextImportDraftTree,
  recompileTextImportDraft,
} from './text-import-preview-edit'
import {
  startTextImportBatchJob,
  startTextImportJob,
  type TextImportJobEvent,
  type TextImportJobHandle,
} from './text-import-job'
import {
  sortTextImportBatchSources,
  type LocalTextImportBatchRequest,
} from './local-text-import-core'
import { preprocessTextToImportHints } from './text-import-preprocess'
import { buildTextImportPreviewTree } from './text-import-preview-tree'
import {
  applyImportDiagnostics,
  buildEditedDraftState,
  buildStatusProgressEntry,
  createErrorState,
  createModeHint,
  createResetSessionState,
  createSelectionContext,
  INITIAL_STATE,
  isCodexWaitingStage,
  mergeProgressEntries,
  mergePlanningSummariesWithPreview,
  mergeTraceEntries,
  resolveImportAnchorTopicId,
  type CachedTextImportSource,
  type ImportSelectionSnapshot,
  type TextImportAnchorMode,
  type TextImportState,
} from './text-import-store-helpers'

export type { TextImportAnchorMode, TextImportErrorState } from './text-import-store-helpers'

let activeJobHandle: TextImportJobHandle | null = null

function cancelActiveJob(): void {
  activeJobHandle?.cancel()
  activeJobHandle = null
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
  presetOverride: TextImportPreset | null,
  archetypeOverride: TextImportArchetype | null,
  anchorMode: TextImportAnchorMode,
): Promise<void> {
  const normalizedText = rawText.replace(/\r\n?/g, '\n').trim()
  if (!normalizedText) {
    set({
      error: createErrorState('Select a text file or paste content before generating an import preview.'),
      preview: null,
      draftTree: [],
      previewTree: [],
      draftConfirmed: false,
      planningSummaries: [],
      crossFileMergeSuggestions: [],
      approvedConflictIds: [],
      runStage: 'error',
      statusText: '',
      progress: 0,
      progressIndeterminate: false,
      applyProgress: 0,
      appliedCount: 0,
      totalOperations: 0,
      currentApplyLabel: null,
      isPreviewing: false,
    })
    return
  }

  cancelActiveJob()

  const preprocessStartedAt = Date.now()
  const preprocessedHints = preprocessTextToImportHints(normalizedText)
  const preprocessMs = Date.now() - preprocessStartedAt
  const planningStartedAt = Date.now()
  const planning = resolveTextImportPlanningOptions({
    sourceName,
    sourceType,
    preprocessedHints,
    presetOverride,
    archetypeOverride,
  })
  const planningMs = Date.now() - planningStartedAt
  const request = {
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context: createSelectionContext(document, selection),
    anchorTopicId: resolveImportAnchorTopicId(document, selection, anchorMode),
    sourceName,
    sourceType,
    intent: planning.intent,
    archetype: archetypeOverride ?? undefined,
    archetypeMode: archetypeOverride ? ('manual' as const) : ('auto' as const),
    contentProfile: planning.contentProfile,
    nodeBudget: planning.nodeBudget,
    rawText: normalizedText,
    preprocessedHints,
    semanticHints: planning.semanticHints,
    preparedArtifacts: planning.preparedArtifacts,
  } as Parameters<typeof startTextImportJob>[0] & {
    preparedArtifacts: typeof planning.preparedArtifacts
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

    if (event.type === 'progress') {
      set((state) => ({
        progressEntries: mergeProgressEntries(state.progressEntries, event.entry),
      }))
      return
    }

    if (event.type === 'trace') {
      set((state) => ({
        traceEntries: mergeTraceEntries(state.traceEntries, event.entry),
      }))
      return
    }

    if (event.type === 'status') {
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
        progressEntries:
          event.requestId === undefined
            ? mergeProgressEntries(state.progressEntries, buildStatusProgressEntry(event))
            : state.progressEntries,
      }))
      return
    }

    if (event.type === 'preview') {
      const mergedPlanningSummaries = mergePlanningSummariesWithPreview([planning.summary], event.data)
      const preview = applyImportDiagnostics(recompileTextImportDraft(event.data), {
        preprocessMs,
        planningMs,
        planningSummaries: mergedPlanningSummaries,
      })
      set({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        preview,
        draftTree: buildTextImportDraftTree(preview),
        previewTree: buildTextImportPreviewTree(preview.previewNodes),
        draftConfirmed: false,
        planningSummaries: mergedPlanningSummaries,
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
      set({
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
        draftTree: [],
        previewTree: [],
        draftConfirmed: false,
        crossFileMergeSuggestions: [],
        isPreviewing: false,
        runStage: 'error',
        statusText: '',
        progress: 0,
        progressIndeterminate: false,
        modeHint: createModeHint(event.mode, event.jobType),
        previewFinishedAt: finishedAt,
        activeJobId: null,
        semanticCandidateCount: 0,
        semanticAdjudicatedCount: 0,
        semanticFallbackCount: 0,
        currentFileName: event.currentFileName ?? sourceName,
      })
      return
    }

    activeJobHandle = null
    const finishedAt = Date.now()
    const mergedPlanningSummaries = mergePlanningSummariesWithPreview([planning.summary], event.data)
    const preview = applyImportDiagnostics(recompileTextImportDraft(event.data), {
      preprocessMs,
      planningMs,
      planningSummaries: mergedPlanningSummaries,
    })
    set({
      activeJobMode: event.mode,
      activeJobType: event.jobType,
      preview,
      draftTree: buildTextImportDraftTree(preview),
      previewTree: buildTextImportPreviewTree(preview.previewNodes),
      draftConfirmed: false,
      planningSummaries: mergedPlanningSummaries,
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
      fileCount: event.data.batch?.fileCount ?? 1,
      completedFileCount: event.data.batch?.completedFileCount ?? 1,
      currentFileName: null,
      semanticCandidateCount: event.data.semanticMerge?.candidateCount ?? 0,
      semanticAdjudicatedCount: event.data.semanticMerge?.adjudicatedCount ?? 0,
      semanticFallbackCount: event.data.semanticMerge?.fallbackCount ?? 0,
    })
  }

  const jobHandle = startTextImportJob(request, handleJobEvent)
  expectedJobId = jobHandle.jobId
  activeJobHandle = jobHandle
  const previewQueuedAt = Date.now()
  const initialStatusText =
    'Preparing the skill-backed import pipeline...'

  set({
    isOpen: true,
    sourceName,
    sourceType,
    sourceFiles: [{ sourceName, sourceType, textLength: normalizedText.length }],
    cachedSources: [{ sourceName, sourceType, rawText: normalizedText }],
    rawText: normalizedText,
    draftSourceName: sourceName,
    draftText: normalizedText,
    preprocessedHints,
    preview: null,
    draftTree: [],
    previewTree: [],
    draftConfirmed: false,
    planningSummaries: [planning.summary],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    runStage: 'extracting_input',
    semanticMergeStage: 'idle',
    statusText: initialStatusText,
    progress: 4,
    progressIndeterminate: false,
    progressEntries: [
      buildStatusProgressEntry({
        type: 'status',
        stage: 'extracting_input',
        message: initialStatusText,
        progress: 4,
        mode: jobHandle.mode,
        jobType: jobHandle.jobType,
        currentFileName: sourceName,
        completedFileCount: 0,
        fileCount: 1,
      }),
    ],
    traceEntries: [],
    modeHint: createModeHint(jobHandle.mode, jobHandle.jobType),
    error: null,
    isPreviewing: true,
    isApplying: false,
    previewStartedAt: previewQueuedAt,
    previewFinishedAt: null,
    activeJobId: jobHandle.jobId,
    activeJobMode: jobHandle.mode,
    activeJobType: jobHandle.jobType,
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
    presetOverride,
    archetypeOverride,
    anchorMode,
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
  files: Array<File | CachedTextImportSource>,
  presetOverride: TextImportPreset | null,
  archetypeOverride: TextImportArchetype | null,
  anchorMode: TextImportAnchorMode,
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
    progressEntries: [
      buildStatusProgressEntry({
        type: 'status',
        stage: 'extracting_input',
        message: 'Reading selected text files...',
        progress: 2,
        mode: 'codex_import',
        jobType: 'batch',
        fileCount: files.length,
        completedFileCount: 0,
        currentFileName: 'name' in files[0] ? files[0].name : files[0]?.sourceName ?? null,
      }),
    ],
    traceEntries: [],
    runStage: 'extracting_input',
    semanticMergeStage: 'idle',
    preview: null,
    draftTree: [],
    previewTree: [],
    draftConfirmed: false,
    planningSummaries: [],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    fileCount: files.length,
    completedFileCount: 0,
    currentFileName: 'name' in files[0] ? files[0].name : files[0]?.sourceName ?? null,
    previewStartedAt: previewQueuedAt,
    previewFinishedAt: null,
    sourceType: 'file',
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
  })

  const loadedFiles = await Promise.all(
    files.map(async (file) => {
      const sourceName = 'name' in file ? file.name : file.sourceName
      const sourceType = 'name' in file ? ('file' as const) : file.sourceType
      const rawText = 'name' in file ? await file.text() : file.rawText
      const preprocessStartedAt = Date.now()
      const preprocessedHints = preprocessTextToImportHints(rawText)
      const preprocessMs = Date.now() - preprocessStartedAt
      const planningStartedAt = Date.now()
      const planning = resolveTextImportPlanningOptions({
        sourceName,
        sourceType,
        preprocessedHints,
        presetOverride,
        archetypeOverride,
      })
      const planningMs = Date.now() - planningStartedAt
      return {
        sourceName,
        sourceType,
        rawText,
        preprocessedHints,
        semanticHints: planning.semanticHints,
        intent: planning.intent,
        archetype: archetypeOverride ?? undefined,
        archetypeMode: archetypeOverride ? ('manual' as const) : ('auto' as const),
        contentProfile: planning.contentProfile,
        nodeBudget: planning.nodeBudget,
        planningSummary: planning.summary,
        preparedArtifacts: planning.preparedArtifacts,
        preprocessMs,
        planningMs,
      }
    }),
  )
  const sortedFiles = sortTextImportBatchSources(loadedFiles)
  const preprocessMs = sortedFiles.reduce((total, file) => total + file.preprocessMs, 0)
  const planningMs = sortedFiles.reduce((total, file) => total + file.planningMs, 0)
  const batchRequest: LocalTextImportBatchRequest = {
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context: createSelectionContext(document, selection),
    anchorTopicId: resolveImportAnchorTopicId(document, selection, anchorMode),
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

    if (event.type === 'progress') {
      set((state) => ({
        progressEntries: mergeProgressEntries(state.progressEntries, event.entry),
      }))
      return
    }

    if (event.type === 'trace') {
      set((state) => ({
        traceEntries: mergeTraceEntries(state.traceEntries, event.entry),
      }))
      return
    }

    if (event.type === 'status') {
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
        progressEntries:
          event.requestId === undefined
            ? mergeProgressEntries(state.progressEntries, buildStatusProgressEntry(event))
            : state.progressEntries,
      }))
      return
    }

    if (event.type === 'preview') {
      const mergedPlanningSummaries = mergePlanningSummariesWithPreview(
        sortedFiles.map((file) => file.planningSummary),
        event.data,
      )
      const preview = applyImportDiagnostics(recompileTextImportDraft(event.data), {
        preprocessMs,
        planningMs,
        planningSummaries: mergedPlanningSummaries,
      })
      set({
        activeJobMode: event.mode,
        activeJobType: event.jobType,
        preview,
        draftTree: buildTextImportDraftTree(preview),
        previewTree: buildTextImportPreviewTree(preview.previewNodes),
        draftConfirmed: false,
        planningSummaries: mergedPlanningSummaries,
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
      set({
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
        draftTree: [],
        previewTree: [],
        draftConfirmed: false,
        crossFileMergeSuggestions: [],
        isPreviewing: false,
        runStage: 'error',
        statusText: '',
        progress: 0,
        progressIndeterminate: false,
        modeHint: createModeHint(event.mode, event.jobType),
        previewFinishedAt: finishedAt,
        activeJobId: null,
        semanticCandidateCount: 0,
        semanticAdjudicatedCount: 0,
        semanticFallbackCount: 0,
        currentFileName: event.currentFileName ?? null,
      })
      return
    }

    activeJobHandle = null
    const finishedAt = Date.now()
    const mergedPlanningSummaries = mergePlanningSummariesWithPreview(
      sortedFiles.map((file) => file.planningSummary),
      event.data,
    )
    const preview = applyImportDiagnostics(recompileTextImportDraft(event.data), {
      preprocessMs,
      planningMs,
      planningSummaries: mergedPlanningSummaries,
    })
    set({
      activeJobMode: event.mode,
      activeJobType: event.jobType,
      preview,
      draftTree: buildTextImportDraftTree(preview),
      previewTree: buildTextImportPreviewTree(preview.previewNodes),
      draftConfirmed: false,
      planningSummaries: mergedPlanningSummaries,
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
      fileCount: event.data.batch?.fileCount ?? sortedFiles.length,
      completedFileCount: event.data.batch?.completedFileCount ?? sortedFiles.length,
      currentFileName: null,
      semanticCandidateCount: event.data.semanticMerge?.candidateCount ?? 0,
      semanticAdjudicatedCount: event.data.semanticMerge?.adjudicatedCount ?? 0,
      semanticFallbackCount: event.data.semanticMerge?.fallbackCount ?? 0,
    })
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
    cachedSources: sortedFiles.map((file) => ({
      sourceName: file.sourceName,
      sourceType: file.sourceType,
      rawText: file.rawText,
    })),
    rawText: '',
    draftSourceName: `${sortedFiles.length} files`,
    draftText: '',
    preprocessedHints: sortedFiles.flatMap((file) => file.preprocessedHints),
    traceEntries: [],
    planningSummaries: sortedFiles.map((file) => file.planningSummary),
    activeJobId: jobHandle.jobId,
    activeJobMode: jobHandle.mode,
    activeJobType: jobHandle.jobType,
    modeHint: createModeHint(jobHandle.mode, jobHandle.jobType),
    statusText:
      'Preparing the skill-backed batch import pipeline...',
    semanticCandidateCount: 0,
    semanticAdjudicatedCount: 0,
    semanticFallbackCount: 0,
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
    presetOverride,
    archetypeOverride,
    anchorMode,
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
  close: () =>
    set({
      isOpen: false,
      presetOverride: null,
      archetypeOverride: null,
      anchorMode: INITIAL_STATE.anchorMode,
      planningSummaries: [],
      cachedSources: [],
      draftConfirmed: false,
    }),
  resetSession: () => {
    cancelActiveJob()
    set(createResetSessionState())
  },
  setPresetOverride: (value) => set({ presetOverride: value }),
  setArchetypeOverride: (value) => set({ archetypeOverride: value }),
  setAnchorMode: (value) => set({ anchorMode: value }),
  setDraftSourceName: (value) => set({ draftSourceName: value }),
  setDraftText: (value) => set({ draftText: value }),
  previewFile: async (document, selection, file) => {
    await startSinglePreview(
      set,
      document,
      selection,
      file.name,
      'file',
      await file.text(),
      get().presetOverride,
      get().archetypeOverride,
      get().anchorMode,
    )
  },
  previewFiles: async (document, selection, files) => {
    if (files.length <= 1) {
      const [file] = files
      if (file) {
        await startSinglePreview(
          set,
          document,
          selection,
          file.name,
          'file',
          await file.text(),
          get().presetOverride,
          get().archetypeOverride,
          get().anchorMode,
        )
      }
      return
    }
    await startBatchPreview(
      set,
      document,
      selection,
      files,
      get().presetOverride,
      get().archetypeOverride,
      get().anchorMode,
    )
  },
  previewText: async (document, selection, options) => {
    const state = get()
    const sourceName = (options?.sourceName ?? state.draftSourceName.trim()) || 'Pasted text'
    const sourceType = options?.sourceType ?? state.sourceType ?? 'paste'
    const rawText = options?.rawText ?? state.draftText
    await startSinglePreview(
      set,
      document,
      selection,
      sourceName,
      sourceType,
      rawText,
      state.presetOverride,
      state.archetypeOverride,
      state.anchorMode,
    )
  },
  rerunPreviewWithPreset: async (document, selection, preset) => {
    set({ presetOverride: preset })
    const state = get()
    if (state.cachedSources.length > 1) {
      await startBatchPreview(
        set,
        document,
        selection,
        state.cachedSources,
        preset,
        state.archetypeOverride,
        state.anchorMode,
      )
      return
    }

    const [source] = state.cachedSources
    if (source) {
      await startSinglePreview(
        set,
        document,
        selection,
        source.sourceName,
        source.sourceType,
        source.rawText,
        preset,
        state.archetypeOverride,
        state.anchorMode,
      )
      return
    }

    const sourceName = (state.sourceName ?? state.draftSourceName) || 'Pasted text'
    const sourceType = state.sourceType ?? 'paste'
    const rawText = state.rawText || state.draftText
    await startSinglePreview(
      set,
      document,
      selection,
      sourceName,
      sourceType,
      rawText,
      preset,
      state.archetypeOverride,
      state.anchorMode,
    )
  },
  rerunPreviewWithArchetype: async (document, selection, archetype) => {
    set({ archetypeOverride: archetype })
    const state = get()
    if (state.cachedSources.length > 1) {
      await startBatchPreview(
        set,
        document,
        selection,
        state.cachedSources,
        state.presetOverride,
        archetype,
        state.anchorMode,
      )
      return
    }

    const [source] = state.cachedSources
    if (source) {
      await startSinglePreview(
        set,
        document,
        selection,
        source.sourceName,
        source.sourceType,
        source.rawText,
        state.presetOverride,
        archetype,
        state.anchorMode,
      )
      return
    }

    const sourceName = (state.sourceName ?? state.draftSourceName) || 'Pasted text'
    const sourceType = state.sourceType ?? 'paste'
    const rawText = state.rawText || state.draftText
    await startSinglePreview(
      set,
      document,
      selection,
      sourceName,
      sourceType,
      rawText,
      state.presetOverride,
      archetype,
      state.anchorMode,
    )
  },
  toggleConflictApproval: (conflictId) =>
    set((state) => ({
      approvedConflictIds: state.approvedConflictIds.includes(conflictId)
        ? state.approvedConflictIds.filter((item) => item !== conflictId)
        : [...state.approvedConflictIds, conflictId],
    })),
  confirmDraft: () =>
    set((state) => {
      if (!state.preview) {
        return {}
      }

      const preview = recompileTextImportDraft(state.preview)
      return {
        preview,
        draftTree: buildTextImportDraftTree(preview),
        previewTree: buildTextImportPreviewTree(preview.previewNodes),
        draftConfirmed: true,
        crossFileMergeSuggestions: preview.crossFileMergeSuggestions ?? [],
        approvedConflictIds: state.approvedConflictIds.filter((conflictId) =>
          preview.conflicts.some((conflict) => conflict.id === conflictId),
        ),
      }
    }),
  renamePreviewNode: (nodeId, title) =>
    set((state) => {
      if (!state.preview) {
        return {}
      }

      const preview = applyTextImportPreviewEdit(state.preview, {
        type: 'rename',
        nodeId,
        title,
      })

      return buildEditedDraftState(state, preview)
    }),
  promotePreviewNode: (nodeId) =>
    set((state) => {
      if (!state.preview) {
        return {}
      }

      const preview = applyTextImportPreviewEdit(state.preview, {
        type: 'promote',
        nodeId,
      })

      return buildEditedDraftState(state, preview)
    }),
  demotePreviewNode: (nodeId) =>
    set((state) => {
      if (!state.preview) {
        return {}
      }

      const preview = applyTextImportPreviewEdit(state.preview, {
        type: 'demote',
        nodeId,
      })

      return buildEditedDraftState(state, preview)
    }),
  deletePreviewNode: (nodeId) =>
    set((state) => {
      if (!state.preview) {
        return {}
      }

      const preview = applyTextImportPreviewEdit(state.preview, {
        type: 'delete',
        nodeId,
      })

      return buildEditedDraftState(state, preview)
    }),
  applyPreview: async (document) => {
    const state = get()
    if (!state.preview) {
      set({ error: createErrorState('No import preview is available to apply.') })
      return null
    }
    if (!state.draftConfirmed) {
      set({ error: createErrorState('Confirm the structure draft before applying the import.') })
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
