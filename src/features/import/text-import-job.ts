import type {
  CodexApiError,
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
  TextImportStreamEvent,
} from '../../../shared/ai-contract'
import type { CodexRequestFailureKind } from '../ai/ai-client'
import { composeTextImportBatchPreview, type BatchTextImportPreviewSource } from './text-import-batch-compose'
import { streamCodexTextImportPreview } from './text-import-client'
import {
  sortTextImportBatchSources,
  type LocalTextImportBatchRequest,
  type SemanticMergeStage,
} from './local-text-import-core'
import { finalizeTextImportSemanticPreview } from './text-import-semantic-adjudication'

export type TextImportJobMode = 'local_markdown' | 'codex_import'
export type TextImportJobType = 'single' | 'batch'

export type TextImportJobEvent =
  | {
      type: 'status'
      stage: TextImportRunStage
      message: string
      progress: number
      mode: TextImportJobMode
      jobType: TextImportJobType
      fileCount?: number
      completedFileCount?: number
      currentFileName?: string | null
      semanticMergeStage?: SemanticMergeStage
      semanticCandidateCount?: number
      semanticAdjudicatedCount?: number
      semanticFallbackCount?: number
      requestId?: string
    }
  | {
      type: 'preview'
      data: TextImportResponse
      mode: TextImportJobMode
      jobType: TextImportJobType
      requestId?: string
    }
  | {
      type: 'result'
      data: TextImportResponse
      mode: TextImportJobMode
      jobType: TextImportJobType
      requestId?: string
    }
  | {
      type: 'error'
      stage?: TextImportRunStage
      code?: CodexApiError['code']
      message: string
      rawMessage?: string
      kind?: CodexRequestFailureKind
      status?: number
      requestId?: string
      currentFileName?: string | null
      mode: TextImportJobMode
      jobType: TextImportJobType
    }

export interface TextImportJobHandle {
  jobId: string
  mode: TextImportJobMode
  jobType: TextImportJobType
  cancel: () => void
}

type StreamImportError = Error & {
  stage?: TextImportRunStage
  code?: CodexApiError['code']
  kind?: CodexRequestFailureKind
  status?: number
  rawMessage?: string
  requestId?: string
}

