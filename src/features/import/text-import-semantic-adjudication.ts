import type {
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
} from '../../../shared/ai-contract'
import type { LocalTextImportBatchRequest, SemanticMergeStage } from './local-text-import-core'
import { adjudicateTextImportCandidates } from './text-import-client'
import {
  applyTextImportSemanticAdjudication,
  createTextImportSemanticDraft,
} from './text-import-semantic-merge'

export interface TextImportSemanticAdjudicationProgressUpdate {
  stage: TextImportRunStage
  message: string
  progress: number
  jobType: 'single' | 'batch'
  fileCount: number
  completedFileCount: number
  currentFileName: string | null
  semanticMergeStage: SemanticMergeStage
  semanticCandidateCount: number
  semanticAdjudicatedCount: number
  semanticFallbackCount: number
}

function emitProgress(
  onProgress:
    | ((update: TextImportSemanticAdjudicationProgressUpdate) => void)
    | undefined,
  update: TextImportSemanticAdjudicationProgressUpdate,
): void {
  onProgress?.(update)
}

export async function finalizeTextImportSemanticPreview(
  jobId: string,
  request: TextImportRequest | LocalTextImportBatchRequest,
  draftResponse: TextImportResponse,
  options?: {
    onProgress?: (update: TextImportSemanticAdjudicationProgressUpdate) => void
  },
): Promise<TextImportResponse> {
  const semanticDraft = createTextImportSemanticDraft(request, draftResponse)
  const candidateCount = semanticDraft.candidateBundles.length
  const fileCount = draftResponse.batch?.fileCount ?? 1
  const completedFileCount =
    draftResponse.batch?.completedFileCount ?? (semanticDraft.jobType === 'batch' ? 0 : 1)

  if (candidateCount === 0) {
    emitProgress(options?.onProgress, {
      stage: 'semantic_merge_review',
      message: 'No semantic candidates required bridge adjudication.',
      progress: 94,
      jobType: semanticDraft.jobType,
      fileCount,
      completedFileCount,
      currentFileName: null,
      semanticMergeStage: 'review_ready',
      semanticCandidateCount: 0,
      semanticAdjudicatedCount: 0,
      semanticFallbackCount: 0,
    })
    return {
      ...draftResponse,
      semanticMerge: {
        candidateCount: 0,
        adjudicatedCount: 0,
        autoMergedExistingCount: 0,
        autoMergedCrossFileCount: 0,
        conflictCount: 0,
        fallbackCount: 0,
      },
    }
  }

  const batches: typeof semanticDraft.candidateBundles[] = []
  for (let index = 0; index < semanticDraft.candidateBundles.length; index += 12) {
    batches.push(semanticDraft.candidateBundles.slice(index, index + 12))
  }

  const allDecisions = []
  const warnings: string[] = []
  let adjudicatedCount = 0
  let fallbackCount = 0

  emitProgress(options?.onProgress, {
    stage: 'semantic_candidate_generation',
    message: 'Prepared semantic merge candidates for bridge adjudication.',
    progress: 72,
    jobType: semanticDraft.jobType,
    fileCount,
    completedFileCount,
    currentFileName: null,
    semanticMergeStage: 'candidate_generation',
    semanticCandidateCount: candidateCount,
    semanticAdjudicatedCount: adjudicatedCount,
    semanticFallbackCount: fallbackCount,
  })

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]
    emitProgress(options?.onProgress, {
      stage: 'semantic_adjudication',
      message: `Adjudicating semantic merge batch ${batchIndex + 1}/${batches.length}...`,
      progress: Math.min(92, 76 + Math.round(((batchIndex + 1) / batches.length) * 14)),
      jobType: semanticDraft.jobType,
      fileCount,
      completedFileCount,
      currentFileName: null,
      semanticMergeStage: 'adjudicating',
      semanticCandidateCount: candidateCount,
      semanticAdjudicatedCount: adjudicatedCount,
      semanticFallbackCount: fallbackCount,
    })

    try {
      const response = await adjudicateTextImportCandidates({
        jobId,
        documentId: request.documentId,
        documentTitle: request.documentTitle,
        batchTitle: semanticDraft.batchTitle,
        candidates: batch.map((item) => item.candidate),
      })
      allDecisions.push(...response.decisions)
      warnings.push(...(response.warnings ?? []))
      adjudicatedCount += batch.length
    } catch (error) {
      fallbackCount += batch.length
      warnings.push(
        error instanceof Error
          ? `Semantic adjudication batch ${batchIndex + 1} fell back to local heuristics: ${error.message}`
          : `Semantic adjudication batch ${batchIndex + 1} fell back to local heuristics.`,
      )
    }
  }

  emitProgress(options?.onProgress, {
    stage: 'semantic_merge_review',
    message: 'Finalizing semantic merge decisions and safe apply graph...',
    progress: 94,
    jobType: semanticDraft.jobType,
    fileCount,
    completedFileCount,
    currentFileName: null,
    semanticMergeStage: 'review_ready',
    semanticCandidateCount: candidateCount,
    semanticAdjudicatedCount: adjudicatedCount,
    semanticFallbackCount: fallbackCount,
  })

  return applyTextImportSemanticAdjudication(
    draftResponse,
    semanticDraft,
    {
      decisions: allDecisions,
      warnings,
    },
    {
      warnings,
    },
  )
}
