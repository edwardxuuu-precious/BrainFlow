import type {
  AiImportOperation,
  KnowledgeSource,
  TextImportClassification,
  TextImportMergeSuggestion,
  TextImportPreviewItem,
  TextImportPreviewNode,
  TextImportResponse,
  TextImportTemplateSummary,
} from '../../../shared/ai-contract'
import {
  compileSemanticLayerViews,
  deriveSemanticGraphFromPreviewNodes,
} from '../../../shared/text-import-layering'
import type { LocalTextImportBatchRequest, LocalTextImportSourceInput } from './local-text-import-core'
import { deriveTextImportTitle } from './text-import-preprocess'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

export interface BatchTextImportPreviewSource extends LocalTextImportSourceInput {
  route: 'local_markdown' | 'codex_import'
  response: TextImportResponse
}

interface BatchHierarchyDescriptor {
  groupKey: string
  isMain: boolean
  stepSegments: number[]
}

function getFileHierarchyKey(sourceName: string): number[] {
  const normalized = stripExtension(sourceName)
  if (/main/i.test(normalized)) {
    return [0]
  }

  const match = normalized.match(/step(\d+(?:-\d+)*)/i)
  if (!match) {
    return [Number.MAX_SAFE_INTEGER, normalized.length]
  }

  return [1, ...match[1].split('-').map((value) => Number.parseInt(value, 10) || 0)]
}

function sortBatchSources<T extends Pick<LocalTextImportSourceInput, 'sourceName'>>(sources: T[]): T[] {
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

function buildBatchTitle(
  files: Pick<LocalTextImportSourceInput, 'sourceName'>[],
  explicitTitle?: string,
): string {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim()
  }

  const prefixes = files
    .map((file) => stripExtension(file.sourceName))
    .map((name) => name.split(/[_-]/)[0])
    .filter(Boolean)
  const firstPrefix = prefixes[0]

  if (firstPrefix && prefixes.every((prefix) => prefix === firstPrefix)) {
    return `Import batch: ${firstPrefix}`
  }

  return 'Import batch'
}

function stripExtension(sourceName: string): string {
  return sourceName.replace(/\.[^.]+$/, '')
}

function createBatchRoot(title: string): TextImportPreviewNode {
  return {
    id: 'batch_root_1',
    parentId: null,
    order: 0,
    title,
    note: null,
    relation: 'new',
    matchedTopicId: null,
    reason: null,
    semanticRole: 'section',
    confidence: 'high',
    sourceAnchors: [],
    children: [],
  }
}

function cloneTreeWithPrefix(
  node: TextImportPreviewNode,
  prefix: string,
  parentId: string | null,
): TextImportPreviewNode {
  const clonedId = `${prefix}${node.id}`
  const cloned: TextImportPreviewNode = {
    ...node,
    id: clonedId,
    parentId,
    children: [],
  }
  cloned.children = node.children.map((child) => cloneTreeWithPrefix(child, prefix, clonedId))
  return cloned
}

function createFallbackFileRoot(file: Pick<LocalTextImportSourceInput, 'sourceName' | 'rawText'>): TextImportPreviewNode {
  return {
    id: 'fallback_root',
    parentId: null,
    order: 0,
    title: `Import: ${deriveTextImportTitle(file.sourceName, file.rawText)}`,
    note: file.rawText.trim() || null,
    relation: 'new',
    matchedTopicId: null,
    reason: null,
    semanticRole: 'section',
    confidence: 'medium',
    sourceAnchors: [],
    children: [],
  }
}

function createFileWrapperNode(
  file: Pick<LocalTextImportSourceInput, 'sourceName'>,
  prefix: string,
  note: string | null,
): TextImportPreviewNode {
  return {
    id: `${prefix}file_root`,
    parentId: null,
    order: 0,
    title: stripExtension(file.sourceName) || file.sourceName,
    note,
    relation: 'new',
    matchedTopicId: null,
    reason: null,
    semanticRole: 'section',
    confidence: 'high',
    sourceAnchors: [],
    children: [],
  }
}

