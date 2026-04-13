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
  kind: 'resolved'
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

function createResolvedDecision<TPayload>(
  analysis: ConflictAnalysisFields<TPayload>,
): ConflictHeuristicDecision<TPayload> {
  return {
    kind: 'resolved',
    analysis,
  }
}

export function analyzeConflictHeuristics<TPayload>(
  conflict: SyncConflictRecord<TPayload>,
): ConflictHeuristicDecision<TPayload> {
  const actionableResolutions = getActionableConflictResolutions(conflict)
  const localRecord = conflict.localRecord
  const cloudRecord = conflict.cloudRecord

  if (!cloudRecord) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'save_local_copy',
        confidence: 'high',
        summary: '主库当前没有可采用的版本，建议保留本地内容并另存副本。',
        reasons: [
          'Postgres 主库中的权威记录缺失，无法直接采用主库版本。',
          '保留本地副本可以避免当前修改丢失。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'use_cloud'),
        mergedPayload: null,
        analysisNote: '系统直接按记录状态和更新时间给出建议。',
      }),
    )
  }

  if (!localRecord) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'high',
        summary: '本地当前没有可恢复内容，建议直接采用主库版本。',
        reasons: [
          '本地冲突侧没有可保留的记录。',
          '采用主库版本可以恢复当前权威内容。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'save_local_copy'),
        mergedPayload: null,
        analysisNote: '系统直接按记录状态和更新时间给出建议。',
      }),
    )
  }

  if (conflict.diffHints.sameContentHash) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'high',
        summary: '两侧内容一致，只是版本基线不同，建议直接采用主库版本。',
        reasons: [
          '本地和主库内容哈希一致，没有实质内容差异。',
          '采用主库版本可以直接清理这次版本冲突。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
        analysisNote: '系统直接按记录状态和更新时间给出建议。',
      }),
    )
  }

  if (cloudRecord.deletedAt !== null && localRecord.deletedAt === null) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'save_local_copy',
        confidence: 'medium',
        summary: '主库版本已删除，但本地仍有有效内容，建议先保留本地副本。',
        reasons: [
          '主库当前状态是删除，直接采用主库会丢失本地内容。',
          '保留本地副本后，你可以再决定是否恢复这份内容。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
        analysisNote: '删除类冲突会优先避免直接覆盖仍然存在的内容。',
      }),
    )
  }

  if (localRecord.deletedAt !== null && cloudRecord.deletedAt === null) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'medium',
        summary: '本地版本已删除，但主库仍有有效内容，建议采用主库版本。',
        reasons: [
          '主库仍保留有效内容，可以恢复当前文档。',
          '删除类冲突默认优先保留仍然存在的一侧。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
        analysisNote: '删除类冲突会优先避免误删仍然存在的内容。',
      }),
    )
  }

  const localUpdatedAt = localRecord.updatedAt ?? 0
  const cloudUpdatedAt = cloudRecord.updatedAt ?? 0

  if (
    localUpdatedAt > cloudUpdatedAt &&
    isResolutionAllowed(actionableResolutions, 'merged_payload')
  ) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'merged_payload',
        confidence: 'medium',
        summary: '本地更新时间更晚，建议采用本地较新版本。',
        reasons: [
          '系统直接按更新时间选择较新的版本。',
          '本地版本比主库更新得更晚，更接近你最后一次修改。',
          '请结合下方差异确认后再采用本地较新版本。',
        ],
        actionableResolutions,
        mergedPayload: localRecord.payload,
        analysisNote: '系统只根据更新时间给出建议，不会自动覆盖任何一侧内容。',
      }),
    )
  }

  if (cloudUpdatedAt > localUpdatedAt) {
    return createResolvedDecision(
      createAnalysis<TPayload>({
        analysisSource: 'heuristic',
        recommendedResolution: 'use_cloud',
        confidence: 'medium',
        summary: '主库更新时间更晚，建议采用主库较新版本。',
        reasons: [
          '系统直接按更新时间选择较新的版本。',
          '主库版本比本地更新得更晚，更接近最后一次同步后的结果。',
          '请结合下方差异确认后再采用主库较新版本。',
        ],
        actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
        mergedPayload: null,
        analysisNote: '系统只根据更新时间给出建议，不会自动覆盖任何一侧内容。',
      }),
    )
  }

  return createResolvedDecision(
    createAnalysis<TPayload>({
      analysisSource: 'heuristic',
      recommendedResolution: 'use_cloud',
      confidence: 'low',
      summary: '两侧更新时间相同，默认保留主库权威版本，请结合差异确认。',
      reasons: [
        '两侧时间戳相同时，系统无法进一步判断哪一侧更可信。',
        '系统默认优先保留主库权威版本，并保留本地副本作为备选。',
      ],
      actionableResolutions: actionableResolutions.filter((item) => item !== 'merged_payload'),
      mergedPayload: null,
      analysisNote: '请重点参考下方差异内容，再决定是否采用默认建议。',
    }),
  )
}
