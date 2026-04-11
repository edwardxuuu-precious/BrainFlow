import type {
  AiImportOperation,
  KnowledgeMergeMode,
  KnowledgeSource,
  KnowledgeSourceRole,
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
  normalizeDocumentStructureType,
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

interface BatchSemanticSignature {
  rootQuestionKey: string
  moduleKeys: string[]
  intentKeys: string[]
  contentTokens: string[]
  wrapperRatio: number
}

interface BatchSourceMergeMetadata {
  sourceRole: KnowledgeSourceRole
  canonicalTopicId: string
  sameAsTopicId: string | null
  mergeMode: KnowledgeMergeMode
  mergeConfidence: number
  semanticFingerprint: string
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
    `Document type: ${response.classification.archetype}`,
    `Nodes: ${response.previewNodes.length}`,
  ]
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

function normalizeTextForMatch(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
}

function tokenizeForMatch(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .toLowerCase()
      .normalize('NFKC')
      .split(/[^\p{Letter}\p{Number}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  )
}

function overlapScore(left: Iterable<string>, right: Iterable<string>): number {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0
  }
  let shared = 0
  const smaller = leftSet.size <= rightSet.size ? leftSet : rightSet
  const larger = smaller === leftSet ? rightSet : leftSet
  smaller.forEach((value) => {
    if (larger.has(value)) {
      shared += 1
    }
  })
  return shared / Math.max(leftSet.size, rightSet.size)
}

function extractSalientContentTokens(rawText: string): string[] {
  const normalized = rawText.toLowerCase().normalize('NFKC')
  const tokens = normalized
    .split(/[^\p{Letter}\p{Number}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
  const counts = new Map<string, number>()
  tokens.forEach((token) => {
    counts.set(`w:${token}`, (counts.get(`w:${token}`) ?? 0) + 1)
  })

  const compact = normalized.replace(/[^\p{Letter}\p{Number}]+/gu, '').slice(0, 2400)
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2)
    if (gram.trim().length < 2) {
      continue
    }
    counts.set(`c2:${gram}`, (counts.get(`c2:${gram}`) ?? 0) + 1)
  }

  if (counts.size === 0) {
    return []
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }
      return left[0].localeCompare(right[0])
    })
    .slice(0, 200)
    .map(([token]) => token)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fnv1aHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function hashObject(value: unknown): string {
  return fnv1aHash(stableStringify(value))
}

function collectRootFromPreview(response: TextImportResponse): TextImportPreviewItem | null {
  const roots = response.previewNodes
    .filter((node) => node.parentId === null)
    .sort((left, right) => left.order - right.order)
  return roots[0] ?? null
}

function collectChildrenByParent(previewNodes: TextImportPreviewItem[]): Map<string | null, TextImportPreviewItem[]> {
  const childrenByParent = new Map<string | null, TextImportPreviewItem[]>()
  previewNodes.forEach((node) => {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  })
  childrenByParent.forEach((siblings) => siblings.sort((left, right) => left.order - right.order))
  return childrenByParent
}

function buildSemanticSignature(response: TextImportResponse): BatchSemanticSignature {
  const wrapperTitleRegex =
    /^(?:markdown\s*记录|说明|备注|对话记录|turn\s*\d+\s*[.\-:]\s*(?:user|assistant)|user|assistant|用户|助手)$/i
  const root = collectRootFromPreview(response)
  const childrenByParent = collectChildrenByParent(response.previewNodes)
  const firstLevel = root ? childrenByParent.get(root.id) ?? [] : []
  const moduleTitles = firstLevel.map((node) => normalizeTextForMatch(node.title)).filter(Boolean)
  const intentTitles = response.previewNodes
    .filter((node) =>
      node.structureRole === 'basis_item' ||
      node.structureRole === 'action_item' ||
      node.semanticType === 'task' ||
      node.semanticRole === 'task',
    )
    .map((node) => node.title)
  const wrapperCount = response.previewNodes.filter((node) => wrapperTitleRegex.test(node.title.trim())).length
  const wrapperRatio = response.previewNodes.length > 0 ? wrapperCount / response.previewNodes.length : 0

  return {
    rootQuestionKey: normalizeTextForMatch(root?.title ?? ''),
    moduleKeys: [...new Set(moduleTitles)],
    intentKeys: [...new Set(intentTitles.map((title) => normalizeTextForMatch(title)).filter(Boolean))],
    contentTokens: [],
    wrapperRatio,
  }
}

