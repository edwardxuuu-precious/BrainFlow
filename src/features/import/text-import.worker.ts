/// <reference lib="webworker" />

import type {
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
} from '../../../shared/ai-contract'
import {
  createLocalTextImportBatchPreview,
  createLocalTextImportPreview,
  type LocalTextImportBatchRequest,
  type LocalTextImportProgressUpdate,
} from './local-text-import-core'
import { finalizeTextImportSemanticPreview } from './text-import-semantic-adjudication'

type StartSingleJobMessage = {
  type: 'start_single'
  jobId: string
  request: TextImportRequest
}

type StartBatchJobMessage = {
  type: 'start_batch'
  jobId: string
  request: LocalTextImportBatchRequest
}

type WorkerMessage = StartSingleJobMessage | StartBatchJobMessage

type WorkerStatusMessage = {
  type: 'status'
  jobId: string
  stage: TextImportRunStage
  message: string
  progress: number
  jobType?: 'single' | 'batch'
  fileCount?: number
  completedFileCount?: number
  currentFileName?: string | null
  semanticMergeStage?: LocalTextImportProgressUpdate['semanticMergeStage']
  semanticCandidateCount?: number
  semanticAdjudicatedCount?: number
  semanticFallbackCount?: number
}

type WorkerPreviewMessage = {
  type: 'preview'
  jobId: string
  data: TextImportResponse
}

type WorkerResultMessage = {
  type: 'result'
  jobId: string
  data: TextImportResponse
}

type WorkerErrorMessage = {
  type: 'error'
  jobId: string
  message: string
  rawMessage?: string
  stage?: TextImportRunStage
}

declare const self: DedicatedWorkerGlobalScope

function postStatus(message: WorkerStatusMessage): void {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type !== 'start_single' && event.data.type !== 'start_batch') {
    return
  }

  const { jobId } = event.data

  void (async () => {
    const onProgress = (update: LocalTextImportProgressUpdate) => {
      postStatus({
        type: 'status',
        jobId,
        stage: update.stage,
        message: update.message,
        progress: update.progress,
        jobType: update.jobType,
        fileCount: update.fileCount,
        completedFileCount: update.completedFileCount,
        currentFileName: update.currentFileName,
        semanticMergeStage: update.semanticMergeStage,
      })
    }

    const built =
      event.data.type === 'start_single'
        ? createLocalTextImportPreview(event.data.request, {
            preprocessHintCount: event.data.request.preprocessedHints.length,
            onProgress,
          })
        : createLocalTextImportBatchPreview(event.data.request, {
            onProgress,
          })

    const previewMessage: WorkerPreviewMessage = {
      type: 'preview',
      jobId,
      data: built.response,
    }
    self.postMessage(previewMessage)

    const result = await finalizeTextImportSemanticPreview(jobId, event.data.request, built.response, {
      onProgress: (update) => {
        postStatus({
          type: 'status',
          jobId,
          stage: update.stage,
          message: update.message,
          progress: update.progress,
          jobType: update.jobType,
          fileCount: update.fileCount,
          completedFileCount: update.completedFileCount,
          currentFileName: update.currentFileName,
          semanticMergeStage: update.semanticMergeStage,
          semanticCandidateCount: update.semanticCandidateCount,
          semanticAdjudicatedCount: update.semanticAdjudicatedCount,
          semanticFallbackCount: update.semanticFallbackCount,
        })
      },
    })
    const resultMessage: WorkerResultMessage = {
      type: 'result',
      jobId,
      data: result,
    }
    self.postMessage(resultMessage)
  })().catch((error) => {
    const errorMessage: WorkerErrorMessage = {
      type: 'error',
      jobId,
      stage: 'building_preview',
      message: error instanceof Error ? error.message : 'Markdown import failed.',
      rawMessage: error instanceof Error ? error.message : undefined,
    }
    self.postMessage(errorMessage)
  })
}

export {}
