import type {
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
  TextImportSemanticDecision,
} from '../../../shared/ai-contract'
import type { LocalTextImportBatchRequest, SemanticMergeStage } from './local-text-import-core'
import { mergeTextImportDiagnostics } from './text-import-diagnostics'
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

type SemanticCandidateBundle = ReturnType<typeof createTextImportSemanticDraft>['candidateBundles'][number]

function shouldEscalateCandidate(bundle: SemanticCandidateBundle): boolean {
  if (bundle.scope === 'existing_topic') {
    return !(
      bundle.fallbackDecision.confidence === 'high' &&
      bundle.fallbackDecision.kind !== 'conflict'
    )
  }

  return true
}

function selectRepresentativeBundle(
  bundles: SemanticCandidateBundle[],
): SemanticCandidateBundle {
  return [...bundles].sort((left, right) => {
    const leftScore = left.candidate.similarityScore ?? 0
    const rightScore = right.candidate.similarityScore ?? 0
    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }
    return left.candidate.candidateId.localeCompare(right.candidate.candidateId)
  })[0]
}

function expandGroupedDecisions(
  decisions: Array<{ decision: TextImportSemanticDecision; bundle: SemanticCandidateBundle }>,
  groupMembersByRepresentativeId: Map<string, SemanticCandidateBundle[]>,
) {
  const expanded: typeof decisions[number]['decision'][] = []
  decisions.forEach(({ decision, bundle }) => {
    const groupMembers =
      groupMembersByRepresentativeId.get(bundle.candidate.candidateId) ?? [bundle]
    groupMembers.forEach((member) => {
      expanded.push({
        ...decision,
        candidateId: member.candidate.candidateId,
      })
    })
  })
  return expanded
}

export async function finalizeTextImportSemanticPreview(
  jobId: string,
  request: TextImportRequest | LocalTextImportBatchRequest,
  draftResponse: TextImportResponse,
  options?: {
    onProgress?: (update: TextImportSemanticAdjudicationProgressUpdate) => void
    now?: () => number
  },
): Promise<TextImportResponse> {
  const now = options?.now ?? Date.now
  const adjudicationStartedAt = now()
  const semanticDraft = createTextImportSemanticDraft(request, draftResponse)
  const candidateCount = semanticDraft.candidateBundles.length
  const fileCount = draftResponse.batch?.fileCount ?? 1
  const completedFileCount =
    draftResponse.batch?.completedFileCount ?? (semanticDraft.jobType === 'batch' ? 0 : 1)
  const candidateGroups = new Map<string, SemanticCandidateBundle[]>()
  semanticDraft.candidateBundles.forEach((bundle) => {
    if (!shouldEscalateCandidate(bundle)) {
      return
    }
    const groupId = bundle.candidate.groupId ?? bundle.candidate.candidateId
    const bucket = candidateGroups.get(groupId) ?? []
    bucket.push(bundle)
    candidateGroups.set(groupId, bucket)
  })
  const representativeBundles = [...candidateGroups.values()].map((bundles) =>
    selectRepresentativeBundle(bundles),
  )
  const groupMembersByRepresentativeId = new Map(
    representativeBundles.map((bundle) => [
      bundle.candidate.candidateId,
      candidateGroups.get(bundle.candidate.groupId ?? bundle.candidate.candidateId) ?? [bundle],
    ]),
  )
  const representativeCount = representativeBundles.length

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
      diagnostics: mergeTextImportDiagnostics(draftResponse.diagnostics, {
        semanticAdjudication: {
          candidateCount: 0,
          representativeCount: 0,
          requestCount: 0,
          adjudicatedCount: 0,
          fallbackCount: 0,
        },
        timings: {
          semanticAdjudicationMs: now() - adjudicationStartedAt,
        },
      }),
    }
  }

  if (representativeCount === 0) {
    const applied = applyTextImportSemanticAdjudication(draftResponse, semanticDraft, {
      decisions: [],
      warnings: [],
    })
    return {
      ...applied,
      diagnostics: mergeTextImportDiagnostics(applied.diagnostics, {
        semanticAdjudication: {
          candidateCount,
          representativeCount: 0,
          requestCount: 0,
          adjudicatedCount: 0,
          fallbackCount: 0,
        },
        timings: {
          semanticAdjudicationMs: now() - adjudicationStartedAt,
        },
      }),
    }
  }

  const batches: typeof semanticDraft.candidateBundles[] = []
  for (let index = 0; index < representativeBundles.length; index += 12) {
    batches.push(representativeBundles.slice(index, index + 12))
  }

  const allDecisions: Array<{ decision: TextImportSemanticDecision; bundle: SemanticCandidateBundle }> = []
  const warnings: string[] = []
  let adjudicatedCount = 0
  let fallbackCount = 0
  let requestCount = 0

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
      requestCount += 1
      const response = await adjudicateTextImportCandidates({
        jobId,
        documentId: request.documentId,
        documentTitle: request.documentTitle,
        batchTitle: semanticDraft.batchTitle,
        candidates: batch.map((item) => item.candidate),
      })
      const bundleByCandidateId = new Map(batch.map((item) => [item.candidate.candidateId, item]))
      response.decisions.forEach((decision, decisionIndex) => {
        const bundle = bundleByCandidateId.get(decision.candidateId) ?? batch[decisionIndex]
        if (!bundle) {
          return
        }
        allDecisions.push({ decision, bundle })
      })
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

  const applied = applyTextImportSemanticAdjudication(
    draftResponse,
    semanticDraft,
    {
      decisions: expandGroupedDecisions(allDecisions, groupMembersByRepresentativeId),
      warnings,
    },
    {
      warnings,
    },
  )
  return {
    ...applied,
    diagnostics: mergeTextImportDiagnostics(applied.diagnostics, {
      semanticAdjudication: {
        candidateCount,
        representativeCount,
        requestCount,
        adjudicatedCount,
        fallbackCount,
      },
      timings: {
        semanticAdjudicationMs: now() - adjudicationStartedAt,
      },
    }),
  }
}