function summarizeFileWrapperNote(
  file: Pick<BatchTextImportPreviewSource, 'route' | 'sourceName'>,
  response: TextImportResponse,
): string | null {
  const parts = [
    `Route: ${file.route === 'local_markdown' ? 'Local structured import' : 'Codex import'}`,
    `Archetype: ${response.classification.archetype}`,
  ]
  if (response.templateSummary.visibleSlots.length > 0) {
    parts.push(`Visible slots: ${response.templateSummary.visibleSlots.join(', ')}`)
  }
  if (response.templateSummary.foldedSlots.length > 0) {
    parts.push(`Folded slots: ${response.templateSummary.foldedSlots.join(', ')}`)
  }
  if ((response.diagnostics?.qualitySignals.needsDeepPassCount ?? 0) > 0) {
    parts.push('Needs deeper review')
  }
  if ((response.warnings?.length ?? 0) > 0) {
    parts.push(`Warnings: ${response.warnings?.length ?? 0}`)
  }

  return parts.join('\n')
}

function createFileRoot(
  file: Pick<LocalTextImportSourceInput, 'sourceName' | 'rawText'>,
  response: TextImportResponse,
  route: BatchTextImportPreviewSource['route'],
  index: number,
): TextImportPreviewNode {
  const roots = buildTextImportPreviewTree(response.previewNodes)
  const prefix = `batch_${index + 1}__`
  const fileRoot = createFileWrapperNode(
    file,
    prefix,
    summarizeFileWrapperNote({ route, sourceName: file.sourceName }, response),
  )
  const sourceRoots = (roots.length > 0 ? roots : [createFallbackFileRoot(file)]).map((root, rootIndex) =>
    cloneTreeWithPrefix(root, `${prefix}root_${rootIndex}__`, fileRoot.id),
  )

  fileRoot.children = sourceRoots.map((child, childIndex) => ({
    ...child,
    order: childIndex,
  }))

  return fileRoot
}

function countTreeNodes(root: TextImportPreviewNode): number {
  let count = 0
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    count += 1
    queue.push(...current.children)
  }
  return count
}

function remapMergeSuggestions(
  suggestions: TextImportMergeSuggestion[] | undefined,
  prefix: string,
): TextImportMergeSuggestion[] {
  return (suggestions ?? []).map((suggestion) => ({
    ...suggestion,
    id: `${prefix}${suggestion.id}`,
    previewNodeId: `${prefix}${suggestion.previewNodeId}`,
  }))
}

function collectUpdateOperations(response: TextImportResponse, prefix: string): AiImportOperation[] {
  return response.operations
    .filter(
      (operation) =>
        operation.type === 'update_topic' &&
        typeof operation.target === 'string' &&
        operation.target.startsWith('topic:'),
    )
    .map((operation) => ({
      ...operation,
      id: `${prefix}${operation.id}`,
      conflictId: operation.conflictId ? `${prefix}${operation.conflictId}` : undefined,
    }))
}

function prefixWarnings(sourceName: string, warnings: string[] | undefined): string[] {
  return (warnings ?? []).map((warning) => `[${sourceName}] ${warning}`)
}

function normalizeHierarchyGroupKey(value: string): string {
  return value.trim().replace(/[_-]+$/g, '').toLowerCase()
}

function parseBatchHierarchyDescriptor(sourceName: string): BatchHierarchyDescriptor {
  const stem = stripExtension(sourceName)
  const mainMatch = stem.match(/^(.*?)(?:[_-]?main)$/i)
  if (mainMatch) {
    return {
      groupKey: normalizeHierarchyGroupKey(mainMatch[1]),
      isMain: true,
      stepSegments: [],
    }
  }

  const stepMatch = stem.match(/^(.*?)(?:[_-]?step(\d+(?:-\d+)*))$/i)
  if (stepMatch) {
    return {
      groupKey: normalizeHierarchyGroupKey(stepMatch[1]),
      isMain: false,
      stepSegments: stepMatch[2].split('-').map((segment) => Number.parseInt(segment, 10) || 0),
    }
  }

  return {
    groupKey: normalizeHierarchyGroupKey(stem),
    isMain: false,
    stepSegments: [],
  }
}

function descriptorKey(descriptor: BatchHierarchyDescriptor): string {
  if (descriptor.isMain) {
    return `${descriptor.groupKey}:main`
  }
  if (descriptor.stepSegments.length > 0) {
    return `${descriptor.groupKey}:step:${descriptor.stepSegments.join('-')}`
  }
  return `${descriptor.groupKey}:other`
}

function attachChild(parent: TextImportPreviewNode, child: TextImportPreviewNode): void {
  child.parentId = parent.id
  child.order = parent.children.length
  parent.children.push(child)
}

