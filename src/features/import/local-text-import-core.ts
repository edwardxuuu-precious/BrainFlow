import { toString } from 'mdast-util-to-string'
import type { Content, ListItem, Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type {
  AiCanvasTarget,
  AiDocumentTopicContext,
  AiImportOperation,
  AiSelectionContext,
  TextImportArchetype,
  TextImportCrossFileMergeSuggestion,
  TextImportClassification,
  TextImportMergeSuggestion,
  TextImportPreviewItem,
  TextImportHintKind,
  TextImportPreprocessHint,
  TextImportPreviewNode,
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
  TextImportSourceType,
  TextImportNodePlan,
  TextImportSemanticRole,
  TextImportTemplateSummary,
} from '../../../shared/ai-contract'
import {
  buildTextImportQualityWarnings,
  compileTextImportPreviewNodesToOperations,
  compileTextImportNodePlans,
  deriveTextImportNodePlansFromPreviewNodes,
  inferTextImportSemanticHintKind,
  detectTextImportContentProfile,
  planTextImportFromSemanticHints,
  resolveTextImportNodeBudget,
} from '../../../shared/text-import-semantics'
import {
  countTextImportHints,
  deriveTextImportTitle,
  preprocessTextToImportHints,
} from './text-import-preprocess'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

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
  parseTreeMs: number
  matchExistingMs: number
  candidateGenMs: number
  semanticMergeMs: number
  buildPreviewMs: number
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

function createNodeFactory(prefix: string) {
  let counter = 0
  return (
    title: string,
    parentId: string | null,
    sourceName: string,
    pathTitles: string[],
  ): LocalImportNode => ({
    id: `${prefix}_${counter += 1}`,
    parentId,
    title: title.trim() || 'Untitled',
    noteParts: [],
    children: [],
    sourceName,
    pathTitles,
    matchedTopicId: null,
    relation: 'new',
    reason: null,
  })
}

function appendNote(target: LocalImportNode, value: string): void {
  const normalized = value.trim()
  if (!normalized) {
    return
  }
  target.noteParts.push(normalized)
}

function renderCodeBlock(value: { lang?: string | null; value?: string | null }): string {
  const language = value.lang?.trim() ?? ''
  const content = value.value?.trimEnd() ?? ''
  return ['```' + language, content, '```'].join('\n').trim()
}

function renderTable(node: Content): string {
  const rows = ((node as { children?: Array<{ children?: Array<{ children?: Content[] }> }> }).children ??
    []) as Array<{ children?: Array<{ children?: Content[] }> }>

  return rows
    .map((row) =>
      `| ${((row.children ?? []) as Array<{ children?: Content[] }>)
        .map((cell) => toString({ type: 'root', children: cell.children ?? [] } as Root).trim())
        .join(' | ')} |`,
    )
    .join('\n')
    .trim()
}

function normalizeParagraphText(node: Content | undefined): string {
  if (!node) {
    return ''
  }
  return toString(node).replace(/\s+\n/g, '\n').trim()
}

function splitFirstLine(value: string): { title: string; note: string } {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized) {
    return { title: 'Untitled', note: '' }
  }

  const [firstLine, ...rest] = normalized.split('\n')
  return {
    title: firstLine.trim() || 'Untitled',
    note: rest.join('\n').trim(),
  }
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

function createListItemNode(
  item: ListItem,
  parent: LocalImportNode,
  createNode: ReturnType<typeof createNodeFactory>,
  metrics: MutableMetrics,
): LocalImportNode {
  metrics.listItemCount += 1
  const paragraphChild = item.children.find((child) => child.type === 'paragraph')
  const paragraphText = normalizeParagraphText(paragraphChild)
  const prefix = typeof item.checked === 'boolean' ? `[${item.checked ? 'x' : ' '}] ` : ''
  const { title, note } = splitFirstLine(paragraphText)
  const listNode = createNode(
    `${prefix}${title}`,
    parent.id,
    parent.sourceName,
    [...parent.pathTitles, title],
  )
  parent.children.push(listNode)

  if (note) {
    appendNote(listNode, note)
  }

  const remainingChildren = item.children.filter((child) => child !== paragraphChild)
  for (const child of remainingChildren) {
    processMarkdownNode(child, listNode, [], createNode, metrics)
  }

  return listNode
}

function processList(
  node: Content,
  parent: LocalImportNode,
  createNode: ReturnType<typeof createNodeFactory>,
  metrics: MutableMetrics,
): void {
  const items = ((node as { children?: ListItem[] }).children ?? []) as ListItem[]
  for (const item of items) {
    createListItemNode(item, parent, createNode, metrics)
  }
}

function processMarkdownNode(
  node: Content,
  activeContainer: LocalImportNode,
  headingStack: Array<{ depth: number; node: LocalImportNode }>,
  createNode: ReturnType<typeof createNodeFactory>,
  metrics: MutableMetrics,
): void {
  switch (node.type) {
    case 'heading': {
      metrics.headingCount += 1
      const depth = (node as { depth?: number }).depth ?? 1
      const title = normalizeParagraphText(node) || `Section ${metrics.headingCount}`
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].depth >= depth) {
        headingStack.pop()
      }

      const parent = headingStack[headingStack.length - 1]?.node ?? activeContainer
      const headingNode = createNode(title, parent.id, parent.sourceName, [...parent.pathTitles, title])
      parent.children.push(headingNode)
      headingStack.push({ depth, node: headingNode })
      return
    }

    case 'paragraph': {
      appendNote(headingStack[headingStack.length - 1]?.node ?? activeContainer, normalizeParagraphText(node))
      return
    }

    case 'blockquote': {
      const text = ((node as { children?: Content[] }).children ?? [])
        .map((child) => normalizeParagraphText(child))
        .filter(Boolean)
        .join('\n\n')
      appendNote(headingStack[headingStack.length - 1]?.node ?? activeContainer, text)
      return
    }

    case 'code': {
      metrics.codeBlockCount += 1
      appendNote(
        headingStack[headingStack.length - 1]?.node ?? activeContainer,
        renderCodeBlock(node as { lang?: string | null; value?: string | null }),
      )
      return
    }

    case 'list': {
      processList(node, headingStack[headingStack.length - 1]?.node ?? activeContainer, createNode, metrics)
      return
    }

    case 'table': {
      metrics.tableCount += 1
      appendNote(headingStack[headingStack.length - 1]?.node ?? activeContainer, renderTable(node))
      return
    }

    case 'html': {
      appendNote(
        headingStack[headingStack.length - 1]?.node ?? activeContainer,
        (node as { value?: string }).value ?? '',
      )
      return
    }

    default: {
      const text = normalizeParagraphText(node)
      if (text) {
        appendNote(headingStack[headingStack.length - 1]?.node ?? activeContainer, text)
      }
    }
  }
}

