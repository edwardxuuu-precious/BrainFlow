import type {
  AiCanvasTarget,
  AiDocumentTopicContext,
  AiImportOperation,
  AiSelectionContext,
  TextImportCrossFileMergeSuggestion,
  TextImportMergeSuggestion,
  TextImportPreviewItem,
  TextImportPreviewNode,
  TextImportRequest,
  TextImportResponse,
  TextImportSemanticAdjudicationResponse,
  TextImportSemanticCandidate,
  TextImportSemanticDecision,
  TextImportSemanticMergeSummary,
  TextImportSemanticTargetSnapshot,
} from '../../../shared/ai-contract'
import type { LocalTextImportBatchRequest } from './local-text-import-core'
import { sortTextImportBatchSources } from './local-text-import-core'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

type SupportedImportRequest = TextImportRequest | LocalTextImportBatchRequest

interface ExistingTopicCandidate {
  topicId: string
  title: string
  note: string
  normalizedTitle: string
  parentNormalizedTitle: string | null
  titleTokens: Set<string>
  contentTokens: Set<string>
  fingerprint: string
}

interface ExistingTopicIndex {
  byExactTitle: Map<string, ExistingTopicCandidate[]>
  all: ExistingTopicCandidate[]
}

interface PreviewNodeMeta {
  id: string
  title: string
  note: string
  parentId: string | null
  parentTitle: string | null
  sourceName: string | null
  pathTitles: string[]
  depth: number
}

interface CandidateBundleBase {
  candidate: TextImportSemanticCandidate
  fallbackDecision: TextImportSemanticDecision
  sourcePreviewNodeId: string
}

interface ExistingCandidateBundle extends CandidateBundleBase {
  scope: 'existing_topic'
  targetTopicId: string
  targetTitle: string
  targetNote: string
  targetFingerprint: string
  sourceNote: string
  sourcePathTitles: string[]
  sourceName: string
}

interface CrossFileCandidateBundle extends CandidateBundleBase {
  scope: 'cross_file'
  matchedPreviewNodeId: string
  matchedSourceName: string
  matchedPathTitles: string[]
  sourceName: string
  sourcePathTitles: string[]
  sourceNote: string
  targetNote: string
}

type CandidateBundle = ExistingCandidateBundle | CrossFileCandidateBundle

export interface TextImportSemanticDraft {
  jobType: 'single' | 'batch'
  insertionParentTopicId: string
  batchTitle: string | null
  candidateBundles: CandidateBundle[]
  previewMetaById: Map<string, PreviewNodeMeta>
  fileOrderBySourceName: Map<string, number>
}

interface ExistingMatchHeuristic {
  kind: 'same_topic' | 'partial_overlap' | 'conflict'
  confidence: 'high' | 'medium'
  reason: string
  target: ExistingTopicCandidate
}

interface CrossFileHeuristic {
  kind: 'same_topic' | 'partial_overlap'
  confidence: 'high' | 'medium'
  reason: string
}

const MAX_NOTE_SUMMARY_LENGTH = 1200
const MAX_CROSS_FILE_CANDIDATES = 120

