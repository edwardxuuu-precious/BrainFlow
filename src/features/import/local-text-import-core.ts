import type {
  AiCanvasTarget,
  AiDocumentTopicContext,
  AiImportOperation,
  AiSelectionContext,
  TextImportArchetype,
  TextImportCrossFileMergeSuggestion,
  TextImportMergeSuggestion,
  TextImportPreviewItem,
  TextImportHintKind,
  TextImportPreprocessHint,
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
  TextImportSourceType,
} from '../../../shared/ai-contract'
import {
  assessTextImportStructure,
  buildTextImportQualityWarnings,
  type PreparedTextImportArtifacts,
} from '../../../shared/text-import-semantics'
import { buildImportBundlePreview } from '../../../shared/text-import-layering'
import {
  buildTextImportDiagnostics,
  createEmptyTextImportTimings,
} from './text-import-diagnostics'
import {
  countTextImportHints,
  deriveTextImportTitle,
  preprocessTextToImportHints,
} from './text-import-preprocess'
import {
  composeTextImportBatchPreview,
  type BatchTextImportPreviewSource,
} from './text-import-batch-compose'

export type SemanticMergeStage =
  | 'idle'
  | 'candidate_generation'
  | 'adjudicating'
  | 'review_ready'

export interface LocalTextImportSourceInput {
  sourceName: string
  sourceType: TextImportSourceType
  rawText: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportRequest['semanticHints']
  intent: TextImportRequest['intent']
  archetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
  contentProfile?: TextImportRequest['contentProfile']
  nodeBudget?: TextImportRequest['nodeBudget']
  preparedArtifacts?: PreparedTextImportArtifacts
}

export interface LocalTextImportBatchRequest {
  documentId: string
  documentTitle: string
  baseDocumentUpdatedAt: number
  context: AiSelectionContext
  anchorTopicId: string | null
  batchTitle?: string
  files: LocalTextImportSourceInput[]
}

export interface LocalTextImportBuildMetrics {
  headingCount: number
  listItemCount: number
  tableCount: number
  codeBlockCount: number
  preprocessHintCount: number
  preprocessMs: number
  planningMs: number
  parseTreeMs: number
  batchComposeMs: number
  matchExistingMs: number
  candidateGenMs: number
  semanticMergeMs: number
  buildPreviewMs: number
  applyMs: number
  totalReadyMs: number
  totalNodeCount: number
  edgeCount: number
  mergeSuggestionCount: number
  warningCount: number
}

export interface LocalTextImportBatchFileMetrics extends LocalTextImportBuildMetrics {
  sourceName: string
  sourceType: TextImportSourceType
  totalReadyMs: number
}

export interface LocalTextImportBatchMetrics extends LocalTextImportBuildMetrics {
  fileCount: number
  crossFileSuggestionCount: number
  perFile: LocalTextImportBatchFileMetrics[]
}

export interface LocalTextImportProgressUpdate {
  stage: TextImportRunStage
  message: string
  progress: number
  jobType?: 'single' | 'batch'
  fileCount?: number
  completedFileCount?: number
  currentFileName?: string | null
  semanticMergeStage?: SemanticMergeStage
}

export interface LocalTextImportBuildResult {
  response: TextImportResponse
  metrics: LocalTextImportBuildMetrics
}

export interface LocalTextImportBatchBuildResult {
  response: TextImportResponse
  metrics: LocalTextImportBatchMetrics
}

const STRUCTURED_IMPORT_HINT_KINDS = new Set<TextImportHintKind>([
  'heading',
  'bullet_list',
  'ordered_list',
  'task_list',
  'table',
])

interface LocalImportNode {
  id: string
  parentId: string | null
  title: string
  noteParts: string[]
  children: LocalImportNode[]
  sourceName: string
  pathTitles: string[]
  matchedTopicId: string | null
  relation: TextImportPreviewItem['relation']
  reason: string | null
}

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

interface MutableMetrics {
  headingCount: number
  listItemCount: number
  tableCount: number
  codeBlockCount: number
}

interface SemanticMatchDecision {
  kind: 'same_topic' | 'partial_overlap' | 'conflict'
  confidence: 'high' | 'medium'
  reason: string
  target: ExistingTopicCandidate
}