function buildImportTree(
  source: Pick<LocalTextImportSourceInput, 'sourceName' | 'sourceType' | 'rawText' | 'preprocessedHints'>,
  rootTitle: string,
  prefix: string,
  metrics: MutableMetrics,
): LocalImportNode {
  const createNode = createNodeFactory(prefix)
  const importRoot = createNode(rootTitle, null, source.sourceName, [rootTitle])
  const parsed = unified().use(remarkParse).use(remarkGfm).parse(source.rawText) as Root
  const headingStack: Array<{ depth: number; node: LocalImportNode }> = []

  for (const child of parsed.children) {
    processMarkdownNode(child, importRoot, headingStack, createNode, metrics)
  }

  if (importRoot.children.length === 0 && importRoot.noteParts.length === 0) {
    appendNote(importRoot, source.rawText.trim())
  }

  if (importRoot.children.length === 0 && importRoot.noteParts.length > 0) {
    const fallbackTitle = deriveTextImportTitle(source.sourceName, source.rawText)
    const onlyNode = createNode(
      fallbackTitle,
      importRoot.id,
      source.sourceName,
      [...importRoot.pathTitles, fallbackTitle],
    )
    appendNote(onlyNode, importRoot.noteParts.join('\n\n'))
    importRoot.noteParts = []
    importRoot.children.push(onlyNode)
  }

  return importRoot
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

function mapSemanticRoleFromText(title: string, note: string, hasChildren: boolean): TextImportSemanticRole {
  if (hasChildren) {
    return 'section'
  }

  const classified = inferTextImportSemanticHintKind([title, note].filter(Boolean).join('\n'), 'paragraph')
  if (classified.kind === 'owner') {
    return 'evidence'
  }
  if (classified.kind === 'evidence' && note.trim()) {
    return 'summary'
  }
  return classified.kind as Exclude<TextImportSemanticRole, 'section' | 'summary'>
}

function buildNodePlansFromImportTree(root: LocalImportNode): TextImportNodePlan[] {
  const plans: TextImportNodePlan[] = [
    {
      id: root.id,
      parentId: null,
      order: 0,
      title: root.title,
      note: root.noteParts.join('\n\n').trim() || null,
      semanticRole: 'section',
      confidence: 'high',
      sourceAnchors: [],
      groupKey: 'root',
      priority: 'primary',
      collapsedByDefault: false,
      templateSlot: null,
    },
  ]

  const visit = (node: LocalImportNode): void => {
    node.children.forEach((child, index) => {
      const note = child.noteParts.join('\n\n').trim()
      plans.push({
        id: child.id,
        parentId: child.parentId,
        order: index,
        title: child.title,
        note: note || null,
        semanticRole: mapSemanticRoleFromText(child.title, note, child.children.length > 0),
        confidence: note || child.children.length > 0 ? 'medium' : 'low',
        sourceAnchors: [],
        priority: child.children.length > 0 ? 'secondary' : undefined,
        groupKey: child.children.length > 0 ? 'sections' : undefined,
        collapsedByDefault: false,
        templateSlot: null,
      })
      visit(child)
    })
  }

  visit(root)
  return plans
}

function buildLocalTextImportNodePlans(
  request: TextImportRequest,
  sourceTitle: string,
  metrics: MutableMetrics,
): {
  nodePlans: TextImportNodePlan[]
  profile: TextImportRequest['contentProfile']
  nodeBudget: TextImportRequest['nodeBudget']
  classification: TextImportClassification
  templateSummary: TextImportTemplateSummary
} {
  const profile = detectTextImportContentProfile({
    sourceName: request.sourceName,
    preprocessedHints: request.preprocessedHints,
    semanticHints: request.semanticHints,
    explicitProfile: request.contentProfile,
    explicitArchetype: request.archetype,
    archetypeMode: request.archetypeMode,
  })
  const nodeBudget = resolveTextImportNodeBudget(request.intent, profile, request.nodeBudget)
  const plannedDistillation = planTextImportFromSemanticHints({
    rootTitle: `Import: ${sourceTitle}`,
    intent: request.intent,
    sourceName: request.sourceName,
    preprocessedHints: request.preprocessedHints,
    profile,
    archetype: request.archetype,
    archetypeMode: request.archetypeMode,
    nodeBudget,
    semanticHints: request.semanticHints,
  })

  if (request.intent === 'distill_structure') {
    return {
      nodePlans: plannedDistillation.nodePlans,
      profile,
      nodeBudget,
      classification: plannedDistillation.classification,
      templateSummary: plannedDistillation.templateSummary,
    }
  }

  const importRoot = buildImportTree(
    {
      sourceName: request.sourceName,
      sourceType: request.sourceType,
      rawText: request.rawText,
      preprocessedHints: request.preprocessedHints,
    },
    `Import: ${sourceTitle}`,
    'import_node',
    metrics,
  )

  return {
    nodePlans: buildNodePlansFromImportTree(importRoot),
    profile,
    nodeBudget,
    classification: plannedDistillation.classification,
    templateSummary: plannedDistillation.templateSummary,
  }
}

function clonePreviewTreeWithPrefix(
  node: TextImportPreviewNode,
  prefix: string,
  parentId: string | null,
): TextImportPreviewNode {
  const clonedId = `${prefix}${node.id}`
  return {
    ...node,
    id: clonedId,
    parentId,
    sourceAnchors: node.sourceAnchors?.map((anchor) => ({ ...anchor })),
    children: node.children.map((child) => clonePreviewTreeWithPrefix(child, prefix, clonedId)),
  }
}

function flattenPreviewTree(root: TextImportPreviewNode): TextImportPreviewItem[] {
  const items: TextImportPreviewItem[] = []
  const visit = (node: TextImportPreviewNode) => {
    items.push({
      id: node.id,
      parentId: node.parentId,
      order: node.order,
      title: node.title,
      note: node.note,
      relation: node.relation,
      matchedTopicId: node.matchedTopicId,
      reason: node.reason,
      semanticRole: node.semanticRole,
      confidence: node.confidence,
      sourceAnchors: node.sourceAnchors?.map((anchor) => ({ ...anchor })),
      templateSlot: node.templateSlot ?? null,
    })
    node.children.forEach(visit)
  }

  visit(root)
  return items
}

export function createLocalTextImportPreview(
  request: TextImportRequest,
  options?: {
    onProgress?: (update: LocalTextImportProgressUpdate) => void
    preprocessHintCount?: number
    now?: () => number
  },
): LocalTextImportBuildResult {
  const now = options?.now ?? Date.now
  const metrics: MutableMetrics = {
    headingCount: 0,
    listItemCount: 0,
    tableCount: 0,
    codeBlockCount: 0,
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
  const planned = buildLocalTextImportNodePlans(request, sourceTitle, metrics)
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
  const compiled = compileTextImportNodePlans({
    insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    nodePlans: planned.nodePlans,
  })
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
  const previewNodes = compiled.previewNodes
  const operations = compiled.operations
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes,
    nodeBudget: planned.nodeBudget,
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
      ? `Built a distilled ${planned.classification.archetype} import branch with ${previewNodes.length} nodes.`
      : `Built a structured import branch with ${previewNodes.length} nodes while classifying the content as ${planned.classification.archetype}.`
  const response: TextImportResponse = {
    summary,
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    classification: planned.classification,
    templateSummary: planned.templateSummary,
    nodePlans: planned.nodePlans,
    previewNodes,
    operations,
    conflicts: [],
    mergeSuggestions: [],
    semanticMerge: {
      candidateCount: 0,
      adjudicatedCount: 0,
      autoMergedExistingCount: 0,
      autoMergedCrossFileCount: 0,
      conflictCount: 0,
      fallbackCount: 0,
    },
    warnings: qualityWarnings,
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
          mergeSuggestionCount: 0,
          warningCount: qualityWarnings.length,
          classification: planned.classification,
          templateSummary: planned.templateSummary,
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
        options?.preprocessHintCount ??
        countTextImportHints(
          request.preprocessedHints.length > 0
            ? request.preprocessedHints
            : preprocessTextToImportHints(request.rawText),
        ),
      parseTreeMs,
      matchExistingMs: candidateGenMs + semanticMergeMs,
      candidateGenMs,
      semanticMergeMs,
      buildPreviewMs,
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
  const batchTitle = buildTextImportBatchTitle(files, request.batchTitle)
  const batchRoot: TextImportPreviewNode = {
    id: 'batch_root_1',
    parentId: null,
    order: 0,
    title: batchTitle,
    note: null,
    relation: 'new',
    matchedTopicId: null,
    reason: null,
    semanticRole: 'section',
    confidence: 'high',
    sourceAnchors: [],
    children: [],
  }
  const perFile: LocalTextImportBatchFileMetrics[] = []
  const perFileResponses: Array<Pick<TextImportResponse, 'classification' | 'templateSummary'>> = []
  const allWarnings: string[] = []
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
        now,
      },
    )
    parseTreeMs += built.metrics.parseTreeMs
    candidateGenMs += built.metrics.candidateGenMs
    semanticMergeMs += built.metrics.semanticMergeMs

    const roots = buildTextImportPreviewTree(built.response.previewNodes)
    const root = roots[0]
    if (root) {
      const cloned = clonePreviewTreeWithPrefix(root, `batch_${index + 1}__`, batchRoot.id)
      cloned.order = index
      batchRoot.children.push(cloned)
    }

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
    allWarnings.push(...(built.response.warnings ?? []).map((warning) => `[${file.sourceName}] ${warning}`))
    perFileResponses.push({
      classification: built.response.classification,
      templateSummary: built.response.templateSummary,
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
      parseTreeMs: built.metrics.parseTreeMs,
      matchExistingMs: built.metrics.matchExistingMs,
      candidateGenMs: built.metrics.candidateGenMs,
      semanticMergeMs: built.metrics.semanticMergeMs,
      buildPreviewMs: built.metrics.buildPreviewMs,
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
  const previewNodes = flattenPreviewTree(batchRoot)
  const nodePlans = deriveTextImportNodePlansFromPreviewNodes({
    previewNodes,
  })
  const operations = compileTextImportPreviewNodesToOperations({
    insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    previewNodes,
  })
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes,
    nodeBudget: { maxRoots: Math.max(2, files.length + 1), maxDepth: 5, maxTotalNodes: Math.max(12, previewNodes.length) },
  })
  semanticMergeMs += now() - semanticStartedAt

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

  const response: TextImportResponse = {
    summary: `Built a distilled batch import tree with ${files.length} files and ${previewNodes.length} preview nodes.`,
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    classification: {
      archetype: 'mixed',
      confidence: 0.4,
      rationale: 'Batch imports keep each file on its own archetype and use a mixed container at the top level.',
      secondaryArchetype: null,
    },
    templateSummary: {
      archetype: 'mixed',
      visibleSlots: ['themes', 'actions'],
      foldedSlots: ['summary', 'evidence', 'open_questions'],
    },
    nodePlans,
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
    warnings: [...allWarnings, ...qualityWarnings],
    batch: {
      jobType: 'batch',
      fileCount: files.length,
      completedFileCount: files.length,
      currentFileName: null,
      batchContainerTitle: batchTitle,
      files: perFile.map((fileMetric, index) => ({
        sourceName: fileMetric.sourceName,
        sourceType: fileMetric.sourceType,
        previewNodeId: batchRoot.children[index]?.id ?? `missing_${index}`,
        nodeCount: fileMetric.totalNodeCount,
        mergeSuggestionCount: fileMetric.mergeSuggestionCount,
        warningCount: fileMetric.warningCount,
        classification: perFileResponses[index]?.classification ?? null,
        templateSummary: perFileResponses[index]?.templateSummary ?? null,
      })),
    },
  }

  return {
    response,
    metrics: {
      headingCount: aggregateMetrics.headingCount,
      listItemCount: aggregateMetrics.listItemCount,
      tableCount: aggregateMetrics.tableCount,
      codeBlockCount: aggregateMetrics.codeBlockCount,
      preprocessHintCount,
      parseTreeMs,
      matchExistingMs: candidateGenMs + semanticMergeMs,
      candidateGenMs,
      semanticMergeMs,
      buildPreviewMs,
      totalNodeCount: previewNodes.length,
      edgeCount: Math.max(0, previewNodes.filter((node) => node.parentId !== null).length),
      mergeSuggestionCount: 0,
      warningCount: allWarnings.length + qualityWarnings.length,
      fileCount: files.length,
      crossFileSuggestionCount: 0,
      perFile,
    },
  }
}