function classifySourceRole(
  file: Pick<BatchTextImportPreviewSource, 'sourceName' | 'rawText'>,
  response: TextImportResponse,
  signature: BatchSemanticSignature,
): KnowledgeSourceRole {
  let canonicalScore = 0
  let contextScore = 0
  let supportingScore = 0

  const normalizedName = stripExtension(file.sourceName).toLowerCase()
  const hasMainMarker = /(?:^|[_-])main(?:$|[_-])/i.test(normalizedName)
  const hasStepMarker = /(?:^|[_-])step(?:\d|$)/i.test(normalizedName)
  if (hasMainMarker && !hasStepMarker) {
    return 'canonical_knowledge'
  }
  if (hasMainMarker) {
    canonicalScore += 0.95
  }
  if (hasStepMarker) {
    contextScore += 0.55
  }
  if (/turn\s+\d+\s*[.\-:]\s*(?:user|assistant)/i.test(file.rawText) || /对话记录|当前对话整理|用户|助手/.test(file.rawText)) {
    contextScore += 0.42
  }
  if (signature.wrapperRatio >= 0.2) {
    contextScore += Math.min(0.4, signature.wrapperRatio)
  } else {
    canonicalScore += 0.1
  }

  if (response.classification.archetype === 'analysis' || response.classification.archetype === 'plan') {
    canonicalScore += 0.2
  } else if (response.classification.archetype === 'notes') {
    contextScore += 0.12
  } else {
    supportingScore += 0.08
  }

  const hasJudgmentTree = response.semanticNodes.some((node) => node.structure_role === 'root_context')
  if (hasJudgmentTree) {
    canonicalScore += 0.15
  }

  if (normalizedName.includes('appendix') || normalizedName.includes('reference') || normalizedName.includes('support')) {
    supportingScore += 0.35
  }

  if (hasMainMarker && canonicalScore >= contextScore) {
    return 'canonical_knowledge'
  }

  if (canonicalScore >= contextScore && canonicalScore >= supportingScore) {
    return 'canonical_knowledge'
  }
  if (contextScore >= supportingScore) {
    return 'context_record'
  }
  return 'supporting_material'
}

function scoreSameTopic(left: BatchSemanticSignature, right: BatchSemanticSignature): number {
  const rootScore =
    left.rootQuestionKey && left.rootQuestionKey === right.rootQuestionKey
      ? 1
      : overlapScore(tokenizeForMatch(left.rootQuestionKey), tokenizeForMatch(right.rootQuestionKey))
  const moduleScore = overlapScore(left.moduleKeys, right.moduleKeys)
  const intentScore = overlapScore(left.intentKeys, right.intentKeys)
  const contentScore = overlapScore(left.contentTokens, right.contentTokens)
  const wrapperCompatibility = 1 - Math.min(1, Math.abs(left.wrapperRatio - right.wrapperRatio))
  return (
    rootScore * 0.24 +
    moduleScore * 0.2 +
    intentScore * 0.16 +
    contentScore * 0.32 +
    wrapperCompatibility * 0.08
  )
}

function buildSourceMetadata(
  file: BatchTextImportPreviewSource,
  response: TextImportResponse,
): {
  signature: BatchSemanticSignature
  sourceRole: KnowledgeSourceRole
  semanticFingerprint: string
} {
  const signature = buildSemanticSignature(response)
  signature.contentTokens = extractSalientContentTokens(file.rawText)
  const sourceRole = classifySourceRole(file, response, signature)
  const semanticFingerprint = hashObject({
    root: signature.rootQuestionKey,
    modules: signature.moduleKeys,
    intents: signature.intentKeys,
  })
  return { signature, sourceRole, semanticFingerprint }
}