function nestFileRootsByHierarchy(fileRoots: Array<{
  sourceName: string
  root: TextImportPreviewNode
}>): TextImportPreviewNode[] {
  const descriptorEntries = fileRoots.map((entry) => ({
    ...entry,
    descriptor: parseBatchHierarchyDescriptor(entry.sourceName),
  }))
  const rootByDescriptor = new Map(
    descriptorEntries.map((entry) => [descriptorKey(entry.descriptor), entry.root] as const),
  )
  const topLevel: TextImportPreviewNode[] = []

  descriptorEntries.forEach((entry) => {
    const { descriptor, root } = entry
    let parent: TextImportPreviewNode | null = null

    if (descriptor.stepSegments.length > 1) {
      const parentStepDescriptor: BatchHierarchyDescriptor = {
        groupKey: descriptor.groupKey,
        isMain: false,
        stepSegments: descriptor.stepSegments.slice(0, -1),
      }
      parent = rootByDescriptor.get(descriptorKey(parentStepDescriptor)) ?? null
    } else if (descriptor.stepSegments.length === 1) {
      const mainDescriptor: BatchHierarchyDescriptor = {
        groupKey: descriptor.groupKey,
        isMain: true,
        stepSegments: [],
      }
      parent = rootByDescriptor.get(descriptorKey(mainDescriptor)) ?? null
    }

    if (parent) {
      attachChild(parent, root)
      return
    }

    root.parentId = null
    root.order = topLevel.length
    topLevel.push(root)
  })

  return topLevel
}

function flattenPreviewTree(nodes: TextImportPreviewNode[]): TextImportPreviewItem[] {
  const flattened: TextImportPreviewItem[] = []
  const visit = (node: TextImportPreviewNode, parentId: string | null, order: number) => {
    flattened.push({
      ...node,
      parentId,
      order,
    })
    node.children.forEach((child, childIndex) => {
      visit(child, node.id, childIndex)
    })
  }

  nodes.forEach((node, index) => {
    visit(node, null, index)
  })

  return flattened
}

function createKnowledgeSources(files: BatchTextImportPreviewSource[]): KnowledgeSource[] {
  return files.map((file, index) => {
    const sourceId = `source_${index + 1}`
    const headings = file.preprocessedHints
      .filter((hint) => hint.kind === 'heading')
      .map((hint) => ({
        level: hint.level,
        title: hint.text,
        lineStart: hint.lineStart,
        lineEnd: hint.lineEnd,
        pathTitles: hint.sourcePath,
      }))
    const segments = file.preprocessedHints.map((hint) => ({
      kind: hint.kind,
      text: hint.text,
      lineStart: hint.lineStart,
      lineEnd: hint.lineEnd,
      pathTitles: hint.sourcePath,
    }))

    return {
      id: sourceId,
      type: file.sourceType,
      title: stripExtension(file.sourceName) || 'Imported source',
      raw_content: file.rawText,
      metadata: {
        sourceName: file.sourceName,
        headingCount: headings.length,
        headings,
        segments,
      },
    }
  })
}

function summarizeBatchClassification(files: BatchTextImportPreviewSource[]): TextImportClassification {
  const classifications = files.map((file) => file.response.classification)
  if (classifications.length === 0) {
    return {
      archetype: 'mixed',
      confidence: 0.5,
      rationale: 'The batch import preserves file hierarchy across multiple sources.',
      secondaryArchetype: null,
    }
  }

  const counts = new Map<string, number>()
  classifications.forEach((classification) => {
    counts.set(classification.archetype, (counts.get(classification.archetype) ?? 0) + 1)
  })
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1])
  const primary = ranked[0]?.[0] ?? classifications[0].archetype
  const secondary = ranked[1]?.[0] ?? null
  const averageConfidence =
    classifications.reduce((total, classification) => total + classification.confidence, 0) /
    Math.max(1, classifications.length)

  return {
    archetype: primary as TextImportClassification['archetype'],
    confidence: averageConfidence,
    rationale: `The batch import preserves file hierarchy across ${files.length} sources while keeping each file's local structure.`,
    secondaryArchetype:
      secondary && secondary !== primary ? (secondary as TextImportClassification['archetype']) : null,
  }
}

function summarizeBatchTemplate(files: BatchTextImportPreviewSource[]): TextImportTemplateSummary {
  const primary = summarizeBatchClassification(files)
  const visibleSlots = files.flatMap((file) => file.response.templateSummary.visibleSlots)
  const foldedSlots = files.flatMap((file) => file.response.templateSummary.foldedSlots)

  return {
    archetype: primary.archetype,
    visibleSlots: [...new Set(visibleSlots)],
    foldedSlots: [...new Set(foldedSlots)],
  }
}