interface ExistingMatchResult {
  suggestions: TextImportMergeSuggestion[]
  operations: AiImportOperation[]
  warnings: string[]
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function emitProgress(
  onProgress: ((update: LocalTextImportProgressUpdate) => void) | undefined,
  update: LocalTextImportProgressUpdate,
): void {
  onProgress?.({
    ...update,
    progress: clampProgress(update.progress),
  })
}

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
    parentTopicId: topic.parentTopicId,
    metadata: topic.metadata,
    style: topic.style,
  })
}

function getNodeSummary(node: LocalImportNode): string {
  return [node.title, node.noteParts.join('\n\n')].filter(Boolean).join('\n').trim()
}

function buildMergedNote(
  existingNote: string,
  importedNote: string,
  sourceName: string,
  pathTitles: string[],
  kind: 'same_topic' | 'partial_overlap',
): string {
  const pathKey = pathTitles.join(' > ')
  const marker = `[Auto merged import:${sourceName}:${pathKey}]`
  if (existingNote.includes(marker)) {
    return existingNote
  }

  return [
    existingNote.trim(),
    marker,
    `Merge kind: ${kind}`,
    `Import source: ${sourceName}`,
    `Import path: ${pathKey}`,
    importedNote.trim() ? `Imported content:\n${importedNote.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
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

function flattenNodes(root: LocalImportNode, includeRoot = false): LocalImportNode[] {
  const result: LocalImportNode[] = []
  const queue = includeRoot ? [root] : [...root.children]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    result.push(current)
    queue.unshift(...current.children)
  }

  return result
}

function getParentNormalizedTitle(node: LocalImportNode, byId: Map<string, LocalImportNode>): string | null {
  if (!node.parentId) {
    return null
  }
  const parent = byId.get(node.parentId)
  return parent ? normalizeTitleForMatch(parent.title) : null
}

function decideSemanticMatch(
  node: LocalImportNode,
  parentNormalizedTitle: string | null,
  candidates: ExistingTopicCandidate[],
): SemanticMatchDecision | null {
  const titleTokens = tokenize(node.title)
  const contentTokens = tokenize(getNodeSummary(node))
  const normalizedTitle = normalizeTitleForMatch(node.title)

  let best:
    | {
        candidate: ExistingTopicCandidate
        score: number
        kind: SemanticMatchDecision['kind']
        confidence: SemanticMatchDecision['confidence']
        reason: string
      }
    | null = null
  let secondScore = 0

  for (const candidate of candidates) {
    const exactTitle = candidate.normalizedTitle === normalizedTitle
    const titleScore = exactTitle ? 1 : calculateTokenOverlap(titleTokens, candidate.titleTokens)
    const contentScore = calculateTokenOverlap(contentTokens, candidate.contentTokens)
    const parentMatch =
      parentNormalizedTitle !== null &&
      candidate.parentNormalizedTitle !== null &&
      parentNormalizedTitle === candidate.parentNormalizedTitle

    let kind: SemanticMatchDecision['kind'] | null = null
    let confidence: SemanticMatchDecision['confidence'] = 'medium'
    let score = 0
    let reason = ''

    if (exactTitle && parentMatch) {
      if (contentScore <= 0.12 && node.noteParts.length > 0 && candidate.note.trim()) {
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

function matchExistingTopics(
  root: LocalImportNode,
  context: AiSelectionContext,
): ExistingMatchResult {
  const index = collectExistingTopicIndex(context)
  const byId = new Map(flattenNodes(root, true).map((node) => [node.id, node]))
  const suggestions: TextImportMergeSuggestion[] = []
  const operations: AiImportOperation[] = []
  const warnings: string[] = []

  for (const node of byId.values()) {
    if (node.parentId === null) {
      continue
    }

    const normalizedTitle = normalizeTitleForMatch(node.title)
    if (!normalizedTitle) {
      continue
    }

    const exactCandidates = index.byExactTitle.get(normalizedTitle) ?? []
    const parentNormalizedTitle = getParentNormalizedTitle(node, byId)
    const decision = decideSemanticMatch(
      node,
      parentNormalizedTitle,
      exactCandidates.length > 0 ? exactCandidates : index.all,
    )

    if (!decision) {
      if (exactCandidates.length > 1) {
        warnings.push(
          `"${node.title}" matched ${exactCandidates.length} existing topics and was kept as a new branch.`,
        )
      }
      continue
    }

    node.matchedTopicId = decision.target.topicId
    node.relation = decision.kind === 'conflict' ? 'conflict' : 'merge'
    node.reason = decision.reason

    suggestions.push({
      id: `merge_${node.id}`,
      previewNodeId: node.id,
      matchedTopicId: decision.target.topicId,
      matchedTopicTitle: decision.target.title,
      kind: decision.kind,
      confidence: decision.confidence,
      reason: decision.reason,
    })

    if (decision.confidence !== 'high' || decision.kind === 'conflict') {
      continue
    }

    const importedNote = node.noteParts.join('\n\n').trim()
    const mergedNote = buildMergedNote(
      decision.target.note,
      importedNote,
      node.sourceName,
      node.pathTitles,
      decision.kind,
    )

    if (mergedNote === decision.target.note) {
      continue
    }

    operations.push({
      id: `merge_update_${node.id}`,
      type: 'update_topic',
      target: `topic:${decision.target.topicId}`,
      note: mergedNote,
      risk: 'low',
      reason: decision.reason,
      targetFingerprint: decision.target.fingerprint,
    })
  }

  return { suggestions, operations, warnings }
}

function resetSubtreePaths(node: LocalImportNode, parentPathTitles: string[]): void {
  node.pathTitles = [...parentPathTitles, node.title]
  for (const child of node.children) {
    resetSubtreePaths(child, node.pathTitles)
  }
}

function flattenPreviewItems(root: LocalImportNode): TextImportPreviewItem[] {
  const previewItems: TextImportPreviewItem[] = []

  function visit(node: LocalImportNode): void {
    node.children.forEach((child, index) => {
      previewItems.push({
        id: child.id,
        parentId: child.parentId,
        order: index,
        title: child.title,
        note: child.noteParts.join('\n\n').trim() || null,
        relation: child.relation,
        matchedTopicId: child.matchedTopicId,
        reason: child.reason,
      })
      visit(child)
    })
  }

  previewItems.push({
    id: root.id,
    parentId: null,
    order: 0,
    title: root.title,
    note: root.noteParts.join('\n\n').trim() || null,
    relation: root.relation,
    matchedTopicId: root.matchedTopicId,
    reason: root.reason,
  })
  visit(root)

  return previewItems
}

function buildCreateChildOperations(
  root: LocalImportNode,
  documentRootTopicId: string,
): AiImportOperation[] {
  const operations: AiImportOperation[] = []

  function visit(node: LocalImportNode, parentRef: string): void {
    operations.push({
      id: `op_${node.id}`,
      type: 'create_child',
      parent: (
        parentRef.startsWith('topic:') || parentRef.startsWith('ref:')
          ? parentRef
          : `ref:${parentRef}`
      ) as AiCanvasTarget,
      title: node.title,
      note: node.noteParts.join('\n\n').trim() || undefined,
      risk: 'low',
      reason:
        node.relation === 'merge'
          ? 'Imported as a source branch. Semantic merge stays rebase-safe.'
          : 'Safe additive import.',
      resultRef: node.id,
    })

    for (const child of node.children) {
      visit(child, node.id)
    }
  }

  visit(root, `topic:${documentRootTopicId}`)
  return operations
}

function countEdges(root: LocalImportNode): number {
  let edgeCount = 0
  const queue = [root]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    edgeCount += current.children.length
    queue.push(...current.children)
  }

  return edgeCount
}

function getFileHierarchyKey(sourceName: string): number[] {
  const normalized = sourceName.replace(/\.[^.]+$/, '')
  if (/main/i.test(normalized)) {
    return [0]
  }

  const match = normalized.match(/step(\d+(?:-\d+)*)/i)
  if (!match) {
    return [Number.MAX_SAFE_INTEGER, normalized.length]
  }

  return [1, ...match[1].split('-').map((value) => Number.parseInt(value, 10) || 0)]
}

export function sortTextImportBatchSources<T extends Pick<LocalTextImportSourceInput, 'sourceName'>>(
  sources: T[],
): T[] {
  return [...sources].sort((left, right) => {
    const leftKey = getFileHierarchyKey(left.sourceName)
    const rightKey = getFileHierarchyKey(right.sourceName)
    const maxLength = Math.max(leftKey.length, rightKey.length)
    for (let index = 0; index < maxLength; index += 1) {
      const diff = (leftKey[index] ?? -1) - (rightKey[index] ?? -1)
      if (diff !== 0) {
        return diff
      }
    }
    return left.sourceName.localeCompare(right.sourceName)
  })
}

export function buildTextImportBatchTitle(
  files: Pick<LocalTextImportSourceInput, 'sourceName'>[],
  explicitTitle?: string,
): string {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim()
  }

  const prefixes = files
    .map((file) => file.sourceName.replace(/\.[^.]+$/, ''))
    .map((name) => name.split(/[_-]/)[0])
    .filter(Boolean)

  const prefix = prefixes.every((item) => item === prefixes[0]) ? prefixes[0] : 'Batch'
  return `Import batch: ${prefix}`
}

function createBatchRoot(batchTitle: string): LocalImportNode {
  return {
    id: 'batch_root_1',
    parentId: null,
    title: batchTitle,
    noteParts: [],
    children: [],
    sourceName: batchTitle,
    pathTitles: [batchTitle],
    matchedTopicId: null,
    relation: 'new',
    reason: null,
  }
}

function createCrossFileMergeSuggestions(roots: LocalImportNode[]): TextImportCrossFileMergeSuggestion[] {
  const suggestions: TextImportCrossFileMergeSuggestion[] = []
  const seen = new Set<string>()
  const nodes = roots.flatMap((root) =>
    flattenNodes(root, true).filter((node) => node.parentId !== null),
  )

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]
    const leftNormalizedTitle = normalizeTitleForMatch(left.title)
    const leftTokens = tokenize(getNodeSummary(left))
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]
      if (left.sourceName === right.sourceName) {
        continue
      }

      const key = [left.id, right.id].sort().join('::')
      if (seen.has(key)) {
        continue
      }

      const rightNormalizedTitle = normalizeTitleForMatch(right.title)
      const titleScore =
        leftNormalizedTitle && leftNormalizedTitle === rightNormalizedTitle
          ? 1
          : calculateTokenOverlap(tokenize(left.title), tokenize(right.title))
      const contentScore = calculateTokenOverlap(leftTokens, tokenize(getNodeSummary(right)))
      const sameParentPath =
        normalizeTitleForMatch(left.pathTitles.slice(0, -1).join('>')) ===
        normalizeTitleForMatch(right.pathTitles.slice(0, -1).join('>'))
      const combinedScore = titleScore * 0.68 + contentScore * 0.22 + (sameParentPath ? 0.1 : 0)

      if (combinedScore < 0.72) {
        continue
      }

      seen.add(key)
      suggestions.push({
        id: `cross_${left.id}_${right.id}`,
        previewNodeId: left.id,
        sourceName: left.sourceName,
        matchedPreviewNodeId: right.id,
        matchedSourceName: right.sourceName,
        matchedTitle: right.title,
        kind: combinedScore >= 0.88 ? 'same_topic' : 'partial_overlap',
        confidence: combinedScore >= 0.82 ? 'high' : 'medium',
        reason:
          combinedScore >= 0.88
            ? 'Title, path and content strongly overlap across imported files.'
            : 'Imported files share a likely overlapping topic.',
      })
    }
  }

  return suggestions.slice(0, 120)
}

// Retained for the existing merge heuristics while the semantic planner rollout is in progress.
const LEGACY_LOCAL_IMPORT_HELPERS = [
  matchExistingTopics,
  resetSubtreePaths,
  flattenPreviewItems,
  buildCreateChildOperations,
  countEdges,
  createBatchRoot,
  createCrossFileMergeSuggestions,
] as const

void LEGACY_LOCAL_IMPORT_HELPERS

export function shouldUseLocalMarkdownImport(request: TextImportRequest): boolean {
  const semanticHints =
    request.semanticHints.length > 0
      ? request.semanticHints
      : []
  const structure = assessTextImportStructure({
    sourceName: request.sourceName,
    preprocessedHints: request.preprocessedHints,
    semanticHints,
  })
  if (structure.recommendedRoute === 'local_markdown') {
    return true
  }

  const structuredHintCount = request.preprocessedHints.filter((hint) =>
    STRUCTURED_IMPORT_HINT_KINDS.has(hint.kind),
  ).length
  return structuredHintCount >= 3 || /^#{1,6}\s+/m.test(request.rawText)
}

export function isMarkdownImportSourceFile(
  sourceName: string,
  sourceType: TextImportSourceType,
): boolean {
  const normalizedSourceName = sourceName.trim().toLowerCase()
  return (
    sourceType === 'file' &&
    (normalizedSourceName.endsWith('.md') || normalizedSourceName.endsWith('.markdown'))
  )
}

export function createLocalTextImportPreview(
  request: TextImportRequest,
  options?: {
    onProgress?: (update: LocalTextImportProgressUpdate) => void
    preprocessHintCount?: number
    preparedArtifacts?: PreparedTextImportArtifacts
    now?: () => number
  },
): LocalTextImportBuildResult {
  const now = options?.now ?? Date.now
  const totalStartedAt = now()
  let preprocessMs = 0
  const effectiveHints =
    request.preprocessedHints.length > 0
      ? request.preprocessedHints
      : (() => {
          const preprocessStartedAt = now()
          const hints = preprocessTextToImportHints(request.rawText)
          preprocessMs = now() - preprocessStartedAt
          return hints
        })()
  const metrics: MutableMetrics = {
    headingCount: effectiveHints.filter((hint) => hint.kind === 'heading').length,
    listItemCount: effectiveHints.filter((hint) =>
      hint.kind === 'bullet_list' || hint.kind === 'ordered_list' || hint.kind === 'task_list',
    ).length,
    tableCount: effectiveHints.filter((hint) => hint.kind === 'table').length,
    codeBlockCount: effectiveHints.filter((hint) => hint.kind === 'code_block').length,
  }

  emitProgress(options?.onProgress, {
    stage: 'parsing_markdown',
    message: 'Parsing Markdown structure...',
    progress: 18,
    jobType: 'single',
    fileCount: 1,
    completedFileCount: 0,
    currentFileName: request.sourceName,
  })
  const parseTreeStartedAt = now()
  const sourceTitle = deriveTextImportTitle(request.sourceName, request.rawText)
  const preparedArtifacts =
    options?.preparedArtifacts ??
    (request as TextImportRequest & { preparedArtifacts?: PreparedTextImportArtifacts })
      .preparedArtifacts
  const layered = buildImportBundlePreview({
    bundleId: `bundle_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    bundleTitle: `Import: ${sourceTitle}`,
    anchorTopicId: request.anchorTopicId,
    createdAt: now(),
    sources: [
      {
        sourceName: request.sourceName,
        sourceType: request.sourceType,
        rawText: request.rawText,
        preprocessedHints: effectiveHints,
        semanticHints: preparedArtifacts?.semanticHints ?? request.semanticHints,
      },
    ],
    requestIntent: request.intent,
    requestedArchetype: request.archetype,
    requestedArchetypeMode: request.archetypeMode,
    requestedContentProfile: request.contentProfile,
    requestedNodeBudget: request.nodeBudget,
    fallbackInsertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    precomputedPlan: preparedArtifacts?.plannedStructure,
  })
  const parseTreeMs = now() - parseTreeStartedAt

  emitProgress(options?.onProgress, {
    stage: 'semantic_candidate_generation',
    message:
      request.intent === 'distill_structure'
        ? 'Distilling semantic node plans...'
        : 'Preparing semantic import plans...',
    progress: 48,
    jobType: 'single',
    fileCount: 1,
    completedFileCount: 0,
    currentFileName: request.sourceName,
    semanticMergeStage: 'candidate_generation',
  })
  const candidateGenStartedAt = now()
  const previewNodes = layered.previewNodes
  const operations = layered.operations
  const candidateGenMs = now() - candidateGenStartedAt

  emitProgress(options?.onProgress, {
    stage: 'semantic_adjudication',
    message: 'Reviewing semantic structure quality...',
    progress: 76,
    jobType: 'single',
    fileCount: 1,
    completedFileCount: 0,
    currentFileName: request.sourceName,
    semanticMergeStage: 'adjudicating',
  })
  const semanticMergeStartedAt = now()
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes,
    nodeBudget: request.nodeBudget,
  })
  const semanticMergeMs = now() - semanticMergeStartedAt

  emitProgress(options?.onProgress, {
    stage: 'building_preview',
    message: 'Finalizing import preview...',
    progress: 96,
    jobType: 'single',
    fileCount: 1,
    completedFileCount: 1,
    currentFileName: request.sourceName,
    semanticMergeStage: 'review_ready',
  })
  const buildPreviewStartedAt = now()
  const summary =
    request.intent === 'distill_structure'
      ? `Built a distilled ${layered.classification.archetype} import bundle with ${previewNodes.length} thinking-view nodes.`
      : `Built a three-layer import bundle with ${previewNodes.length} thinking-view nodes while classifying the content as ${layered.classification.archetype}.`
  const response: TextImportResponse = {
    summary,
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    classification: layered.classification,
    templateSummary: layered.templateSummary,
    bundle: layered.bundle,
    sources: layered.sources,
    semanticNodes: layered.semanticNodes,
    semanticEdges: layered.semanticEdges,
    views: layered.views,
    viewProjections: layered.viewProjections,
    defaultViewId: layered.defaultViewId,
    activeViewId: layered.activeViewId,
    nodePlans: layered.nodePlans,
    previewNodes,
    operations,
    conflicts: [],
    mergeSuggestions: [],
    crossFileMergeSuggestions: [],
    semanticMerge: {
      candidateCount: 0,
      adjudicatedCount: 0,
      autoMergedExistingCount: 0,
      autoMergedCrossFileCount: 0,
      conflictCount: 0,
      fallbackCount: 0,
    },
    warnings: qualityWarnings,
    diagnostics: buildTextImportDiagnostics({
      timings: createEmptyTextImportTimings({
        preprocessMs,
        planningMs: 0,
        parseTreeMs,
        batchComposeMs: 0,
        semanticCandidateMs: candidateGenMs,
        semanticAdjudicationMs: semanticMergeMs,
        previewEditMs: 0,
        applyMs: 0,
        totalMs: now() - totalStartedAt,
      }),
      response: {
        previewNodes,
        semanticNodes: layered.semanticNodes,
        semanticEdges: layered.semanticEdges,
        operations,
        warnings: qualityWarnings,
        mergeSuggestions: [],
        crossFileMergeSuggestions: [],
      },
      artifactReuse:
        preparedArtifacts?.artifactReuse ?? {
          contentKey: `inline:${request.sourceName}`,
          planKey: `inline:${request.sourceName}:${request.intent}`,
          reusedSemanticHints: false,
          reusedSemanticUnits: false,
          reusedPlannedStructure: false,
        },
      planningSummaries: preparedArtifacts
        ? [
            {
              sourceName: request.sourceName,
              sourceType: request.sourceType,
              resolvedPreset: request.intent === 'preserve_structure' ? 'preserve' : 'distill',
              resolvedArchetype: request.archetype ?? layered.classification.archetype,
              confidence: 'medium',
              presetConfidence: 'medium',
              archetypeConfidence: 'medium',
              structureScore: preparedArtifacts.structure.score,
              structureConfidence: preparedArtifacts.structure.confidence,
              recommendedRoute: preparedArtifacts.structure.recommendedRoute,
              isShallowPass: preparedArtifacts.structure.isShallowPass,
              needsDeepPass: preparedArtifacts.structure.needsDeepPass,
              rationale: layered.classification.rationale,
              presetRationale: layered.classification.rationale,
              archetypeRationale: layered.classification.rationale,
              isManual: false,
            },
          ]
        : undefined,
    }),
    batch: {
      jobType: 'single',
      fileCount: 1,
      completedFileCount: 1,
      currentFileName: null,
      batchContainerTitle: null,
      files: [
        {
          sourceName: request.sourceName,
          sourceType: request.sourceType,
          previewNodeId: previewNodes[0]?.id ?? 'import_root',
          nodeCount: previewNodes.length,
          sourceRole: 'canonical_knowledge',
          canonicalTopicId: `topic_source_1`,
          sameAsTopicId: null,
          mergeMode: 'create_new',
          mergeConfidence: 1,
          semanticFingerprint: `fingerprint_source_1`,
          mergeSuggestionCount: 0,
          warningCount: qualityWarnings.length,
          classification: layered.classification,
          templateSummary: layered.templateSummary,
        },
      ],
    },
  }
  const buildPreviewMs = now() - buildPreviewStartedAt

  return {
    response,
    metrics: {
      headingCount: metrics.headingCount,
      listItemCount: metrics.listItemCount,
      tableCount: metrics.tableCount,
      codeBlockCount: metrics.codeBlockCount,
      preprocessHintCount:
        options?.preprocessHintCount ?? countTextImportHints(effectiveHints),
      preprocessMs,
      planningMs: 0,
      parseTreeMs,
      batchComposeMs: 0,
      matchExistingMs: candidateGenMs + semanticMergeMs,
      candidateGenMs,
      semanticMergeMs,
      buildPreviewMs,
      applyMs: 0,
      totalReadyMs: now() - totalStartedAt,
      totalNodeCount: previewNodes.length,
      edgeCount: Math.max(0, previewNodes.filter((node) => node.parentId !== null).length),
      mergeSuggestionCount: 0,
      warningCount: qualityWarnings.length,
    },
  }
}