function resolveBatchSourceMergeMetadata(
  files: BatchTextImportPreviewSource[],
): Record<string, BatchSourceMergeMetadata> {
  if (files.length === 0) {
    return {}
  }

  const bySourceName = new Map<string, ReturnType<typeof buildSourceMetadata>>()
  files.forEach((file) => {
    bySourceName.set(file.sourceName, buildSourceMetadata(file, file.response))
  })

  const canonicalSeed =
    files.find((file) => bySourceName.get(file.sourceName)?.sourceRole === 'canonical_knowledge') ?? files[0]
  const canonicalSeedMeta = bySourceName.get(canonicalSeed.sourceName)!
  const canonicalDescriptor = parseBatchHierarchyDescriptor(canonicalSeed.sourceName)
  const canonicalTopicId = `topic_${canonicalSeedMeta.semanticFingerprint}`

  const result: Record<string, BatchSourceMergeMetadata> = {}

  files.forEach((file) => {
    const meta = bySourceName.get(file.sourceName)
    if (!meta) {
      return
    }
    const similarity = scoreSameTopic(canonicalSeedMeta.signature, meta.signature)
    const descriptor = parseBatchHierarchyDescriptor(file.sourceName)
    const hierarchyHintSameTopic =
      canonicalDescriptor.isMain &&
      descriptor.stepSegments.length > 0 &&
      canonicalDescriptor.groupKey.length > 0 &&
      canonicalDescriptor.groupKey === descriptor.groupKey
    const sameTopic = similarity >= 0.72 || hierarchyHintSameTopic

    let mergeMode: KnowledgeMergeMode = 'create_new'
    if (file.sourceName === canonicalSeed.sourceName) {
      mergeMode = 'create_new'
    } else if (sameTopic) {
      if (hierarchyHintSameTopic) {
        mergeMode = 'merge_into_existing'
      } else {
        mergeMode = meta.sourceRole === 'context_record' && similarity < 0.76 ? 'archive_only' : 'merge_into_existing'
      }
    } else {
      mergeMode = 'create_new'
    }

    result[file.sourceName] = {
      sourceRole: meta.sourceRole,
      canonicalTopicId: sameTopic ? canonicalTopicId : `topic_${meta.semanticFingerprint}`,
      sameAsTopicId: sameTopic && file.sourceName !== canonicalSeed.sourceName ? canonicalTopicId : null,
      mergeMode,
      mergeConfidence:
        file.sourceName === canonicalSeed.sourceName
          ? 1
          : Math.max(0, Math.min(1, Number(similarity.toFixed(4)))),
      semanticFingerprint: meta.semanticFingerprint,
    }
  })

  return result
}

function selectSemanticRoot(node: TextImportPreviewNode): TextImportPreviewNode {
  if (node.children.length === 0) {
    return node
  }
  const ranked = [...node.children].sort((left, right) => {
    if (right.children.length !== left.children.length) {
      return right.children.length - left.children.length
    }
    return left.order - right.order
  })
  return ranked[0] ?? node
}

function appendUniqueTraceLine(note: string | null, line: string): string | null {
  const normalizedLine = line.trim()
  if (!normalizedLine) {
    return note
  }
  const normalizedNote = note?.trim() ?? ''
  if (normalizedNote.includes(normalizedLine)) {
    return note
  }
  return [normalizedNote, normalizedLine].filter(Boolean).join('\n')
}

function appendConflictTrace(
  note: string | null,
  sourceName: string,
  alternateTitle: string,
  alternateNote: string | null | undefined,
): string | null {
  const excerpt = (alternateNote ?? alternateTitle).replace(/\s+/g, ' ').trim().slice(0, 240)
  return appendUniqueTraceLine(
    note,
    `[Source-backed conflict:${sourceName}] ${alternateTitle}${excerpt ? ` | ${excerpt}` : ''}`,
  )
}

function splitBatchRepairCandidateText(text: string | null | undefined): string[] {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return []
  }

  const parts = text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((line) => line.split(/[;；。]/))
    .map((line) => line.replace(/^\s*(?:[-*+]|(?:\d+[.)]))\s+/, '').trim())
    .filter(Boolean)

  const deduped: string[] = []
  const seen = new Set<string>()
  parts.forEach((part) => {
    const key = normalizeTextForMatch(part)
    if (!key || seen.has(key)) {
      return
    }
    seen.add(key)
    deduped.push(part)
  })
  return deduped
}

