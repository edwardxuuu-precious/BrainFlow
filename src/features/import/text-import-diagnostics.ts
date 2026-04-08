import type {
  TextImportApplyEstimate,
  TextImportArtifactReuseSummary,
  TextImportDensityStats,
  TextImportDiagnostics,
  TextImportPreviewItem,
  TextImportQualitySignalSummary,
  TextImportResponse,
  TextImportTimingDiagnostics,
} from '../../../shared/ai-contract'
import type { TextImportSourcePlanningSummary } from '../../../shared/text-import-semantics'

const GENERIC_TITLE_PATTERNS = [
  /^item\b/i,
  /^section\b/i,
  /^details?\b/i,
  /^notes?\b/i,
  /^untitled\b/i,
  /^content\b/i,
  /^point\b/i,
]

function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
}

export function createEmptyTextImportTimings(
  overrides: Partial<TextImportTimingDiagnostics> = {},
): TextImportTimingDiagnostics {
  return {
    preprocessMs: 0,
    planningMs: 0,
    parseTreeMs: 0,
    batchComposeMs: 0,
    semanticCandidateMs: 0,
    semanticAdjudicationMs: 0,
    previewEditMs: 0,
    applyMs: 0,
    totalMs: 0,
    ...overrides,
  }
}

export function buildTextImportDensityStats(options: {
  previewNodes: TextImportPreviewItem[]
  semanticNodeCount: number
  semanticEdgeCount: number
  operationCount: number
}): TextImportDensityStats {
  const childrenByParent = new Map<string | null, TextImportPreviewItem[]>()
  options.previewNodes.forEach((node) => {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  })

  const depthById = new Map<string, number>()
  let maxDepth = 0
  options.previewNodes.forEach((node) => {
    let depth = 0
    let cursor = node.parentId
    while (cursor) {
      depth += 1
      const parent = options.previewNodes.find((candidate) => candidate.id === cursor)
      cursor = parent?.parentId ?? null
    }
    depthById.set(node.id, depth)
    maxDepth = Math.max(maxDepth, depth)
  })

  return {
    previewNodeCount: options.previewNodes.length,
    semanticNodeCount: options.semanticNodeCount,
    semanticEdgeCount: options.semanticEdgeCount,
    operationCount: options.operationCount,
    sourceAnchorCount: options.previewNodes.reduce(
      (total, node) => total + (node.sourceAnchors?.length ?? 0),
      0,
    ),
    foldedNoteCount: options.previewNodes.filter((node) => Boolean(node.note?.trim())).length,
    evidenceNodeCount: options.previewNodes.filter(
      (node) => node.semanticRole === 'evidence' || node.semanticType === 'evidence',
    ).length,
    maxDepth,
  }
}

export function buildTextImportApplyEstimate(response: Pick<
  TextImportResponse,
  'operations' | 'mergeSuggestions' | 'crossFileMergeSuggestions'
>): TextImportApplyEstimate {
  const createCount = response.operations.filter((operation) => operation.type === 'create_child').length
  const updateCount = response.operations.filter((operation) => operation.type === 'update_topic').length
  return {
    createCount,
    updateCount,
    mergeCount: response.mergeSuggestions?.length ?? 0,
    crossFileMergeCount: response.crossFileMergeSuggestions?.length ?? 0,
    skippedUpdateCount: response.operations.filter(
      (operation) => operation.type === 'update_topic' && !operation.targetFingerprint,
    ).length,
  }
}

export function buildTextImportQualitySignalSummary(options: {
  previewNodes: TextImportPreviewItem[]
  warnings?: string[]
  planningSummaries?: TextImportSourcePlanningSummary[]
}): TextImportQualitySignalSummary {
  const nonRootNodes = options.previewNodes.filter((node) => node.parentId !== null)
  const childrenByParent = new Map<string | null, TextImportPreviewItem[]>()
  options.previewNodes.forEach((node) => {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  })

  let duplicateSiblingGroupCount = 0
  childrenByParent.forEach((siblings) => {
    const seen = new Set<string>()
    let hasDuplicate = false
    siblings.forEach((node) => {
      const key = normalizeTitleKey(node.title)
      if (!key) {
        return
      }
      if (seen.has(key)) {
        hasDuplicate = true
        return
      }
      seen.add(key)
    })
    if (hasDuplicate) {
      duplicateSiblingGroupCount += 1
    }
  })

  return {
    warningCount: options.warnings?.length ?? 0,
    genericTitleCount: nonRootNodes.filter((node) =>
      GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(node.title)),
    ).length,
    lowConfidenceNodeCount: nonRootNodes.filter((node) => node.confidence === 'low').length,
    foldedEvidenceCount: nonRootNodes.filter(
      (node) =>
        (node.semanticRole === 'evidence' || node.semanticType === 'evidence') &&
        Boolean(node.note?.trim()),
    ).length,
    duplicateSiblingGroupCount,
    shallowSourceCount:
      options.planningSummaries?.filter((summary) => summary.isShallowPass).length ?? 0,
    needsDeepPassCount:
      options.planningSummaries?.filter((summary) => summary.needsDeepPass).length ?? 0,
  }
}