function createJobId(): string {
  return `import_job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function mapCodexStageToProgress(stage: TextImportRunStage): number {
  switch (stage) {
    case 'extracting_input':
      return 10
    case 'analyzing_source':
      return 18
    case 'loading_prompt':
      return 28
    case 'starting_codex_primary':
      return 34
    case 'waiting_codex_primary':
      return 56
    case 'parsing_primary_result':
      return 72
    case 'repairing_structure':
      return 80
    case 'starting_codex_repair':
      return 84
    case 'waiting_codex_repair':
      return 90
    case 'parsing_repair_result':
      return 94
    case 'resolving_conflicts':
      return 97
    case 'building_preview':
      return 99
    case 'parsing_markdown':
      return 20
    case 'analyzing_import':
      return 55
    case 'semantic_candidate_generation':
      return 72
    case 'semantic_adjudication':
      return 84
    case 'semantic_merge_review':
      return 94
    default:
      return 0
  }
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function mapBatchFileProgress(fileIndex: number, fileCount: number, stageProgress: number): number {
  const safeFileCount = Math.max(1, fileCount)
  const windowSize = 60 / safeFileCount
  const offset = 8 + fileIndex * windowSize
  return clampProgress(offset + (Math.max(0, Math.min(100, stageProgress)) / 100) * windowSize)
}

function createCodexStreamError(event: Extract<TextImportStreamEvent, { type: 'error' }>): StreamImportError {
  const error = new Error(event.message) as StreamImportError
  error.stage = event.stage
  error.code = event.code
  error.rawMessage = event.rawMessage
  error.requestId = event.requestId
  return error
}

function normalizeImportError(
  error: unknown,
  fallbackMessage: string,
): Pick<
  Extract<TextImportJobEvent, { type: 'error' }>,
  'stage' | 'code' | 'message' | 'rawMessage' | 'kind' | 'status' | 'requestId'
> {
  const normalized = error as Partial<StreamImportError> | undefined
  return {
    stage:
      typeof normalized?.stage === 'string'
        ? (normalized.stage as TextImportRunStage)
        : 'building_preview',
    code: normalized?.code,
    message: error instanceof Error ? error.message : fallbackMessage,
    rawMessage: typeof normalized?.rawMessage === 'string' ? normalized.rawMessage : undefined,
    kind: normalized?.kind,
    status: typeof normalized?.status === 'number' ? normalized.status : undefined,
    requestId: typeof normalized?.requestId === 'string' ? normalized.requestId : undefined,
  }
}

async function runCodexTextImportPreview(
  request: TextImportRequest,
  options?: {
    signal?: AbortSignal
    onStatus?: (event: Extract<TextImportStreamEvent, { type: 'status' }>) => void
  },
): Promise<TextImportResponse> {
  let response: TextImportResponse | null = null

  await streamCodexTextImportPreview(
    request,
    (event) => {
      if (event.type === 'status') {
        options?.onStatus?.(event)
        return
      }

      if (event.type === 'result') {
        response = event.data
        return
      }

      throw createCodexStreamError(event)
    },
    { signal: options?.signal },
  )

  if (!response) {
    const error = new Error('Import request completed without a result.') as StreamImportError
    error.stage = 'building_preview'
    error.rawMessage = error.message
    throw error
  }

  return response
}

function emitBatchStatus(
  onEvent: (event: TextImportJobEvent) => void,
  mode: TextImportJobMode,
  fileCount: number,
  completedFileCount: number,
  currentFileName: string | null,
  update: Omit<
    Extract<TextImportJobEvent, { type: 'status' }>,
    'type' | 'mode' | 'jobType' | 'fileCount' | 'completedFileCount' | 'currentFileName'
  >,
): void {
  onEvent({
    type: 'status',
    mode,
    jobType: 'batch',
    fileCount,
    completedFileCount,
    currentFileName,
    ...update,
  })
}

function createBatchImportError(
  fileName: string,
  error: unknown,
) : Pick<
  Extract<TextImportJobEvent, { type: 'error' }>,
  'stage' | 'code' | 'message' | 'rawMessage' | 'kind' | 'status' | 'requestId' | 'currentFileName'
> {
  const normalized = normalizeImportError(error, 'Batch import request failed.')
  return {
    ...normalized,
    currentFileName: fileName,
  }
}

async function buildBatchPreviewSource(
  request: LocalTextImportBatchRequest,
  file: LocalTextImportBatchRequest['files'][number],
  fileIndex: number,
  fileCount: number,
  signal: AbortSignal,
  onEvent: (event: TextImportJobEvent) => void,
): Promise<BatchTextImportPreviewSource> {
  const singleRequest: TextImportRequest = {
    documentId: request.documentId,
    documentTitle: request.documentTitle,
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    context: request.context,
    anchorTopicId: request.anchorTopicId,
    sourceName: file.sourceName,
    sourceType: file.sourceType,
    intent: file.intent,
    archetype: file.archetype,
    archetypeMode: file.archetypeMode,
    contentProfile: file.contentProfile,
    nodeBudget: file.nodeBudget,
    rawText: file.rawText,
    preprocessedHints: file.preprocessedHints,
    semanticHints: file.semanticHints,
  }
  const response = await runCodexTextImportPreview(singleRequest, {
    signal,
    onStatus: (event) => {
      emitBatchStatus(onEvent, 'codex_import', fileCount, fileIndex, file.sourceName, {
        stage: event.stage,
        message: event.message,
        progress: mapBatchFileProgress(fileIndex, fileCount, mapCodexStageToProgress(event.stage)),
        requestId: event.requestId,
      })
    },
  })
  return {
    ...file,
    route: 'codex_import',
    response,
  }
}

function startCodexBatchJob(
  request: LocalTextImportBatchRequest,
  onEvent: (event: TextImportJobEvent) => void,
): TextImportJobHandle {
  const jobId = createJobId()
  const mode: TextImportJobMode = 'codex_import'
  const controller = new AbortController()
  let cancelled = false
  const files = sortTextImportBatchSources(request.files)

  void (async () => {
    const builtFiles: BatchTextImportPreviewSource[] = []

    for (let index = 0; index < files.length; index += 1) {
      if (cancelled) {
        return
      }

      const file = files[index]
      try {
        const built = await buildBatchPreviewSource(
          request,
          file,
          index,
          files.length,
          controller.signal,
          onEvent,
        )
        if (cancelled) {
          return
        }

        builtFiles.push(built)
        emitBatchStatus(onEvent, mode, files.length, index + 1, files[index + 1]?.sourceName ?? null, {
          stage: 'analyzing_import',
          message: `Prepared ${file.sourceName} with the skill-backed import pipeline.`,
          progress: mapBatchFileProgress(index, files.length, 100),
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        onEvent({
          type: 'error',
          mode,
          jobType: 'batch',
          ...createBatchImportError(file.sourceName, error),
        })
        return
      }
    }

    emitBatchStatus(onEvent, mode, files.length, files.length, null, {
      stage: 'building_preview',
      message: 'Composing the batch import preview...',
      progress: 70,
    })

    const composed = composeTextImportBatchPreview(request, builtFiles)
    onEvent({
      type: 'preview',
      data: composed,
      mode,
      jobType: 'batch',
    })

    const result = await finalizeTextImportSemanticPreview(jobId, request, composed, {
      onProgress: (update) => {
        if (cancelled) {
          return
        }

        emitBatchStatus(onEvent, mode, update.fileCount, update.completedFileCount, update.currentFileName, {
          stage: update.stage,
          message: update.message,
          progress: update.progress,
          semanticMergeStage: update.semanticMergeStage,
          semanticCandidateCount: update.semanticCandidateCount,
          semanticAdjudicatedCount: update.semanticAdjudicatedCount,
          semanticFallbackCount: update.semanticFallbackCount,
        })
      },
    })

    if (cancelled) {
      return
    }

    onEvent({
      type: 'result',
      data: result,
      mode,
      jobType: 'batch',
    })
  })().catch((error) => {
    if (cancelled) {
      return
    }

    onEvent({
      type: 'error',
      ...normalizeImportError(error, 'Batch import request failed.'),
      mode,
      jobType: 'batch',
    })
  })

  return {
    jobId,
    mode,
    jobType: 'batch',
    cancel: () => {
      cancelled = true
      controller.abort()
    },
  }
}

export function startTextImportJob(
  request: TextImportRequest,
  onEvent: (event: TextImportJobEvent) => void,
): TextImportJobHandle {
  const jobId = createJobId()
  const mode: TextImportJobMode = 'codex_import'

  const controller = new AbortController()
  let cancelled = false
  const { preparedArtifacts: _preparedArtifacts, ...codexRequest } = request as TextImportRequest & {
    preparedArtifacts?: unknown
  }

  void streamCodexTextImportPreview(
    codexRequest,
    (event) => {
      if (cancelled) {
        return
      }

      if (event.type === 'status') {
        onEvent({
          type: 'status',
          stage: event.stage,
          message: event.message,
          progress: mapCodexStageToProgress(event.stage),
          mode,
          jobType: 'single',
          requestId: event.requestId,
        })
        return
      }

      if (event.type === 'result') {
        onEvent({
          type: 'result',
          data: event.data,
          mode,
          jobType: 'single',
          requestId: event.requestId,
        })
        return
      }

      onEvent({
        type: 'error',
        stage: event.stage,
        code: event.code,
        message: event.message,
        rawMessage: event.rawMessage,
        requestId: event.requestId,
        currentFileName: request.sourceName,
        mode,
        jobType: 'single',
      })
    },
    { signal: controller.signal },
  ).catch((error) => {
    if (cancelled) {
      return
    }

    onEvent({
      type: 'error',
      ...normalizeImportError(error, 'Import request failed.'),
      currentFileName: request.sourceName,
      mode,
      jobType: 'single',
    })
  })

  return {
    jobId,
    mode,
    jobType: 'single',
    cancel: () => {
      cancelled = true
      controller.abort()
    },
  }
}

export function startTextImportBatchJob(
  request: LocalTextImportBatchRequest,
  onEvent: (event: TextImportJobEvent) => void,
): TextImportJobHandle {
  return startCodexBatchJob(request, onEvent)
}