function scoreBatchRepairCandidate(text: string, role: 'basis' | 'action'): number {
  const normalized = text.trim()
  const isQuestion = /[?？]$/.test(normalized) || /^(?:if|whether|when|what|which|who|where|how|why)\b/i.test(normalized)
  const actionIntent =
    /^(?:list|create|build|make|compile|prepare|write|draft|run|check|verify|review|gather|collect|summarize|score|compare|document|define)\b/i.test(normalized) ||
    /(?:整理|列出|建立|制作|创建|准备|撰写|输出|汇总|收集|核查|验证|访谈|比较|评分|梳理|盘点|拉名单|生成|记录|补证据|跑一轮|建表|核对)/.test(normalized)
  const basisIntent =
    /^(?:if|whether|when|what|which|who|where|how|why)\b/i.test(normalized) ||
    /(?:是否|谁|什么|什么时候|何时|哪里|如何|怎么|哪种|哪个|为什么|标准|条件|指标|观察|信号|核查|访谈|问题|证据)/.test(normalized)
  const outputIntent =
    /\b(?:list|checklist|table|sheet|guide|brief|report|summary|definition|matrix|scorecard|template|plan|transcript|notes?|writeup|memo)\b/i.test(normalized) ||
    /(?:清单|名单|表|表格|提纲|报告|汇总|定义|纪要|模板|矩阵|评分表|记录|说明|文档)/.test(normalized)

  let score = 0
  if (role === 'basis') {
    if (basisIntent) {
      score += 4
    }
    if (isQuestion) {
      score += 2
    }
    if (actionIntent) {
      score -= 2
    }
    if (outputIntent) {
      score -= 1
    }
  } else {
    if (actionIntent) {
      score += 4
    }
    if (outputIntent) {
      score += 2
    }
    if (isQuestion) {
      score -= 2
    }
    if (basisIntent && !actionIntent) {
      score -= 1
    }
  }

  if (normalized.length < 8) {
    score -= 1
  }
  if (normalized.length > 220) {
    score -= 1
  }
  return score
}

function selectBatchRepairCandidates(texts: string[], role: 'basis' | 'action', limit: number): { items: string[]; mode: 'strong' | 'relaxed' | 'none' } {
  const ranked = texts
    .map((text, index) => ({ text, index, score: scoreBatchRepairCandidate(text, role) }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.index - right.index
    })

  const strong = ranked.filter((entry) => entry.score >= 4).slice(0, limit)
  if (strong.length > 0) {
    return { items: strong.map((entry) => entry.text), mode: 'strong' }
  }

  const relaxed = ranked.filter((entry) => entry.score >= 2).slice(0, limit)
  if (relaxed.length > 0) {
    return { items: relaxed.map((entry) => entry.text), mode: 'relaxed' }
  }

  return { items: [], mode: 'none' }
}

function collectModuleRepairCandidates(
  moduleNode: TextImportPreviewNode,
  basisGroup: TextImportPreviewNode | null,
  actionGroup: TextImportPreviewNode | null,
  topicHintTexts: string[],
): string[] {
  const texts: string[] = []
  const pushText = (value: string | null | undefined) => {
    splitBatchRepairCandidateText(value).forEach((item) => {
      texts.push(item)
    })
  }

  pushText(moduleNode.note)
  pushText(basisGroup?.note)
  pushText(actionGroup?.note)

  const coreGroup = moduleNode.children.find((child) => child.structureRole === 'core_judgment_group') ?? null
  if (coreGroup) {
    pushText(coreGroup.note)
    coreGroup.children.forEach((coreChild) => {
      pushText(coreChild.title)
      pushText(coreChild.note)
    })
  }

  topicHintTexts.forEach((text) => {
    pushText(text)
  })

  const deduped: string[] = []
  const seen = new Set<string>()
  texts.forEach((text) => {
    const key = normalizeTextForMatch(text)
    if (!key || seen.has(key)) {
      return
    }
    seen.add(key)
    deduped.push(text)
  })
  return deduped
}

function inferBatchActionOutput(text: string): string | null {
  const hasOutputHint =
    /\b(?:list|checklist|table|sheet|guide|brief|report|summary|definition|matrix|scorecard|template|plan|transcript|notes?|writeup|memo)\b/i.test(text) ||
    /(?:清单|名单|表|表格|提纲|报告|汇总|定义|纪要|模板|矩阵|评分表|记录|说明|文档)/.test(text)
  if (!hasOutputHint) {
    return null
  }
  return text.trim()
}

function buildBatchFallbackGroupNote(role: 'basis' | 'action', candidates: string[]): string | null {
  const first = candidates[0]?.trim()
  if (!first) {
    return null
  }
  return role === 'basis'
    ? `Pending basis detail from merged sources: ${first.slice(0, 160)}`
    : `Pending action detail from merged sources: ${first.slice(0, 160)}`
}