function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[`~!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|]/g, '')
    .replace(/\s+/g, '')
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .normalize('NFKC')
      .split(/[^\p{Letter}\p{Number}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  )
}

function calculateTokenOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0
  }

  let shared = 0
  const smaller = left.size <= right.size ? left : right
  const larger = smaller === left ? right : left
  smaller.forEach((value) => {
    if (larger.has(value)) {
      shared += 1
    }
  })

  return shared / Math.max(left.size, right.size)
}

function createTopicFingerprint(
  topic: Pick<AiDocumentTopicContext, 'title' | 'note' | 'parentTopicId' | 'metadata' | 'style'>,
): string {
  return JSON.stringify({
    title: topic.title,
    note: topic.note,
    parentId: topic.parentTopicId,
    metadata: topic.metadata,
    style: topic.style,
  })
}

function compactText(value: string | null | undefined): string {
  const normalized = (value ?? '').replace(/\s+\n/g, '\n').trim()
  if (normalized.length <= MAX_NOTE_SUMMARY_LENGTH) {
    return normalized
  }
  return `${normalized.slice(0, MAX_NOTE_SUMMARY_LENGTH)}…`
}

function createSnapshot(
  scope: TextImportSemanticTargetSnapshot['scope'],
  meta: PreviewNodeMeta,
  fingerprint?: string | null,
): TextImportSemanticTargetSnapshot {
  return {
    id: meta.id,
    scope,
    sourceName: meta.sourceName,
    pathTitles: meta.pathTitles,
    title: meta.title,
    noteSummary: compactText(meta.note),
    parentTitle: meta.parentTitle,
    fingerprint: fingerprint ?? null,
  }
}

function collectExistingTopicIndex(context: AiSelectionContext): ExistingTopicIndex {
  const byId = new Map(context.topics.map((topic) => [topic.topicId, topic]))
  const byExactTitle = new Map<string, ExistingTopicCandidate[]>()
  const all: ExistingTopicCandidate[] = []

  for (const topic of context.topics) {
    const normalizedTitle = normalizeTitleForMatch(topic.title)
    if (!normalizedTitle) {
      continue
    }

    const candidate: ExistingTopicCandidate = {
      topicId: topic.topicId,
      title: topic.title,
      note: topic.note,
      normalizedTitle,
      parentNormalizedTitle: topic.parentTopicId
        ? normalizeTitleForMatch(byId.get(topic.parentTopicId)?.title ?? '')
        : null,
      titleTokens: tokenize(topic.title),
      contentTokens: tokenize([topic.title, topic.note].filter(Boolean).join('\n')),
      fingerprint: createTopicFingerprint(topic),
    }

    all.push(candidate)
    const existing = byExactTitle.get(normalizedTitle)
    if (existing) {
      existing.push(candidate)
    } else {
      byExactTitle.set(normalizedTitle, [candidate])
    }
  }

  return { byExactTitle, all }
}

function decideExistingMatch(meta: PreviewNodeMeta, candidates: ExistingTopicCandidate[]): ExistingMatchHeuristic | null {
  const titleTokens = tokenize(meta.title)
  const contentTokens = tokenize([meta.title, meta.note].filter(Boolean).join('\n'))
  const normalizedTitle = normalizeTitleForMatch(meta.title)

  let best:
    | {
        candidate: ExistingTopicCandidate
        score: number
        kind: ExistingMatchHeuristic['kind']
        confidence: ExistingMatchHeuristic['confidence']
        reason: string
      }
    | null = null
  let secondScore = 0

  for (const candidate of candidates) {
    const exactTitle = candidate.normalizedTitle === normalizedTitle
    const titleScore = exactTitle ? 1 : calculateTokenOverlap(titleTokens, candidate.titleTokens)
    const contentScore = calculateTokenOverlap(contentTokens, candidate.contentTokens)
    const parentMatch =
      meta.parentTitle !== null &&
      candidate.parentNormalizedTitle !== null &&
      normalizeTitleForMatch(meta.parentTitle) === candidate.parentNormalizedTitle

    let kind: ExistingMatchHeuristic['kind'] | null = null
    let confidence: ExistingMatchHeuristic['confidence'] = 'medium'
    let score = 0
    let reason = ''

    if (exactTitle && parentMatch) {
      if (contentScore <= 0.12 && meta.note.trim() && candidate.note.trim()) {
        kind = 'conflict'
        score = 0.86
        reason = 'Exact title and parent match, but content diverges enough to keep both sides.'
      } else {
        kind = contentScore >= 0.35 ? 'same_topic' : 'partial_overlap'
        confidence = 'high'
        score = 0.98
        reason = 'Exact title and parent match an existing topic.'
      }
    } else if (exactTitle) {
      kind = contentScore >= 0.4 ? 'same_topic' : 'partial_overlap'
      confidence = 'high'
      score = 0.74 + contentScore * 0.18 + (parentMatch ? 0.08 : 0)
      reason = 'Exact title matches an existing topic.'
    } else {
      const combinedScore = titleScore * 0.62 + contentScore * 0.3 + (parentMatch ? 0.12 : 0)
      if (combinedScore >= 0.84) {
        kind = 'same_topic'
        confidence = 'high'
        score = combinedScore
        reason = 'Title, path and content strongly suggest the same topic.'
      } else if (combinedScore >= 0.66) {
        kind = 'partial_overlap'
        confidence = combinedScore >= 0.76 ? 'high' : 'medium'
        score = combinedScore
        reason = 'Title and content partially overlap with an existing topic.'
      }
    }

    if (!kind) {
      continue
    }

    if (!best || score > best.score) {
      secondScore = best?.score ?? secondScore
      best = { candidate, score, kind, confidence, reason }
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  if (!best) {
    return null
  }

  if (secondScore > 0 && best.score - secondScore < 0.06) {
    return null
  }

  return {
    kind: best.kind,
    confidence: best.confidence,
    reason: best.reason,
    target: best.candidate,
  }
}

function decideCrossFileMatch(left: PreviewNodeMeta, right: PreviewNodeMeta): CrossFileHeuristic | null {
  const leftNormalizedTitle = normalizeTitleForMatch(left.title)
  const rightNormalizedTitle = normalizeTitleForMatch(right.title)
  const titleScore =
    leftNormalizedTitle && leftNormalizedTitle === rightNormalizedTitle
      ? 1
      : calculateTokenOverlap(tokenize(left.title), tokenize(right.title))
  const contentScore = calculateTokenOverlap(
    tokenize([left.title, left.note].filter(Boolean).join('\n')),
    tokenize([right.title, right.note].filter(Boolean).join('\n')),
  )
  const sameParentPath =
    normalizeTitleForMatch(left.pathTitles.slice(0, -1).join('>')) ===
    normalizeTitleForMatch(right.pathTitles.slice(0, -1).join('>'))
  const combinedScore = titleScore * 0.68 + contentScore * 0.22 + (sameParentPath ? 0.1 : 0)

  if (combinedScore < 0.72) {
    return null
  }

  return {
    kind: combinedScore >= 0.88 ? 'same_topic' : 'partial_overlap',
    confidence: combinedScore >= 0.82 ? 'high' : 'medium',
    reason:
      combinedScore >= 0.88
        ? 'Title, path and content strongly overlap across imported files.'
        : 'Imported files share a likely overlapping topic.',
  }
}

function annotateSinglePreview(
  request: TextImportRequest,
  response: TextImportResponse,
): { previewMetaById: Map<string, PreviewNodeMeta>; fileOrderBySourceName: Map<string, number> } {
  const roots = buildTextImportPreviewTree(response.previewNodes)
  const previewMetaById = new Map<string, PreviewNodeMeta>()
  const fileOrderBySourceName = new Map([[request.sourceName, 0]])

  const visit = (
    node: TextImportPreviewNode,
    parentTitle: string | null,
    pathTitles: string[],
    depth: number,
  ) => {
    previewMetaById.set(node.id, {
      id: node.id,
      title: node.title,
      note: node.note ?? '',
      parentId: node.parentId,
      parentTitle,
      sourceName: request.sourceName,
      pathTitles,
      depth,
    })

    node.children.forEach((child) => visit(child, node.title, [...pathTitles, child.title], depth + 1))
  }

  roots.forEach((root) => visit(root, null, [root.title], 0))
  return { previewMetaById, fileOrderBySourceName }
}

function annotateBatchPreview(
  request: LocalTextImportBatchRequest,
  response: TextImportResponse,
): { previewMetaById: Map<string, PreviewNodeMeta>; fileOrderBySourceName: Map<string, number> } {
  const roots = buildTextImportPreviewTree(response.previewNodes)
  const previewMetaById = new Map<string, PreviewNodeMeta>()
  const fileOrderBySourceName = new Map<string, number>()
  const sortedFiles = sortTextImportBatchSources(request.files)
  const responseFiles = response.batch?.files ?? []
  const sourceByRootId = new Map(
    responseFiles.map((fileSummary) => [fileSummary.previewNodeId, fileSummary.sourceName]),
  )
  const batchRoot = roots[0] ?? null

  if (batchRoot) {
    previewMetaById.set(batchRoot.id, {
      id: batchRoot.id,
      title: batchRoot.title,
      note: batchRoot.note ?? '',
      parentId: null,
      parentTitle: null,
      sourceName: null,
      pathTitles: [batchRoot.title],
      depth: 0,
    })

    batchRoot.children.forEach((fileRoot, index) => {
      const sourceName = sourceByRootId.get(fileRoot.id) ?? sortedFiles[index]?.sourceName ?? fileRoot.title
      fileOrderBySourceName.set(sourceName, index)
      const visit = (
        node: TextImportPreviewNode,
        parentTitle: string | null,
        pathTitles: string[],
        depth: number,
      ) => {
        previewMetaById.set(node.id, {
          id: node.id,
          title: node.title,
          note: node.note ?? '',
          parentId: node.parentId,
          parentTitle,
          sourceName,
          pathTitles,
          depth,
        })
        node.children.forEach((child) =>
          visit(child, node.title, [...pathTitles, child.title], depth + 1),
        )
      }

      visit(fileRoot, null, [fileRoot.title], 1)
    })
  }

  return { previewMetaById, fileOrderBySourceName }
}

export function createTextImportSemanticDraft(
  request: SupportedImportRequest,
  response: TextImportResponse,
): TextImportSemanticDraft {
  const { previewMetaById, fileOrderBySourceName } =
    'files' in request ? annotateBatchPreview(request, response) : annotateSinglePreview(request, response)
  const candidateBundles: CandidateBundle[] = []
  const existingIndex = collectExistingTopicIndex(request.context)

  for (const meta of previewMetaById.values()) {
    if (meta.parentId === null || !meta.sourceName) {
      continue
    }

    const normalizedTitle = normalizeTitleForMatch(meta.title)
    if (!normalizedTitle) {
      continue
    }

    const exactCandidates = existingIndex.byExactTitle.get(normalizedTitle) ?? []
    const heuristic = decideExistingMatch(
      meta,
      exactCandidates.length > 0 ? exactCandidates : existingIndex.all,
    )
    if (!heuristic) {
      continue
    }

    const candidateId = `semantic_existing_${meta.id}_${heuristic.target.topicId}`
    candidateBundles.push({
      scope: 'existing_topic',
      sourcePreviewNodeId: meta.id,
      sourceName: meta.sourceName,
      sourceNote: meta.note,
      sourcePathTitles: meta.pathTitles,
      targetTopicId: heuristic.target.topicId,
      targetTitle: heuristic.target.title,
      targetNote: heuristic.target.note,
      targetFingerprint: heuristic.target.fingerprint,
      candidate: {
        candidateId,
        scope: 'existing_topic',
        source: createSnapshot('import_preview', meta),
        target: {
          id: heuristic.target.topicId,
          scope: 'existing_topic',
          sourceName: null,
          pathTitles: [heuristic.target.title],
          title: heuristic.target.title,
          noteSummary: compactText(heuristic.target.note),
          parentTitle: meta.parentTitle,
          fingerprint: heuristic.target.fingerprint,
        },
      },
      fallbackDecision: {
        candidateId,
        kind: heuristic.kind,
        confidence: heuristic.confidence,
        mergedTitle: null,
        mergedSummary: compactText(meta.note),
        evidence: heuristic.reason,
      },
    })
  }

  const importNodes = [...previewMetaById.values()].filter((meta) => meta.parentId !== null && meta.sourceName)
  const seen = new Set<string>()
  let crossFileCount = 0

  for (let leftIndex = 0; leftIndex < importNodes.length; leftIndex += 1) {
    const left = importNodes[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < importNodes.length; rightIndex += 1) {
      const right = importNodes[rightIndex]
      if (!left.sourceName || !right.sourceName || left.sourceName === right.sourceName) {
        continue
      }

      const key = [left.id, right.id].sort().join('::')
      if (seen.has(key)) {
        continue
      }

      const heuristic = decideCrossFileMatch(left, right)
      if (!heuristic) {
        continue
      }

      seen.add(key)
      crossFileCount += 1
      const candidateId = `semantic_cross_${left.id}_${right.id}`
      candidateBundles.push({
        scope: 'cross_file',
        sourcePreviewNodeId: left.id,
        matchedPreviewNodeId: right.id,
        matchedSourceName: right.sourceName,
        matchedPathTitles: right.pathTitles,
        sourceName: left.sourceName,
        sourcePathTitles: left.pathTitles,
        sourceNote: left.note,
        targetNote: right.note,
        candidate: {
          candidateId,
          scope: 'cross_file',
          source: createSnapshot('import_preview', left),
          target: createSnapshot('import_preview', right),
        },
        fallbackDecision: {
          candidateId,
          kind: heuristic.kind,
          confidence: heuristic.confidence,
          mergedTitle: null,
          mergedSummary: compactText([left.note, right.note].filter(Boolean).join('\n\n')),
          evidence: heuristic.reason,
        },
      })

      if (crossFileCount >= MAX_CROSS_FILE_CANDIDATES) {
        break
      }
    }

    if (crossFileCount >= MAX_CROSS_FILE_CANDIDATES) {
      break
    }
  }

  return {
    jobType: 'files' in request ? 'batch' : 'single',
    insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    batchTitle: response.batch?.batchContainerTitle ?? null,
    candidateBundles,
    previewMetaById,
    fileOrderBySourceName,
  }
}

function normalizeDecisionMap(
  draft: TextImportSemanticDraft,
  adjudication: TextImportSemanticAdjudicationResponse | null | undefined,
): Map<string, TextImportSemanticDecision> {
  const candidateIds = new Set(draft.candidateBundles.map((bundle) => bundle.candidate.candidateId))
  const decisionMap = new Map<string, TextImportSemanticDecision>()

  adjudication?.decisions.forEach((decision) => {
    if (candidateIds.has(decision.candidateId)) {
      decisionMap.set(decision.candidateId, decision)
    }
  })

  return decisionMap
}

function cloneResetPreviewNodes(previewNodes: TextImportPreviewItem[]): TextImportPreviewItem[] {
  return previewNodes.map((node) => ({
    ...node,
    relation: 'new',
    matchedTopicId: null,
    reason: null,
  }))
}

function upgradePreviewNodeState(
  node: TextImportPreviewItem,
  relation: TextImportPreviewItem['relation'],
  reason: string,
  matchedTopicId: string | null,
): void {
  if (relation === 'conflict') {
    node.relation = 'conflict'
    node.reason = reason
    node.matchedTopicId = matchedTopicId
    return
  }

  if (node.relation === 'conflict') {
    return
  }

  node.relation = relation
  node.reason = reason
  node.matchedTopicId = matchedTopicId
}

function mergeExistingNote(
  existingNote: string,
  bundle: ExistingCandidateBundle,
  decision: TextImportSemanticDecision,
): string {
  const marker = `[Auto merged import:${bundle.sourceName}:${bundle.sourcePathTitles.join(' > ')}]`
  if (existingNote.includes(marker)) {
    return existingNote
  }

  const mergedSummary = decision.mergedSummary?.trim() || bundle.sourceNote.trim()
  return [
    existingNote.trim(),
    marker,
    `Merge kind: ${decision.kind}`,
    `Evidence: ${decision.evidence}`,
    mergedSummary ? `Merged summary:\n${mergedSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function mergeCanonicalNote(
  existingNote: string | null,
  sourceName: string,
  pathTitles: string[],
  summary: string,
): string | null {
  const marker = `[Auto merged source:${sourceName}:${pathTitles.join(' > ')}]`
  if ((existingNote ?? '').includes(marker)) {
    return existingNote
  }

  return [(existingNote ?? '').trim(), marker, summary.trim()]
    .filter(Boolean)
    .join('\n\n')
    .trim() || null
}

function createUnionFind(nodeIds: Iterable<string>) {
  const parent = new Map<string, string>()
  for (const nodeId of nodeIds) {
    parent.set(nodeId, nodeId)
  }

  const find = (nodeId: string): string => {
    const current = parent.get(nodeId) ?? nodeId
    if (current === nodeId) {
      return current
    }
    const root = find(current)
    parent.set(nodeId, root)
    return root
  }

  const union = (left: string, right: string): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot)
    }
  }

  return { parent, find, union }
}