export function composeTextImportBatchPreview(
  request: LocalTextImportBatchRequest,
  files: BatchTextImportPreviewSource[],
): TextImportResponse {
  const sortedFiles = sortBatchSources(files)
  const mergeSuggestions: TextImportMergeSuggestion[] = []
  const warnings: string[] = []
  const semanticUpdates: AiImportOperation[] = []
  const fileRoots = sortedFiles.map((file, index) => {
    const prefix = `batch_${index + 1}__`
    const fileRoot = createFileRoot(file, file.response, file.route, index)
    mergeSuggestions.push(...remapMergeSuggestions(file.response.mergeSuggestions, prefix))
    warnings.push(...prefixWarnings(file.sourceName, file.response.warnings))
    semanticUpdates.push(...collectUpdateOperations(file.response, prefix))
    return {
      sourceName: file.sourceName,
      root: fileRoot,
    }
  })

  const nestedRoots = nestFileRootsByHierarchy(fileRoots)
  const batchTitle = buildBatchTitle(sortedFiles, request.batchTitle)
  const previewRoots =
    nestedRoots.length === 1
      ? nestedRoots.map((root, index) => ({
          ...root,
          parentId: null,
          order: index,
        }))
      : (() => {
          const batchRoot = createBatchRoot(batchTitle)
          nestedRoots.forEach((root) => attachChild(batchRoot, root))
          return [batchRoot]
        })()
  const previewItems = flattenPreviewTree(previewRoots)
  const semanticGraph = deriveSemanticGraphFromPreviewNodes({ previewNodes: previewItems })
  const sources = createKnowledgeSources(sortedFiles)
  const bundleId = `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const compiled = compileSemanticLayerViews({
    bundleId,
    bundleTitle: batchTitle,
    sources,
    semanticNodes: semanticGraph.semanticNodes,
    semanticEdges: semanticGraph.semanticEdges,
    fallbackInsertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
  })
  const activeViewId = compiled.activeViewId
  const activeProjection = compiled.viewProjections[activeViewId]
  const classification = summarizeBatchClassification(sortedFiles)
  const templateSummary = summarizeBatchTemplate(sortedFiles)

  return {
    summary: `Created a three-layer batch import bundle with ${sortedFiles.length} files and ${activeProjection.previewNodes.length} thinking-view nodes.`,
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    classification,
    templateSummary,
    bundle: {
      id: bundleId,
      title: batchTitle,
      createdAt: Date.now(),
      anchorTopicId: request.anchorTopicId,
      defaultViewId: compiled.defaultViewId,
      activeViewId,
      mountedRootTopicId: null,
      sources,
      semanticNodes: semanticGraph.semanticNodes,
      semanticEdges: semanticGraph.semanticEdges,
      views: compiled.views,
      viewProjections: compiled.viewProjections,
    },
    sources,
    semanticNodes: semanticGraph.semanticNodes,
    semanticEdges: semanticGraph.semanticEdges,
    views: compiled.views,
    viewProjections: compiled.viewProjections,
    defaultViewId: compiled.defaultViewId,
    activeViewId,
    nodePlans: activeProjection.nodePlans,
    previewNodes: activeProjection.previewNodes,
    operations: [...activeProjection.operations, ...semanticUpdates],
    conflicts: [],
    mergeSuggestions,
    crossFileMergeSuggestions: [],
    semanticMerge: {
      candidateCount: 0,
      adjudicatedCount: 0,
      autoMergedExistingCount: semanticUpdates.length,
      autoMergedCrossFileCount: 0,
      conflictCount: 0,
      fallbackCount: mergeSuggestions.length,
    },
    warnings,
    batch: {
      jobType: 'batch',
      fileCount: sortedFiles.length,
      completedFileCount: sortedFiles.length,
      currentFileName: null,
      batchContainerTitle: batchTitle,
      files: sortedFiles.map((file, index) => ({
        sourceName: file.sourceName,
        sourceType: file.sourceType,
        previewNodeId: fileRoots[index]?.root.id ?? `batch_${index + 1}__file_root`,
        nodeCount: countTreeNodes(fileRoots[index]?.root ?? createFallbackFileRoot(file)),
        mergeSuggestionCount: (file.response.mergeSuggestions ?? []).length,
        warningCount: (file.response.warnings ?? []).length,
        classification: file.response.classification,
        templateSummary: file.response.templateSummary,
      })),
    },
  }
}