function repairMergedJudgmentGroups(
  canonicalFileRoot: TextImportPreviewNode,
  topicHintTexts: string[],
): { autoFilledCount: number; keptGroupNoteCount: number; warnings: string[] } {
  const canonicalRoot = selectSemanticRoot(canonicalFileRoot)
  const warnings: string[] = []
  let autoFilledCount = 0
  let keptGroupNoteCount = 0

  const modules = canonicalRoot.children.filter((child) => child.structureRole === 'judgment_module')
  modules.forEach((moduleNode) => {
    const basisGroup = moduleNode.children.find((child) => child.structureRole === 'judgment_basis_group') ?? null
    const actionGroup = moduleNode.children.find((child) => child.structureRole === 'potential_action_group') ?? null
    const candidates = collectModuleRepairCandidates(moduleNode, basisGroup, actionGroup, topicHintTexts)

    const ensureGroupChildren = (groupNode: TextImportPreviewNode | null, role: 'basis' | 'action') => {
      if (!groupNode || groupNode.children.length > 0) {
        return
      }

      const selection = selectBatchRepairCandidates(candidates, role, role === 'basis' ? 6 : 5)
      if (selection.items.length === 0) {
        if (!groupNode.note?.trim()) {
          groupNode.note = buildBatchFallbackGroupNote(role, candidates)
        }
        keptGroupNoteCount += 1
        warnings.push(
          `[kept-group-note] Judgment group "${groupNode.title}" in module "${moduleNode.title}" has no extractable ${role} candidates; kept group note.`,
        )
        return
      }

      selection.items.forEach((text, index) => {
        const taskOutput = role === 'action' ? inferBatchActionOutput(text) : null
        const childId = `${groupNode.id}__autofill_${role}_${index + 1}`
        const isQuestion = /[?？]$/.test(text)
        groupNode.children.push({
          id: childId,
          parentId: groupNode.id,
          order: groupNode.children.length,
          title: text.length <= 120 ? text : `${text.slice(0, 117).trimEnd()}...`,
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
          semanticRole:
            role === 'basis'
              ? (isQuestion ? 'question' : 'evidence')
              : (taskOutput ? 'task' : 'claim'),
          semanticType:
            role === 'basis'
              ? (isQuestion ? 'question' : 'evidence')
              : (taskOutput ? 'task' : 'claim'),
          confidence: 'medium',
          sourceAnchors: [],
          structureRole: role === 'basis' ? 'basis_item' : 'action_item',
          locked: false,
          sourceModuleId: moduleNode.id,
          proposedReorder: null,
          proposedReparent: null,
          taskDependsOn: [],
          inferredOutput: taskOutput ? true : null,
          mirroredTaskId: taskOutput ? `execution::${childId}` : null,
          children: [],
        })
      })
      groupNode.note = null
      autoFilledCount += selection.items.length
      warnings.push(
        `[auto-filled] Judgment group "${groupNode.title}" in module "${moduleNode.title}" was auto-filled with ${selection.items.length} inferred ${role} items (${selection.mode}).`,
      )
    }

    ensureGroupChildren(basisGroup, 'basis')
    ensureGroupChildren(actionGroup, 'action')
  })

  return { autoFilledCount, keptGroupNoteCount, warnings }
}

function buildHintTextsByCanonicalTopic(
  files: BatchTextImportPreviewSource[],
  metadataBySourceName: Record<string, BatchSourceMergeMetadata>,
): Record<string, string[]> {
  const grouped = new Map<string, string[]>()
  const pushCandidate = (topicId: string, value: string | null | undefined) => {
    splitBatchRepairCandidateText(value).forEach((text) => {
      const bucket = grouped.get(topicId) ?? []
      bucket.push(text)
      grouped.set(topicId, bucket)
    })
  }

  files.forEach((file) => {
    const metadata = metadataBySourceName[file.sourceName]
    if (!metadata?.canonicalTopicId) {
      return
    }
    const topicId = metadata.canonicalTopicId
    file.preprocessedHints
      .filter((hint) => hint.kind !== 'heading')
      .forEach((hint) => {
        if (hint.items?.length) {
          hint.items.forEach((item) => pushCandidate(topicId, item))
          return
        }
        pushCandidate(topicId, hint.text)
      })
    file.semanticHints.forEach((hint) => {
      pushCandidate(topicId, hint.text)
    })
  })

  const result: Record<string, string[]> = {}
  grouped.forEach((texts, topicId) => {
    const deduped: string[] = []
    const seen = new Set<string>()
    texts.forEach((text) => {
      const key = normalizeTextForMatch(text)
      if (!key || seen.has(key)) {
        return
      }
      seen.add(key)
      deduped.push(text)
    })
    result[topicId] = deduped
  })
  return result
}