function clonePreviewTreeForApply(previewNodes: TextImportPreviewItem[]): TextImportPreviewNode[] {
  return buildTextImportPreviewTree(
    previewNodes.map((node) => ({
      ...node,
      relation: 'new',
      matchedTopicId: null,
      reason: null,
    })),
  )
}

function buildApplyNodeIndex(roots: TextImportPreviewNode[]): Map<string, TextImportPreviewNode> {
  const byId = new Map<string, TextImportPreviewNode>()
  const queue = [...roots]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    byId.set(current.id, current)
    queue.push(...current.children)
  }

  return byId
}

function resetChildOrder(node: TextImportPreviewNode): void {
  node.children.forEach((child, index) => {
    child.parentId = node.id
    child.order = index
    resetChildOrder(child)
  })
}

function buildCreateChildOperationsFromTree(
  roots: TextImportPreviewNode[],
  insertionParentTopicId: string,
): AiImportOperation[] {
  const operations: AiImportOperation[] = []

  const visit = (node: TextImportPreviewNode, parentRef: string) => {
    operations.push({
      id: `op_${node.id}`,
      type: 'create_child',
      parent: (
        parentRef.startsWith('topic:') || parentRef.startsWith('ref:')
          ? parentRef
          : `ref:${parentRef}`
      ) as AiCanvasTarget,
      title: node.title,
      note: node.note ?? undefined,
      risk: 'low',
      reason:
        node.relation === 'merge'
          ? 'Imported as a source branch. Semantic merge stays rebase-safe.'
          : 'Safe additive import.',
      resultRef: node.id,
    })
    node.children.forEach((child) => visit(child, node.id))
  }

  roots.forEach((root) => visit(root, `topic:${insertionParentTopicId}`))
  return operations
}