export function createLocalTextImportBatchPreview(
  request: LocalTextImportBatchRequest,
  options?: {
    onProgress?: (update: LocalTextImportProgressUpdate) => void
    now?: () => number
  },
): LocalTextImportBatchBuildResult {
  const now = options?.now ?? Date.now
  const files = sortTextImportBatchSources(request.files)
  const perFile: LocalTextImportBatchFileMetrics[] = []
  const builtFiles: BatchTextImportPreviewSource[] = []
  let aggregateMetrics: MutableMetrics = {
    headingCount: 0,
    listItemCount: 0,
    tableCount: 0,
    codeBlockCount: 0,
  }
  let preprocessHintCount = 0
  let parseTreeMs = 0
  let candidateGenMs = 0
  let semanticMergeMs = 0

  files.forEach((file, index) => {
    emitProgress(options?.onProgress, {
      stage: 'parsing_markdown',
      message: `Parsing ${file.sourceName}...`,
      progress: 8 + (index / Math.max(1, files.length)) * 42,
      jobType: 'batch',
      fileCount: files.length,
      completedFileCount: index,
      currentFileName: file.sourceName,
    })

    const fileStartedAt = now()
    const built = createLocalTextImportPreview(
      {
        documentId: request.documentId,
        documentTitle: request.documentTitle,
        baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
        context: request.context,
        anchorTopicId: request.anchorTopicId,
        sourceName: file.sourceName,
        sourceType: file.sourceType,
        rawText: file.rawText,
        intent: file.intent,
        archetype: file.archetype,
        archetypeMode: file.archetypeMode,
        contentProfile: file.contentProfile,
        nodeBudget: file.nodeBudget,
        preprocessedHints: file.preprocessedHints,
        semanticHints: file.semanticHints,
      },
      {
        preprocessHintCount: file.preprocessedHints.length,
        preparedArtifacts: file.preparedArtifacts,
        now,
      },
    )
    parseTreeMs += built.metrics.parseTreeMs
    candidateGenMs += built.metrics.candidateGenMs
    semanticMergeMs += built.metrics.semanticMergeMs

    emitProgress(options?.onProgress, {
      stage: 'semantic_candidate_generation',
      message: `Compiling semantic node plans for ${file.sourceName}...`,
      progress: 52 + (index / Math.max(1, files.length)) * 14,
      jobType: 'batch',
      fileCount: files.length,
      completedFileCount: index,
      currentFileName: file.sourceName,
      semanticMergeStage: 'candidate_generation',
    })
    builtFiles.push({
      ...file,
      route: 'local_markdown',
      response: built.response,
    })

    aggregateMetrics = {
      headingCount: aggregateMetrics.headingCount + built.metrics.headingCount,
      listItemCount: aggregateMetrics.listItemCount + built.metrics.listItemCount,
      tableCount: aggregateMetrics.tableCount + built.metrics.tableCount,
      codeBlockCount: aggregateMetrics.codeBlockCount + built.metrics.codeBlockCount,
    }
    preprocessHintCount += countTextImportHints(file.preprocessedHints)

    perFile.push({
      sourceName: file.sourceName,
      sourceType: file.sourceType,
      preprocessHintCount: countTextImportHints(file.preprocessedHints),
      headingCount: built.metrics.headingCount,
      listItemCount: built.metrics.listItemCount,
      tableCount: built.metrics.tableCount,
      codeBlockCount: built.metrics.codeBlockCount,
      preprocessMs: built.metrics.preprocessMs,
      planningMs: built.metrics.planningMs,
      parseTreeMs: built.metrics.parseTreeMs,
      batchComposeMs: built.metrics.batchComposeMs,
      matchExistingMs: built.metrics.matchExistingMs,
      candidateGenMs: built.metrics.candidateGenMs,
      semanticMergeMs: built.metrics.semanticMergeMs,
      buildPreviewMs: built.metrics.buildPreviewMs,
      applyMs: built.metrics.applyMs,
      totalNodeCount: built.metrics.totalNodeCount,
      edgeCount: built.metrics.edgeCount,
      mergeSuggestionCount: 0,
      warningCount: built.metrics.warningCount,
      totalReadyMs: now() - fileStartedAt,
    })
  })

  emitProgress(options?.onProgress, {
    stage: 'semantic_adjudication',
    message: 'Reviewing batch import structure quality...',
    progress: 74,
    jobType: 'batch',
    fileCount: files.length,
    completedFileCount: files.length,
    currentFileName: null,
    semanticMergeStage: 'adjudicating',
  })
  const semanticStartedAt = now()
  const response = composeTextImportBatchPreview(request, builtFiles)
  const previewNodes = response.previewNodes
  const batchComposeMs = now() - semanticStartedAt
  semanticMergeMs += batchComposeMs

  emitProgress(options?.onProgress, {
    stage: 'building_preview',
    message: 'Finalizing batch import preview...',
    progress: 96,
    jobType: 'batch',
    fileCount: files.length,
    completedFileCount: files.length,
    currentFileName: null,
    semanticMergeStage: 'review_ready',
  })
  const buildPreviewMs = 0

  return {
    response: {
      ...response,
      diagnostics: buildTextImportDiagnostics({
        timings: createEmptyTextImportTimings({
          preprocessMs: 0,
          planningMs: 0,
          parseTreeMs,
          batchComposeMs,
          semanticCandidateMs: candidateGenMs,
          semanticAdjudicationMs: semanticMergeMs,
          previewEditMs: 0,
          applyMs: 0,
          totalMs: parseTreeMs + candidateGenMs + semanticMergeMs + buildPreviewMs,
        }),
        response,
        artifactReuse: {
          contentKey: `batch:${files.length}`,
          planKey: `batch:${files.map((file) => file.sourceName).join('|')}`,
          reusedSemanticHints: files.some(
            (file) => file.preparedArtifacts?.artifactReuse.reusedSemanticHints,
          ),
          reusedSemanticUnits: files.some(
            (file) => file.preparedArtifacts?.artifactReuse.reusedSemanticUnits,
          ),
          reusedPlannedStructure: files.some(
            (file) => file.preparedArtifacts?.artifactReuse.reusedPlannedStructure,
          ),
        },
        planningSummaries: files
          .filter((file) => Boolean(file.preparedArtifacts))
          .map((file) => ({
            sourceName: file.sourceName,
            sourceType: file.sourceType,
            resolvedPreset: file.intent === 'preserve_structure' ? ('preserve' as const) : ('distill' as const),
            resolvedArchetype: file.archetype ?? response.classification.archetype,
            confidence: 'medium' as const,
            presetConfidence: 'medium' as const,
            archetypeConfidence: 'medium' as const,
            structureScore: file.preparedArtifacts?.structure.score ?? 0,
            structureConfidence: file.preparedArtifacts?.structure.confidence ?? 0,
            recommendedRoute:
              file.preparedArtifacts?.structure.recommendedRoute ?? ('local_markdown' as const),
            isShallowPass: file.preparedArtifacts?.structure.isShallowPass ?? false,
            needsDeepPass: file.preparedArtifacts?.structure.needsDeepPass ?? false,
            rationale: response.classification.rationale,
            presetRationale: response.classification.rationale,
            archetypeRationale: response.classification.rationale,
            isManual: false,
          })),
      }),
    },
    metrics: {
      headingCount: aggregateMetrics.headingCount,
      listItemCount: aggregateMetrics.listItemCount,
      tableCount: aggregateMetrics.tableCount,
      codeBlockCount: aggregateMetrics.codeBlockCount,
      preprocessHintCount,
      preprocessMs: 0,
      planningMs: 0,
      parseTreeMs,
      batchComposeMs,
      matchExistingMs: candidateGenMs + semanticMergeMs,
      candidateGenMs,
      semanticMergeMs,
      buildPreviewMs,
      applyMs: 0,
      totalReadyMs: parseTreeMs + candidateGenMs + semanticMergeMs + buildPreviewMs,
      totalNodeCount: previewNodes.length,
      edgeCount: Math.max(0, previewNodes.filter((node) => node.parentId !== null).length),
      mergeSuggestionCount: 0,
      warningCount: response.warnings?.length ?? 0,
      fileCount: files.length,
      crossFileSuggestionCount: 0,
      perFile,
    },
  }
}