function mergePreviewTreeIntoCanonical(
  canonicalFileRoot: TextImportPreviewNode,
  incomingFileRoot: TextImportPreviewNode,
  sourceName: string,
): void {
  const canonicalRoot = selectSemanticRoot(canonicalFileRoot)
  const incomingRoot = selectSemanticRoot(incomingFileRoot)
  const canonicalChildrenByTitle = new Map(
    canonicalRoot.children.map((node) => [normalizeTextForMatch(node.title), node] as const),
  )

  const moveChild = (child: TextImportPreviewNode, parent: TextImportPreviewNode) => {
    child.parentId = parent.id
    child.order = parent.children.length
    parent.children.push(child)
  }

  incomingRoot.children.forEach((incomingModule) => {
    const key = normalizeTextForMatch(incomingModule.title)
    const matchedModule = canonicalChildrenByTitle.get(key)
    if (!matchedModule) {
      moveChild(incomingModule, canonicalRoot)
      canonicalChildrenByTitle.set(key, incomingModule)
      return
    }
    matchedModule.note = appendUniqueTraceLine(
      matchedModule.note,
      `[Merged module trace: ${sourceName}]`,
    )
    if (incomingModule.note && incomingModule.note.trim()) {
      matchedModule.note = appendUniqueTraceLine(
        matchedModule.note,
        `[Merged module detail:${sourceName}] ${incomingModule.note.trim().slice(0, 240)}`,
      )
    }

    const matchedChildrenByTitle = new Map(
      matchedModule.children.map((node) => [normalizeTextForMatch(node.title), node] as const),
    )
    incomingModule.children.forEach((incomingGroup) => {
      const groupKey = normalizeTextForMatch(incomingGroup.title)
      const matchedGroup = matchedChildrenByTitle.get(groupKey)
      if (!matchedGroup) {
        moveChild(incomingGroup, matchedModule)
        matchedChildrenByTitle.set(groupKey, incomingGroup)
        return
      }
      matchedGroup.note = appendUniqueTraceLine(
        matchedGroup.note,
        `[Merged group trace: ${sourceName}]`,
      )
      if (incomingGroup.note && incomingGroup.note.trim()) {
        matchedGroup.note = appendUniqueTraceLine(
          matchedGroup.note,
          `[Merged group detail:${sourceName}] ${incomingGroup.note.trim().slice(0, 240)}`,
        )
      }
      const existingLeafByKey = new Map(
        matchedGroup.children.map((node) => [normalizeTextForMatch(node.title), node] as const),
      )
      incomingGroup.children.forEach((incomingLeaf) => {
        const leafKey = normalizeTextForMatch(incomingLeaf.title)
        const existingLeaf = leafKey ? existingLeafByKey.get(leafKey) : undefined
        if (leafKey && existingLeaf) {
          existingLeaf.note = appendConflictTrace(
            existingLeaf.note,
            sourceName,
            incomingLeaf.title,
            incomingLeaf.note,
          )
          return
        }
        moveChild(incomingLeaf, matchedGroup)
        if (leafKey) {
          existingLeafByKey.set(leafKey, incomingLeaf)
        }
      })
    })
  })

  const traceLine = `[Merged source trace: ${sourceName}]`
  canonicalRoot.note = canonicalRoot.note?.includes(traceLine)
    ? canonicalRoot.note
    : [canonicalRoot.note, traceLine].filter(Boolean).join('\n')
}