function createSemanticSummary(
  summary: Partial<TextImportSemanticMergeSummary>,
): TextImportSemanticMergeSummary {
  return {
    candidateCount: summary.candidateCount ?? 0,
    adjudicatedCount: summary.adjudicatedCount ?? 0,
    autoMergedExistingCount: summary.autoMergedExistingCount ?? 0,
    autoMergedCrossFileCount: summary.autoMergedCrossFileCount ?? 0,
    conflictCount: summary.conflictCount ?? 0,
    fallbackCount: summary.fallbackCount ?? 0,
  }
}

export function applyTextImportSemanticAdjudication(
  baseResponse: TextImportResponse,
  draft: TextImportSemanticDraft,
  adjudication?: TextImportSemanticAdjudicationResponse | null,
  options?: {
    warnings?: string[]
  },
): TextImportResponse {
  const previewItems = cloneResetPreviewNodes(baseResponse.previewNodes)
  const previewItemById = new Map(previewItems.map((item) => [item.id, item]))
  const decisionMap = normalizeDecisionMap(draft, adjudication)
  const mergeSuggestions: TextImportMergeSuggestion[] = []
  const crossFileMergeSuggestions: TextImportCrossFileMergeSuggestion[] = []
  const existingUpdateAggregates = new Map<
    string,
    {
      fingerprint: string
      targetTitle: string
      targetNote: string
      titleCandidates: Map<string, string>
      noteSections: string[]
    }
  >()
  const highCrossFileBundles: Array<{ bundle: CrossFileCandidateBundle; decision: TextImportSemanticDecision }> = []
  const semanticSummary = createSemanticSummary({
    candidateCount: draft.candidateBundles.length,
  })
  const seenFallbackCandidates = new Set<string>()

  for (const bundle of draft.candidateBundles) {
    const hasAdjudicatedDecision = decisionMap.has(bundle.candidate.candidateId)
    const decision = decisionMap.get(bundle.candidate.candidateId) ?? bundle.fallbackDecision
    if (hasAdjudicatedDecision) {
      semanticSummary.adjudicatedCount += 1
    } else if (!seenFallbackCandidates.has(bundle.candidate.candidateId)) {
      semanticSummary.fallbackCount += 1
      seenFallbackCandidates.add(bundle.candidate.candidateId)
    }

    const sourcePreview = previewItemById.get(bundle.sourcePreviewNodeId)
    if (sourcePreview && decision.kind !== 'distinct') {
      upgradePreviewNodeState(
        sourcePreview,
        decision.kind === 'conflict' ? 'conflict' : 'merge',
        decision.evidence,
        bundle.scope === 'existing_topic' ? bundle.targetTopicId : null,
      )
    }

    if (bundle.scope === 'existing_topic') {
      if (decision.kind === 'conflict') {
        semanticSummary.conflictCount += 1
      }

      if (decision.confidence === 'high' && (decision.kind === 'same_topic' || decision.kind === 'partial_overlap')) {
        semanticSummary.autoMergedExistingCount += 1
        const existing = existingUpdateAggregates.get(bundle.targetTopicId) ?? {
          fingerprint: bundle.targetFingerprint,
          targetTitle: bundle.targetTitle,
          targetNote: bundle.targetNote,
          titleCandidates: new Map<string, string>(),
          noteSections: [],
        }
        const noteBase = existing.noteSections[existing.noteSections.length - 1] ?? existing.targetNote
        const mergedNote = mergeExistingNote(noteBase, bundle, decision)
        if (mergedNote !== noteBase && !existing.noteSections.includes(mergedNote)) {
          existing.noteSections = [...existing.noteSections, mergedNote]
        }
        const mergedTitle = decision.mergedTitle?.trim()
        if (mergedTitle) {
          existing.titleCandidates.set(normalizeTitleForMatch(mergedTitle), mergedTitle)
        }
        existingUpdateAggregates.set(bundle.targetTopicId, existing)
      } else if (decision.kind !== 'distinct') {
        mergeSuggestions.push({
          id: bundle.candidate.candidateId,
          previewNodeId: bundle.sourcePreviewNodeId,
          matchedTopicId: bundle.targetTopicId,
          matchedTopicTitle: bundle.targetTitle,
          kind: decision.kind,
          confidence: decision.confidence,
          reason: decision.evidence,
        })
      }
      continue
    }

    const targetPreview = previewItemById.get(bundle.matchedPreviewNodeId)
    if (targetPreview && decision.kind !== 'distinct') {
      upgradePreviewNodeState(
        targetPreview,
        decision.kind === 'conflict' ? 'conflict' : 'merge',
        decision.evidence,
        null,
      )
    }

    if (decision.kind === 'conflict') {
      semanticSummary.conflictCount += 1
    }

    if (decision.confidence === 'high' && (decision.kind === 'same_topic' || decision.kind === 'partial_overlap')) {
      highCrossFileBundles.push({ bundle, decision })
    } else if (decision.kind !== 'distinct') {
      crossFileMergeSuggestions.push({
        id: bundle.candidate.candidateId,
        previewNodeId: bundle.sourcePreviewNodeId,
        sourceName: bundle.sourceName,
        matchedPreviewNodeId: bundle.matchedPreviewNodeId,
        matchedSourceName: bundle.matchedSourceName,
        matchedTitle: draft.previewMetaById.get(bundle.matchedPreviewNodeId)?.title ?? '',
        kind: decision.kind,
        confidence: decision.confidence,
        reason: decision.evidence,
      })
    }
  }

  const applyRoots = clonePreviewTreeForApply(baseResponse.previewNodes)
  const applyNodeById = buildApplyNodeIndex(applyRoots)
  const unionFind = createUnionFind(
    highCrossFileBundles.flatMap(({ bundle }) => [bundle.sourcePreviewNodeId, bundle.matchedPreviewNodeId]),
  )
  highCrossFileBundles.forEach(({ bundle }) => {
    unionFind.union(bundle.sourcePreviewNodeId, bundle.matchedPreviewNodeId)
  })

  const membersByCluster = new Map<string, string[]>()
  for (const nodeId of unionFind.parent.keys()) {
    const rootId = unionFind.find(nodeId)
    const existingMembers = membersByCluster.get(rootId)
    if (existingMembers) {
      existingMembers.push(nodeId)
    } else {
      membersByCluster.set(rootId, [nodeId])
    }
  }

  const canonicalByCluster = new Map<string, string>()
  const crossFileTitleCandidates = new Map<string, Map<string, string>>()
  const crossFileSummaryByNodeId = new Map<string, string>()
  highCrossFileBundles.forEach(({ bundle, decision }) => {
    const clusterRoot = unionFind.find(bundle.sourcePreviewNodeId)
    const title = decision.mergedTitle?.trim()
    if (title) {
      const titleMap = crossFileTitleCandidates.get(clusterRoot) ?? new Map<string, string>()
      titleMap.set(normalizeTitleForMatch(title), title)
      crossFileTitleCandidates.set(clusterRoot, titleMap)
    }
    if (decision.mergedSummary?.trim()) {
      crossFileSummaryByNodeId.set(bundle.sourcePreviewNodeId, decision.mergedSummary.trim())
      crossFileSummaryByNodeId.set(bundle.matchedPreviewNodeId, decision.mergedSummary.trim())
    }
  })

  membersByCluster.forEach((members, clusterId) => {
    const canonicalId = [...members].sort((left, right) => {
      const leftMeta = draft.previewMetaById.get(left)
      const rightMeta = draft.previewMetaById.get(right)
      const leftFileOrder = leftMeta?.sourceName ? draft.fileOrderBySourceName.get(leftMeta.sourceName) ?? 0 : 0
      const rightFileOrder = rightMeta?.sourceName ? draft.fileOrderBySourceName.get(rightMeta.sourceName) ?? 0 : 0
      if (leftFileOrder !== rightFileOrder) {
        return leftFileOrder - rightFileOrder
      }
      if ((leftMeta?.depth ?? 0) !== (rightMeta?.depth ?? 0)) {
        return (leftMeta?.depth ?? 0) - (rightMeta?.depth ?? 0)
      }
      return left.localeCompare(right)
    })[0]
    canonicalByCluster.set(clusterId, canonicalId)
  })

  const canonicalIdByNodeId = new Map<string, string>()
  canonicalByCluster.forEach((canonicalId, clusterId) => {
    const members = membersByCluster.get(clusterId) ?? []
    members.forEach((memberId) => canonicalIdByNodeId.set(memberId, canonicalId))
  })
  semanticSummary.autoMergedCrossFileCount = Math.max(
    0,
    [...canonicalIdByNodeId.entries()].filter(([nodeId, canonicalId]) => nodeId !== canonicalId).length,
  )

  const parentById = new Map<string, TextImportPreviewNode | null>()
  const visitParents = (node: TextImportPreviewNode, parent: TextImportPreviewNode | null) => {
    parentById.set(node.id, parent)
    node.children.forEach((child) => visitParents(child, node))
  }
  applyRoots.forEach((root) => visitParents(root, null))

  const nonCanonicalNodeIds = [...canonicalIdByNodeId.entries()]
    .filter(([nodeId, canonicalId]) => nodeId !== canonicalId)
    .sort((left, right) => {
      const leftDepth = draft.previewMetaById.get(left[0])?.depth ?? 0
      const rightDepth = draft.previewMetaById.get(right[0])?.depth ?? 0
      return rightDepth - leftDepth
    })

  for (const [nodeId, canonicalId] of nonCanonicalNodeIds) {
    const node = applyNodeById.get(nodeId)
    const canonicalNode = applyNodeById.get(canonicalId)
    const meta = draft.previewMetaById.get(nodeId)
    if (!node || !canonicalNode || !meta) {
      continue
    }

    const summary = crossFileSummaryByNodeId.get(nodeId) ?? node.note ?? node.title
    canonicalNode.note = mergeCanonicalNote(canonicalNode.note, meta.sourceName ?? 'unknown', meta.pathTitles, summary)

    const parent = parentById.get(nodeId)
    if (parent) {
      parent.children = parent.children.filter((child) => child.id !== nodeId)
    }

    node.children.forEach((child) => {
      child.parentId = canonicalNode.id
      canonicalNode.children.push(child)
      parentById.set(child.id, canonicalNode)
    })
    node.children = []
    applyNodeById.delete(nodeId)
  }

  canonicalByCluster.forEach((canonicalId, clusterId) => {
    const titleMap = crossFileTitleCandidates.get(clusterId)
    if (!titleMap || titleMap.size !== 1) {
      return
    }
    const title = [...titleMap.values()][0]
    const node = applyNodeById.get(canonicalId)
    if (node && title.trim()) {
      node.title = title.trim()
    }
  })

  applyRoots.forEach((root) => resetChildOrder(root))
  const structuralOperations = buildCreateChildOperationsFromTree(
    applyRoots,
    draft.insertionParentTopicId,
  )
  const updateOperations: AiImportOperation[] = []

  existingUpdateAggregates.forEach((aggregate, targetTopicId) => {
    const mergedNote = aggregate.noteSections[aggregate.noteSections.length - 1] ?? aggregate.targetNote
    const mergedTitle =
      aggregate.titleCandidates.size === 1 ? [...aggregate.titleCandidates.values()][0] : undefined
    const noteChanged = mergedNote !== aggregate.targetNote
    const titleChanged = Boolean(mergedTitle && mergedTitle !== aggregate.targetTitle)
    if (!noteChanged && !titleChanged) {
      return
    }

    updateOperations.push({
      id: `semantic_update_${targetTopicId}`,
      type: 'update_topic',
      target: `topic:${targetTopicId}`,
      title: titleChanged ? mergedTitle : undefined,
      note: noteChanged ? mergedNote : undefined,
      risk: 'low',
      reason: 'High-confidence semantic merge adjudication.',
      targetFingerprint: aggregate.fingerprint,
    })
  })

  const warnings = [
    ...new Set([
      ...(baseResponse.warnings ?? []),
      ...(adjudication?.warnings ?? []),
      ...(options?.warnings ?? []),
    ]),
  ]
  const semanticMerge = createSemanticSummary(semanticSummary)
  const summary = [
    baseResponse.summary,
    semanticMerge.autoMergedExistingCount > 0
      ? `Auto-merged ${semanticMerge.autoMergedExistingCount} candidates into existing topics.`
      : null,
    semanticMerge.autoMergedCrossFileCount > 0
      ? `Auto-merged ${semanticMerge.autoMergedCrossFileCount} cross-file source nodes.`
      : null,
    semanticMerge.fallbackCount > 0
      ? `${semanticMerge.fallbackCount} candidate decisions fell back to local heuristics.`
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    ...baseResponse,
    summary,
    previewNodes: previewItems,
    operations: [...structuralOperations, ...updateOperations],
    mergeSuggestions,
    crossFileMergeSuggestions,
    semanticMerge,
    warnings,
  }
}