export function buildTextImportDiagnostics(options: {
  timings: TextImportTimingDiagnostics
  response: Pick<
    TextImportResponse,
    | 'previewNodes'
    | 'semanticNodes'
    | 'semanticEdges'
    | 'operations'
    | 'warnings'
    | 'mergeSuggestions'
    | 'crossFileMergeSuggestions'
  >
  artifactReuse: TextImportArtifactReuseSummary
  planningSummaries?: TextImportSourcePlanningSummary[]
  semanticAdjudication?: TextImportDiagnostics['semanticAdjudication']
  dirtySubtreeIds?: string[]
  lastEditAction?: string | null
}): TextImportDiagnostics {
  return {
    timings: options.timings,
    densityStats: buildTextImportDensityStats({
      previewNodes: options.response.previewNodes,
      semanticNodeCount: options.response.semanticNodes.length,
      semanticEdgeCount: options.response.semanticEdges.length,
      operationCount: options.response.operations.length,
    }),
    artifactReuse: options.artifactReuse,
    qualitySignals: buildTextImportQualitySignalSummary({
      previewNodes: options.response.previewNodes,
      warnings: options.response.warnings,
      planningSummaries: options.planningSummaries,
    }),
    applyEstimate: buildTextImportApplyEstimate(options.response),
    semanticAdjudication: options.semanticAdjudication ?? {
      candidateCount: 0,
      representativeCount: 0,
      requestCount: 0,
      adjudicatedCount: 0,
      fallbackCount: 0,
    },
    dirtySubtreeIds: options.dirtySubtreeIds,
    lastEditAction: options.lastEditAction ?? null,
  }
}

export function mergeTextImportDiagnostics(
  existing: TextImportDiagnostics | null | undefined,
  patch: Partial<Omit<TextImportDiagnostics, 'timings' | 'densityStats' | 'artifactReuse' | 'qualitySignals' | 'applyEstimate' | 'semanticAdjudication'>> & {
    timings?: Partial<TextImportTimingDiagnostics>
    densityStats?: Partial<TextImportDensityStats>
    artifactReuse?: Partial<TextImportArtifactReuseSummary>
    qualitySignals?: Partial<TextImportQualitySignalSummary>
    applyEstimate?: Partial<TextImportApplyEstimate>
    semanticAdjudication?: Partial<TextImportDiagnostics['semanticAdjudication']>
  },
): TextImportDiagnostics | null {
  if (!existing) {
    const base: TextImportDiagnostics = {
      timings: createEmptyTextImportTimings(),
      densityStats: {
        previewNodeCount: 0,
        semanticNodeCount: 0,
        semanticEdgeCount: 0,
        operationCount: 0,
        sourceAnchorCount: 0,
        foldedNoteCount: 0,
        evidenceNodeCount: 0,
        maxDepth: 0,
      },
      artifactReuse: {
        contentKey: 'unknown',
        planKey: 'unknown',
        reusedSemanticHints: false,
        reusedSemanticUnits: false,
        reusedPlannedStructure: false,
      },
      qualitySignals: {
        warningCount: 0,
        genericTitleCount: 0,
        lowConfidenceNodeCount: 0,
        foldedEvidenceCount: 0,
        duplicateSiblingGroupCount: 0,
        shallowSourceCount: 0,
        needsDeepPassCount: 0,
      },
      applyEstimate: {
        createCount: 0,
        updateCount: 0,
        mergeCount: 0,
        crossFileMergeCount: 0,
        skippedUpdateCount: 0,
      },
      semanticAdjudication: {
        candidateCount: 0,
        representativeCount: 0,
        requestCount: 0,
        adjudicatedCount: 0,
        fallbackCount: 0,
      },
      dirtySubtreeIds: undefined,
      lastEditAction: null,
    }

    return mergeTextImportDiagnostics(base, patch)
  }

  return {
    ...existing,
    ...patch,
    timings: patch.timings ? { ...existing.timings, ...patch.timings } : existing.timings,
    densityStats: patch.densityStats
      ? { ...existing.densityStats, ...patch.densityStats }
      : existing.densityStats,
    artifactReuse: patch.artifactReuse
      ? { ...existing.artifactReuse, ...patch.artifactReuse }
      : existing.artifactReuse,
    qualitySignals: patch.qualitySignals
      ? { ...existing.qualitySignals, ...patch.qualitySignals }
      : existing.qualitySignals,
    applyEstimate: patch.applyEstimate
      ? { ...existing.applyEstimate, ...patch.applyEstimate }
      : existing.applyEstimate,
    semanticAdjudication: patch.semanticAdjudication
      ? { ...existing.semanticAdjudication, ...patch.semanticAdjudication }
      : existing.semanticAdjudication,
  }
}