function applySameTopicMergeToPreviewRoots(
  roots: Array<{ sourceName: string; root: TextImportPreviewNode }>,
  metadataBySourceName: Record<string, BatchSourceMergeMetadata>,
  topicHintTextsByCanonicalTopic: Record<string, string[]>,
  warningsSink: string[],
): Array<{ sourceName: string; root: TextImportPreviewNode }> {
  if (roots.length <= 1) {
    return roots
  }

  const canonicalEntry =
    roots.find((entry) => metadataBySourceName[entry.sourceName]?.mergeMode === 'create_new' &&
      metadataBySourceName[entry.sourceName]?.sourceRole === 'canonical_knowledge') ??
    roots.find((entry) => metadataBySourceName[entry.sourceName]?.mergeMode === 'create_new') ??
    roots[0]
  if (!canonicalEntry) {
    return roots
  }

  const canonicalTopicId = metadataBySourceName[canonicalEntry.sourceName]?.canonicalTopicId
  const merged = roots.filter((entry) => entry.sourceName === canonicalEntry.sourceName)

  roots.forEach((entry) => {
    if (entry.sourceName === canonicalEntry.sourceName) {
      return
    }
    const metadata = metadataBySourceName[entry.sourceName]
    if (!metadata) {
      merged.push(entry)
      return
    }
    if (
      metadata.canonicalTopicId === canonicalTopicId &&
      (metadata.mergeMode === 'merge_into_existing' || metadata.mergeMode === 'archive_only')
    ) {
      if (metadata.mergeMode === 'merge_into_existing') {
        mergePreviewTreeIntoCanonical(canonicalEntry.root, entry.root, entry.sourceName)
      }
      return
    }
    merged.push(entry)
  })

  if (canonicalTopicId) {
    const repairSummary = repairMergedJudgmentGroups(
      canonicalEntry.root,
      topicHintTextsByCanonicalTopic[canonicalTopicId] ?? [],
    )
    warningsSink.push(...repairSummary.warnings)
  }

  return merged
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

function createKnowledgeSources(
  files: BatchTextImportPreviewSource[],
  metadataBySourceName: Record<string, BatchSourceMergeMetadata>,
): KnowledgeSource[] {
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

    const sourceMetadata = metadataBySourceName[file.sourceName]

    return {
      id: sourceId,
      type: file.sourceType,
      title: stripExtension(file.sourceName) || 'Imported source',
      raw_content: file.rawText,
      source_role: sourceMetadata?.sourceRole ?? 'canonical_knowledge',
      canonical_topic_id: sourceMetadata?.canonicalTopicId ?? `topic_${sourceId}`,
      same_as_topic_id: sourceMetadata?.sameAsTopicId ?? null,
      merge_mode: sourceMetadata?.mergeMode ?? 'create_new',
      merge_confidence: sourceMetadata?.mergeConfidence ?? 1,
      semantic_fingerprint: sourceMetadata?.semanticFingerprint ?? `fingerprint_${sourceId}`,
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
  const sourceMergeMetadataByName = resolveBatchSourceMergeMetadata(sortedFiles)
  const topicHintTextsByCanonicalTopic = buildHintTextsByCanonicalTopic(sortedFiles, sourceMergeMetadataByName)
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

  const visibleFileRoots = applySameTopicMergeToPreviewRoots(
    fileRoots,
    sourceMergeMetadataByName,
    topicHintTextsByCanonicalTopic,
    warnings,
  )
  const nestedRoots = nestFileRootsByHierarchy(visibleFileRoots)
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
  const sources = createKnowledgeSources(sortedFiles, sourceMergeMetadataByName)
  const bundleId = `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const classification = summarizeBatchClassification(sortedFiles)
  const compiled = compileSemanticLayerViews({
    bundleId,
    bundleTitle: batchTitle,
    sources,
    semanticNodes: semanticGraph.semanticNodes,
    semanticEdges: semanticGraph.semanticEdges,
    fallbackInsertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    documentType: normalizeDocumentStructureType(classification.archetype),
  })
  const activeViewId = compiled.activeViewId
  const activeProjection = compiled.viewProjections[activeViewId]
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
    warnings: [...new Set(warnings)],
    batch: {
      jobType: 'batch',
      fileCount: sortedFiles.length,
      completedFileCount: sortedFiles.length,
      currentFileName: null,
      batchContainerTitle: batchTitle,
      files: sortedFiles.map((file, index) => ({
        ...(sourceMergeMetadataByName[file.sourceName] ?? {
          sourceRole: 'canonical_knowledge',
          canonicalTopicId: `topic_source_${index + 1}`,
          sameAsTopicId: null,
          mergeMode: 'create_new',
          mergeConfidence: 1,
          semanticFingerprint: `fingerprint_source_${index + 1}`,
        }),
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
