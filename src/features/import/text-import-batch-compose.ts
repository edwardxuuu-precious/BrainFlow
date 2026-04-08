import type {
  AiImportOperation,
  TextImportMergeSuggestion,
  TextImportPreviewNode,
  TextImportResponse,
} from '../../../shared/ai-contract'
import {
  buildTextImportBatchTitle,
  sortTextImportBatchSources,
  type LocalTextImportBatchRequest,
  type LocalTextImportSourceInput,
} from './local-text-import-core'
import { buildImportBundlePreview } from '../../../shared/text-import-layering'
import { deriveTextImportTitle } from './text-import-preprocess'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

export interface BatchTextImportPreviewSource extends LocalTextImportSourceInput {
  route: 'local_markdown' | 'codex_import'
  response: TextImportResponse
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

function createFileRoot(
  file: Pick<LocalTextImportSourceInput, 'sourceName' | 'rawText'>,
  response: TextImportResponse,
  index: number,
): TextImportPreviewNode {
  const roots = buildTextImportPreviewTree(response.previewNodes)
  const prefix = `batch_${index + 1}__`

  if (roots.length === 1) {
    return cloneTreeWithPrefix(roots[0], prefix, null)
  }

  const syntheticRoot = cloneTreeWithPrefix(createFallbackFileRoot(file), prefix, null)
  const children = (roots.length > 0 ? roots : [createFallbackFileRoot(file)]).map((root, rootIndex) =>
    cloneTreeWithPrefix(root, `${prefix}root_${rootIndex}__`, syntheticRoot.id),
  )
  syntheticRoot.note = roots.length > 0 ? null : syntheticRoot.note
  syntheticRoot.children = children.map((child, childIndex) => ({
    ...child,
    order: childIndex,
  }))
  return syntheticRoot
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

export function composeTextImportBatchPreview(
  request: LocalTextImportBatchRequest,
  files: BatchTextImportPreviewSource[],
): TextImportResponse {
  const sortedFiles = sortTextImportBatchSources(files)
  const batchRoot = createBatchRoot(buildTextImportBatchTitle(sortedFiles, request.batchTitle))
  const mergeSuggestions: TextImportMergeSuggestion[] = []
  const warnings: string[] = []
  const semanticUpdates: AiImportOperation[] = []
  const fileRoots = sortedFiles.map((file, index) => {
    const prefix = `batch_${index + 1}__`
    const fileRoot = createFileRoot(file, file.response, index)
    fileRoot.parentId = batchRoot.id
    fileRoot.order = index
    mergeSuggestions.push(...remapMergeSuggestions(file.response.mergeSuggestions, prefix))
    warnings.push(...prefixWarnings(file.sourceName, file.response.warnings))
    semanticUpdates.push(...collectUpdateOperations(file.response, prefix))
    return fileRoot
  })

  batchRoot.children = fileRoots
  const layered = buildImportBundlePreview({
    bundleId: `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    bundleTitle: batchRoot.title,
    anchorTopicId: request.anchorTopicId,
    createdAt: Date.now(),
    sources: sortedFiles.map((file) => ({
      sourceName: file.sourceName,
      sourceType: file.sourceType,
      rawText: file.rawText,
      preprocessedHints: file.preprocessedHints,
      semanticHints: file.semanticHints,
    })),
    requestIntent:
      sortedFiles.every((file) => file.intent === 'preserve_structure')
        ? 'preserve_structure'
        : 'distill_structure',
    requestedArchetype: undefined,
    requestedArchetypeMode: 'auto',
    requestedContentProfile: undefined,
    requestedNodeBudget: undefined,
    fallbackInsertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
  })

  return {
    summary: `Created a three-layer batch import bundle with ${sortedFiles.length} files and ${layered.previewNodes.length} thinking-view nodes.`,
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
    previewNodes: layered.previewNodes,
    operations: [...layered.operations, ...semanticUpdates.filter((operation) => operation.type !== 'create_child')],
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
      batchContainerTitle: batchRoot.title,
      files: sortedFiles.map((file, index) => ({
        sourceName: file.sourceName,
        sourceType: file.sourceType,
        previewNodeId: `archive_${layered.sources[index]?.id ?? `source_${index + 1}`}`,
        nodeCount: countTreeNodes(fileRoots[index] ?? createFallbackFileRoot(file)),
        mergeSuggestionCount: (file.response.mergeSuggestions ?? []).length,
        warningCount: (file.response.warnings ?? []).length,
        classification: file.response.classification,
        templateSummary: file.response.templateSummary,
      })),
    },
  }
}
