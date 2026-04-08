import type {
  SyncConflictAnalysisConfidence,
  SyncConflictAnalysisSource,
  SyncConflictRecord,
  SyncConflictResolution,
} from '../../../../shared/sync-contract'

export interface ConflictAnalysisFields<TPayload> {
  analysisStatus: SyncConflictRecord<TPayload>['analysisStatus']
  analysisSource: SyncConflictAnalysisSource | null
  recommendedResolution: SyncConflictResolution | null
  confidence: SyncConflictAnalysisConfidence | null
  summary: string | null
  reasons: string[]
  actionableResolutions: SyncConflictResolution[]
  mergedPayload?: TPayload | null
  analyzedAt: number | null
  analysisNote?: string | null
}

export interface ConflictHeuristicDecision<TPayload> {
  kind: 'resolved' | 'needs_ai'
  analysis: ConflictAnalysisFields<TPayload>
}

function isResolutionAllowed(
  resolutions: SyncConflictResolution[],
  resolution: SyncConflictResolution,
): boolean {
  return resolutions.includes(resolution)
}

export function getActionableConflictResolutions<TPayload>(
  conflict: SyncConflictRecord<TPayload>,
): SyncConflictResolution[] {
  const actionable: SyncConflictResolution[] = []

  if (conflict.cloudRecord) {
    actionable.push('use_cloud')
  }

  if (conflict.localRecord) {
    actionable.push('save_local_copy')
  }

  if (
    conflict.localRecord &&
    conflict.cloudRecord &&
    conflict.localRecord.deletedAt === null &&
    conflict.cloudRecord.deletedAt === null
  ) {
    actionable.push('merged_payload')
  }

  return actionable
}

function createAnalysis<TPayload>(
  input: Omit<ConflictAnalysisFields<TPayload>, 'analysisStatus' | 'analyzedAt'> & {
    analysisStatus?: SyncConflictRecord<TPayload>['analysisStatus']
    analyzedAt?: number | null
  },
): ConflictAnalysisFields<TPayload> {
  return {
    analysisStatus: input.analysisStatus ?? 'ready',
    analysisSource: input.analysisSource,
    recommendedResolution: input.recommendedResolution,
    confidence: input.confidence,
    summary: input.summary,
    reasons: input.reasons,
    actionableResolutions: input.actionableResolutions,
    mergedPayload: input.mergedPayload ?? null,
    analyzedAt: input.analyzedAt ?? Date.now(),
    analysisNote: input.analysisNote ?? null,
  }
}

export function analyzeConflictHeuristics<TPayload>(
  conflict: SyncConflictRecord<TPayload>,
): ConflictHeuristicDecision<TPayload> {
  const actionableResolutions = getActionableConflictResolutions(conflict)
  const localRecord = conflict.localRecord
  const cloudRecord = conflict.cloudRecord

  if (!cloudRecord) {
    return {
      kind: 'resolved',
      analysis: createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'save_local_copy',
        confidence: 'high',
        summary: '云端当前没有这份内容，建议保留本地并另存为副本。',
        reasons: [
          '云端权威记录缺失，无法安全采用云端版本。',
          '另存本地副本可以保住当前修改，同时避免直接覆盖云端状态。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'use_cloud'),
        mergedPayload: null,
      }),
    }
  }

  if (!localRecord) {
    return {
      kind: 'resolved',
      analysis: createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'high',
        summary: '本地当前没有可恢复内容，建议采用云端版本。',
        reasons: [
          '本地冲突侧没有可直接保留的记录。',
          '采用云端版本可以恢复当前云端权威状态。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'save_local_copy'),
        mergedPayload: null,
      }),
    }
  }

  if (conflict.diffHints.sameContentHash) {
    return {
      kind: 'resolved',
      analysis: createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'high',
        summary: '两侧内容一致，只是版本基线漂移，建议直接采用云端版本。',
        reasons: [
          '本地和云端内容哈希一致，没有实质内容差异。',
          '采用云端版本可以直接消除版本冲突，不会丢失内容。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
      }),
    }
  }

  if (cloudRecord.deletedAt !== null && localRecord.deletedAt === null) {
    return {
      kind: 'resolved',
      analysis: createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'save_local_copy',
        confidence: 'high',
        summary: '云端版本已被删除，但本地仍有有效内容，建议保留本地并另存副本。',
        reasons: [
          '云端当前状态表示删除，本地仍保留可恢复内容。',
          '另存副本可以保住本地内容，同时尊重云端当前删除状态。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
      }),
    }
  }

  if (localRecord.deletedAt !== null && cloudRecord.deletedAt === null) {
    return {
      kind: 'resolved',
      analysis: createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'high',
        summary: '本地版本已被删除，但云端仍有有效内容，建议采用云端版本。',
        reasons: [
          '本地当前状态表示删除，云端仍保留可恢复内容。',
          '采用云端版本可以恢复有效内容，并完成冲突清理。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
      }),
    }
  }

  return {
    kind: 'needs_ai',
    analysis: createAnalysis<TPayload>({
      analysisStatus: 'pending',
      analysisSource: null,
      recommendedResolution: null,
      confidence: null,
      summary: '正在分析本地与云端的差异，准备给出建议。',
      reasons: [],
      actionableResolutions,
      mergedPayload: null,
      analyzedAt: null,
      analysisNote: null,
    }),
  }
}

export function buildHeuristicFallbackAnalysis<TPayload>(
  conflict: SyncConflictRecord<TPayload>,
  note: string,
): ConflictAnalysisFields<TPayload> {
  const actionableResolutions = getActionableConflictResolutions(conflict).filter(
    (item) => item !== 'merged_payload',
  )
  const preferCloud =
    (conflict.cloudRecord?.updatedAt ?? 0) > (conflict.localRecord?.updatedAt ?? 0) ||
    !isResolutionAllowed(actionableResolutions, 'save_local_copy')

  const recommendedResolution = preferCloud ? 'use_cloud' : 'save_local_copy'

  return createAnalysis<TPayload>({
    analysisSource: 'heuristic_fallback',
    recommendedResolution,
    confidence: 'low',
    summary:
      recommendedResolution === 'use_cloud'
        ? 'AI 当前不可用，已回退为规则建议：优先采用更新时间更晚的云端版本。'
        : 'AI 当前不可用，已回退为规则建议：优先保留本地内容并另存副本。',
    reasons: [
      '这次复杂冲突本来需要 AI 做语义比较。',
      note,
      preferCloud
        ? '回退策略优先保留更新时间更晚的一侧，当前更偏向云端。'
        : '回退策略优先保留更新时间更晚的一侧，当前更偏向本地。',
    ],
    actionableResolutions,
    mergedPayload: null,
    analysisNote: note,
  })
}
