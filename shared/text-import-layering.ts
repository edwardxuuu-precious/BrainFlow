import type {
  AiImportOperation,
  KnowledgeImportBundle,
  KnowledgeSemanticEdge,
  KnowledgeSemanticNode,
  KnowledgeSemanticNodeType,
  KnowledgeSource,
  KnowledgeSourceRef,
  KnowledgeStructureReorderProposal,
  KnowledgeStructureReparentProposal,
  KnowledgeStructureRole,
  KnowledgeView,
  KnowledgeViewProjection,
  KnowledgeViewType,
  TextImportClassification,
  TextImportConfidence,
  TextImportNodePlan,
  TextImportPreprocessHint,
  TextImportPreviewItem,
  TextImportRequest,
  TextImportSemanticHint,
  TextImportTemplateSlot,
  TextImportTemplateSummary,
} from './ai-contract.js'
import {
  compileTextImportNodePlans,
  detectTextImportContentProfile,
  type PlannedTextImportStructure,
  planTextImportFromSemanticHints,
  resolveTextImportNodeBudget,
} from './text-import-semantics.js'

export const PRIMARY_KNOWLEDGE_VIEW_TYPE: KnowledgeViewType = 'thinking_view'

export type DocumentStructureType = Extract<
  TextImportClassification['archetype'],
  'analysis' | 'process' | 'plan' | 'notes'
>

type ThinkingHeadingClass = 'wrapper' | 'semantic' | 'archival'

const WRAPPER_TITLE_PATTERNS = [
  /^说明$/i,
  /^备注$/i,
  /^对话记录$/i,
  /^用户$/i,
  /^助手$/i,
  /^user$/i,
  /^assistant$/i,
  /^文件格式$/i,
  /^本文说明$/i,
  /^当前对话整理$/i,
  /^对话整理$/i,
  /^markdown 记录$/i,
  /^turn\s*\d+\s*[·.\-:]\s*user$/i,
  /^turn\s*\d+\s*[·.\-:]\s*assistant$/i,
]

const ARCHIVAL_TITLE_PATTERNS = [
  /^archive$/i,
  /^source archive$/i,
  /^source outline$/i,
  /^source tree$/i,
  /^原文结构$/i,
  /^原文大纲$/i,
  /^来源归档$/i,
  /^来源大纲$/i,
  /^source$/i,
]

const PREFERRED_SEMANTIC_TITLE_PATTERNS = [
  /^结论$/i,
  /^拆解$/i,
  /^方法$/i,
  /^决策$/i,
  /^下一步$/i,
]

const GENERIC_ROOT_TITLE_PATTERNS = [
  /^import(?:ed)? source$/i,
  /^document$/i,
  /^document title$/i,
  /^logic map$/i,
  /^map$/i,
]

const THINKING_ROOT_TYPE_SCORE: Record<KnowledgeSemanticNodeType, number> = {
  question: 120,
  decision: 112,
  claim: 108,
  section: 96,
  task: 84,
  risk: 80,
  metric: 78,
  evidence: 60,
  topic: 72,
  criterion: 78,
  insight: 108,
  goal: 92,
  project: 88,
  review: 70,
}

interface ImportLayerSourceInput {
  sourceName: string
  sourceType: TextImportRequest['sourceType']
  rawText: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
}

interface ImportLayerBundleOptions {
  bundleId: string
  bundleTitle: string
  anchorTopicId: string | null
  createdAt: number
  sources: ImportLayerSourceInput[]
  requestIntent: TextImportRequest['intent']
  requestedArchetype?: TextImportRequest['archetype']
  requestedArchetypeMode?: TextImportRequest['archetypeMode']
  requestedContentProfile?: TextImportRequest['contentProfile']
  requestedNodeBudget?: TextImportRequest['nodeBudget']
  fallbackInsertionParentTopicId: string
  precomputedPlan?: PlannedTextImportStructure
}

export interface CompileSemanticLayerViewsOptions {
  bundleId: string
  bundleTitle: string
  sources: KnowledgeSource[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  fallbackInsertionParentTopicId: string
  documentType?: DocumentStructureType | null
}

export interface ImportLayerPreviewResult {
  bundle: KnowledgeImportBundle
  classification: TextImportClassification
  templateSummary: TextImportTemplateSummary
  nodePlans: TextImportNodePlan[]
  previewNodes: TextImportPreviewItem[]
  operations: AiImportOperation[]
  sources: KnowledgeSource[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  views: KnowledgeView[]
  viewProjections: Record<string, KnowledgeViewProjection>
  defaultViewId: string
  activeViewId: string
}

interface ProjectionNode {
  id: string
  parentId: string | null
  order: number
  title: string
  note: string | null
  semanticType: KnowledgeSemanticNodeType | null
  semanticRole: TextImportNodePlan['semanticRole']
  confidence: TextImportConfidence
  sourceAnchors: Array<{ lineStart: number; lineEnd: number }>
  templateSlot: TextImportTemplateSlot | null
  structureRole: KnowledgeStructureRole | null
  locked: boolean | null
  sourceModuleId: string | null
  proposedReorder: KnowledgeStructureReorderProposal | null
  proposedReparent: KnowledgeStructureReparentProposal | null
  taskDependsOn: string[]
  inferredOutput: boolean | null
  mirroredTaskId: string | null
}

function semanticRoleFromNodeType(type: KnowledgeSemanticNodeType | null): TextImportNodePlan['semanticRole'] {
  switch (type) {
    case 'claim':
      return 'claim'
    case 'evidence':
      return 'evidence'
    case 'task':
      return 'task'
    case 'decision':
      return 'decision'
    case 'risk':
      return 'risk'
    case 'metric':
    case 'criterion':
      return 'metric'
    case 'question':
      return 'question'
    case 'goal':
    case 'project':
    case 'review':
    case 'section':
    default:
      return 'section'
  }
}

function collapseWhitespace(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizeTitleKey(value: string | null | undefined): string {
  return collapseWhitespace(value).toLowerCase()
}

export function normalizeDocumentStructureType(
  archetype: TextImportClassification['archetype'] | null | undefined,
): DocumentStructureType | null {
  switch (archetype) {
    case 'analysis':
    case 'process':
    case 'plan':
    case 'notes':
      return archetype
    default:
      return null
  }
}

function normalizeMultiline(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  items.forEach((item) => {
    const key = keyFn(item)
    if (!key || seen.has(key)) {
      return
    }
    seen.add(key)
    result.push(item)
  })
  return result
}

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

function classifyThinkingHeading(title: string): ThinkingHeadingClass {
  const normalized = normalizeTitleKey(title)
  if (!normalized) {
    return 'semantic'
  }
  if (matchesAnyPattern(normalized, WRAPPER_TITLE_PATTERNS)) {
    return 'wrapper'
  }
  if (matchesAnyPattern(normalized, ARCHIVAL_TITLE_PATTERNS)) {
    return 'archival'
  }
  return 'semantic'
}

function isPreferredSemanticHeading(title: string): boolean {
  const normalized = normalizeTitleKey(title)
  return !!normalized && matchesAnyPattern(normalized, PREFERRED_SEMANTIC_TITLE_PATTERNS)
}

function isGenericRootTitle(title: string): boolean {
  const normalized = normalizeTitleKey(title)
  return !!normalized && matchesAnyPattern(normalized, GENERIC_ROOT_TITLE_PATTERNS)
}

function shouldHideInThinkingView(node: KnowledgeSemanticNode): boolean {
  return classifyThinkingHeading(node.title) !== 'semantic'
}

function createSourceLayer(source: ImportLayerSourceInput, sourceId: string): KnowledgeSource {
  const headings = source.preprocessedHints
    .filter((hint) => hint.kind === 'heading')
    .map((hint) => ({
      level: hint.level,
      title: hint.text,
      lineStart: hint.lineStart,
      lineEnd: hint.lineEnd,
      pathTitles: hint.sourcePath,
    }))
  const segments = source.preprocessedHints.map((hint) => ({
    kind: hint.kind,
    text: hint.text,
    lineStart: hint.lineStart,
    lineEnd: hint.lineEnd,
    pathTitles: hint.sourcePath,
  }))

  return {
    id: sourceId,
    type: source.sourceType,
    title: source.sourceName.replace(/\.[^.]+$/, '') || 'Imported source',
    raw_content: source.rawText,
    source_role: 'canonical_knowledge',
    canonical_topic_id: `topic_${sourceId}`,
    same_as_topic_id: null,
    merge_mode: 'create_new',
    merge_confidence: 1,
    semantic_fingerprint: `fingerprint_${sourceId}`,
    metadata: {
      sourceName: source.sourceName,
      headingCount: headings.length,
      headings,
      segments,
    },
  }
}

function mapPlanNodeToSemanticType(plan: TextImportNodePlan): KnowledgeSemanticNodeType {
  return inferSemanticTypeFromPreviewLike(plan)
}

function normalizeSemanticNodeType(type: KnowledgeSemanticNodeType): KnowledgeSemanticNodeType {
  switch (type) {
    case 'topic':
    case 'goal':
    case 'project':
    case 'review':
      return 'section'
    case 'criterion':
      return 'metric'
    case 'insight':
      return 'claim'
    default:
      return type
  }
}

export function inferSemanticTypeFromPreviewLike(
  item: {
    semanticRole?: TextImportNodePlan['semanticRole']
    templateSlot?: TextImportTemplateSlot | null
    semanticType?: KnowledgeSemanticNodeType | null
  },
): KnowledgeSemanticNodeType {
  if (item.semanticType) {
    return normalizeSemanticNodeType(item.semanticType)
  }

  const slot = item.templateSlot
  if (slot === 'criteria') return 'metric'
  if (slot === 'evidence' || slot === 'examples' || slot === 'data') return 'evidence'
  if (slot === 'decisions') return 'decision'
  if (slot === 'goal') return 'section'
  if (slot === 'actions' || slot === 'steps' || slot === 'next_steps') return 'task'
  if (slot === 'strategy' || slot === 'themes' || slot === 'components') return 'section'
  if (slot === 'claims' || slot === 'summary' || slot === 'key_results' || slot === 'progress') return 'claim'
  if (slot === 'open_questions') return 'question'
  if (item.semanticRole === 'decision') return 'decision'
  if (item.semanticRole === 'question') return 'question'
  if (item.semanticRole === 'metric') return 'metric'
  if (item.semanticRole === 'evidence') return 'evidence'
  if (item.semanticRole === 'risk') return 'risk'
  if (item.semanticRole === 'action') return 'task'
  if (item.semanticRole === 'summary') return 'claim'
  return 'section'
}

function isSentenceLike(value: string): boolean {
  return value.length > 28 || /[，。；：,.!?]/u.test(value)
}

function compactSemanticTitle(title: string, type: KnowledgeSemanticNodeType): string {
  const normalized = collapseWhitespace(title)
  if (normalized && normalized.length <= 28 && !isSentenceLike(normalized)) {
    return normalized
  }

  switch (type) {
    case 'metric':
    case 'criterion':
      return truncateSemanticTitle(normalized, '判断标准')
    case 'question':
      return truncateSemanticTitle(normalized, '关键问题')
    case 'evidence':
      return truncateSemanticTitle(normalized, '证据')
    case 'decision':
      return truncateSemanticTitle(normalized, '决策')
    case 'task':
      return truncateSemanticTitle(normalized, '任务')
    case 'risk':
      return truncateSemanticTitle(normalized, '风险')
    case 'claim':
      return truncateSemanticTitle(normalized, '判断')
    case 'goal':
    case 'project':
    case 'section':
      return truncateSemanticTitle(normalized, '主题')
    case 'review':
      return truncateSemanticTitle(normalized, '复盘')
    default:
      return truncateSemanticTitle(normalized, '主题')
  }
}

function truncateSemanticTitle(value: string, fallback: string): string {
  if (!value) {
    return fallback
  }
  return value.length > 28 ? `${value.slice(0, 27).trimEnd()}…` : value
}

function mergeTextParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => normalizeMultiline(part))
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

const TASK_NOTE_STATUS_VALUES = new Set(['todo', 'in_progress', 'blocked', 'done'])
const TASK_NOTE_PRIORITY_VALUES = new Set(['low', 'medium', 'high'])

function splitNoteParagraphs(value: string | null | undefined): string[] {
  const normalized = normalizeMultiline(value)
  if (!normalized) {
    return []
  }

  return normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function paragraphKey(value: string): string {
  return collapseWhitespace(value).toLowerCase()
}

function pushUniqueParagraph(
  target: string[],
  seen: Set<string>,
  paragraph: string | null | undefined,
): void {
  splitNoteParagraphs(paragraph).forEach((entry) => {
    const key = paragraphKey(entry)
    if (!key || seen.has(key)) {
      return
    }
    seen.add(key)
    target.push(entry)
  })
}

function parseTaskNoteParagraph(
  paragraph: string,
): {
  isTaskBlock: boolean
  patch: Partial<NonNullable<KnowledgeSemanticNode['task']>>
} {
  const lines = normalizeMultiline(paragraph)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { isTaskBlock: false, patch: {} }
  }

  const patch: Partial<NonNullable<KnowledgeSemanticNode['task']>> = {}
  for (const line of lines) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!match) {
      return { isTaskBlock: false, patch: {} }
    }

    const [, rawKey, rawValue] = match
    const value = rawValue.trim()
    switch (rawKey) {
      case 'status':
        if (TASK_NOTE_STATUS_VALUES.has(value)) {
          patch.status = value as NonNullable<KnowledgeSemanticNode['task']>['status']
        }
        break
      case 'owner':
        patch.owner = value || null
        break
      case 'due_date':
        patch.due_date = value || null
        break
      case 'priority':
        patch.priority = TASK_NOTE_PRIORITY_VALUES.has(value)
          ? (value as NonNullable<KnowledgeSemanticNode['task']>['priority'])
          : null
        break
      case 'output':
        patch.output = value || null
        break
      case 'definition_of_done':
        patch.definition_of_done = value || null
        break
      case 'depends_on':
        patch.depends_on = value
          ? value.split(',').map((item) => item.trim()).filter(Boolean)
          : []
        break
      case 'inferred_output':
        patch.inferred_output = value === 'true'
        break
      case 'mirrored_task_id':
        patch.mirrored_task_id = value || null
        break
      default:
        return { isTaskBlock: false, patch: {} }
    }
  }

  return { isTaskBlock: true, patch }
}

export function parseKnowledgeNodeNote(options: {
  note: string | null | undefined
  title?: string | null
  summary?: string | null
}): {
  detail: string
  taskPatch: Partial<NonNullable<KnowledgeSemanticNode['task']>>
} {
  const detailParagraphs: string[] = []
  const seen = new Set<string>()
  const taskPatch: Partial<NonNullable<KnowledgeSemanticNode['task']>> = {}
  const ignoredKeys = new Set(
    [options.title, options.summary]
      .flatMap((value) => splitNoteParagraphs(value))
      .map((value) => paragraphKey(value))
      .filter(Boolean),
  )

  splitNoteParagraphs(options.note).forEach((paragraph) => {
    const { isTaskBlock, patch } = parseTaskNoteParagraph(paragraph)
    if (isTaskBlock) {
      Object.assign(taskPatch, patch)
      return
    }

    const key = paragraphKey(paragraph)
    if (!key || ignoredKeys.has(key) || seen.has(key)) {
      return
    }
    seen.add(key)
    detailParagraphs.push(paragraph)
  })

  return {
    detail: detailParagraphs.join('\n\n').trim(),
    taskPatch,
  }
}

function buildTaskNoteBlock(task: NonNullable<KnowledgeSemanticNode['task']> | null): string | null {
  if (!task) {
    return null
  }

  const lines = [
    `status: ${task.status}`,
    task.owner ? `owner: ${task.owner}` : null,
    task.due_date ? `due_date: ${task.due_date}` : null,
    task.priority ? `priority: ${task.priority}` : null,
    task.depends_on.length > 0 ? `depends_on: ${task.depends_on.join(', ')}` : null,
    task.output ? `output: ${task.output}` : null,
    task.inferred_output ? 'inferred_output: true' : null,
    task.mirrored_task_id ? `mirrored_task_id: ${task.mirrored_task_id}` : null,
    task.definition_of_done ? `definition_of_done: ${task.definition_of_done}` : null,
  ].filter((line): line is string => Boolean(line))

  return lines.length > 0 ? lines.join('\n') : null
}

export function buildKnowledgeNodeNote(options: {
  title: string
  summary?: string | null
  detail?: string | null
  task?: NonNullable<KnowledgeSemanticNode['task']> | null
}): string {
  const paragraphs: string[] = []
  const seen = new Set<string>()

  const normalizedTitle = collapseWhitespace(options.title)
  const normalizedSummary = collapseWhitespace(options.summary)
  if (normalizedSummary && normalizedSummary !== normalizedTitle) {
    pushUniqueParagraph(paragraphs, seen, normalizedSummary)
  }

  const parsedDetail = parseKnowledgeNodeNote({
    note: options.detail,
    title: options.title,
    summary: options.summary,
  }).detail
  pushUniqueParagraph(paragraphs, seen, parsedDetail)
  pushUniqueParagraph(paragraphs, seen, buildTaskNoteBlock(options.task ?? null))

  return paragraphs.join('\n\n').trim()
}

function createDefaultTaskFields(
  priority: 'low' | 'medium' | 'high' | null = null,
): NonNullable<KnowledgeSemanticNode['task']> {
  return {
    status: 'todo',
    owner: null,
    due_date: null,
    priority,
    depends_on: [],
    output: null,
    inferred_output: false,
    mirrored_task_id: null,
    source_refs: [],
    definition_of_done: null,
  }
}

export function deriveSemanticGraphFromPreviewNodes(options: {
  previewNodes: TextImportPreviewItem[]
  existingNodes?: KnowledgeSemanticNode[]
  existingEdges?: KnowledgeSemanticEdge[]
}): {
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
} {
  const existingNodeById = new Map((options.existingNodes ?? []).map((node) => [node.id, node]))
  const existingEdgeByKey = new Map<string, KnowledgeSemanticEdge>(
    (options.existingEdges ?? []).map((edge) => [`${edge.from}->${edge.to}`, edge] as const),
  )

  const semanticNodes = options.previewNodes.map<KnowledgeSemanticNode>((node) => {
    const existing = existingNodeById.get(node.id)
    const semanticType = inferSemanticTypeFromPreviewLike(node)
    const title = collapseWhitespace(node.title) || existing?.title || 'Untitled'
    const parsedNote = parseKnowledgeNodeNote({
      note: node.note,
      title,
      summary: existing?.summary ?? title,
    })
    const summary =
      existing?.summary && collapseWhitespace(existing.summary) !== collapseWhitespace(existing.title)
        ? existing.summary
        : title
    const nextTask =
      semanticType === 'task'
        ? {
            ...(existing?.task ?? createDefaultTaskFields()),
            ...parsedNote.taskPatch,
            depends_on: node.taskDependsOn ?? parsedNote.taskPatch.depends_on ?? existing?.task?.depends_on ?? [],
            inferred_output:
              typeof node.inferredOutput === 'boolean'
                ? node.inferredOutput
                : parsedNote.taskPatch.inferred_output ?? existing?.task?.inferred_output ?? false,
            mirrored_task_id:
              node.mirroredTaskId ??
              parsedNote.taskPatch.mirrored_task_id ??
              existing?.task?.mirrored_task_id ??
              null,
            source_refs: existing?.task?.source_refs ?? [],
          }
        : null

    return {
      id: node.id,
      type: semanticType,
      title,
      summary,
      detail: parsedNote.detail,
      source_refs: existing?.source_refs ?? [],
      confidence: node.confidence ?? existing?.confidence ?? 'medium',
      structure_role: node.structureRole ?? existing?.structure_role ?? null,
      locked:
        typeof node.locked === 'boolean' ? node.locked : existing?.locked ?? false,
      source_module_id: node.sourceModuleId ?? existing?.source_module_id ?? null,
      proposed_reorder: node.proposedReorder ?? existing?.proposed_reorder ?? null,
      proposed_reparent: node.proposedReparent ?? existing?.proposed_reparent ?? null,
      task: nextTask,
    }
  })

  const semanticEdges = options.previewNodes
    .filter((node) => node.parentId)
    .map<KnowledgeSemanticEdge>((node) => {
      const edgeKey = `${node.id}->${node.parentId as string}`
      const existing = existingEdgeByKey.get(edgeKey)

      return {
        from: node.id,
        to: node.parentId as string,
        type: existing?.type ?? 'belongs_to',
        label: existing?.label ?? null,
        source_refs: existing?.source_refs ?? [],
        confidence: node.confidence ?? existing?.confidence ?? 'medium',
      }
    })

  return {
    semanticNodes,
    semanticEdges,
  }
}

function createPlannerFallbackGraph(options: {
  bundleTitle: string
  sources: KnowledgeSource[]
  sourceInputs: ImportLayerSourceInput[]
  requestIntent: TextImportRequest['intent']
  requestedArchetype?: TextImportRequest['archetype']
  requestedArchetypeMode?: TextImportRequest['archetypeMode']
  requestedContentProfile?: TextImportRequest['contentProfile']
  requestedNodeBudget?: TextImportRequest['nodeBudget']
  precomputedPlan?: PlannedTextImportStructure
}): {
  classification: TextImportClassification
  templateSummary: TextImportTemplateSummary
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
} {
  const combinedHints = options.sourceInputs.flatMap((source) => source.preprocessedHints)
  const combinedSemanticHints = options.sourceInputs.flatMap((source) => source.semanticHints)
  const sourceTitle = options.sources[0]?.title ?? options.bundleTitle
  const profile = detectTextImportContentProfile({
    sourceName: sourceTitle,
    preprocessedHints: combinedHints,
    semanticHints: combinedSemanticHints,
    explicitProfile: options.requestedContentProfile,
    explicitArchetype: options.requestedArchetype,
    archetypeMode: options.requestedArchetypeMode,
  })
  const nodeBudget = resolveTextImportNodeBudget(
    options.requestIntent,
    profile,
    options.requestedNodeBudget,
  )
  const planned =
    options.precomputedPlan ??
    planTextImportFromSemanticHints({
      rootTitle: options.bundleTitle,
      intent: options.requestIntent,
      sourceName: sourceTitle,
      preprocessedHints: combinedHints,
      profile,
      archetype: options.requestedArchetype,
      archetypeMode: options.requestedArchetypeMode,
      nodeBudget,
      semanticHints: combinedSemanticHints,
    })

  const semanticNodes = planned.nodePlans.map<KnowledgeSemanticNode>((plan) => {
    const semanticType = mapPlanNodeToSemanticType(plan)
    const compactTitle = compactSemanticTitle(plan.title, semanticType)
    const mergedDetail =
      compactTitle !== collapseWhitespace(plan.title)
        ? mergeTextParts([plan.title, plan.note])
        : mergeTextParts([plan.note])
    const sourceRefs = planAnchorsToSourceRefs(plan, options.sources, options.sourceInputs)
    const parsedPlanNote = parseKnowledgeNodeNote({
      note: plan.note,
      title: compactTitle,
      summary: collapseWhitespace(plan.title),
    })
    return {
      id: plan.id,
      type: semanticType,
      title: compactTitle,
      summary: collapseWhitespace(plan.title),
      detail: parsedPlanNote.detail || mergedDetail,
      source_refs: sourceRefs,
      confidence: plan.confidence,
      task:
        semanticType === 'task'
          ? {
              status: 'todo',
              owner: null,
              due_date: null,
              priority: parsedPlanNote.taskPatch.priority ?? null,
              depends_on: [],
              output: parsedPlanNote.taskPatch.output ?? null,
              inferred_output: parsedPlanNote.taskPatch.inferred_output ?? false,
              mirrored_task_id: parsedPlanNote.taskPatch.mirrored_task_id ?? null,
              definition_of_done: null,
              ...parsedPlanNote.taskPatch,
              source_refs: sourceRefs,
            }
          : null,
    }
  })

  const semanticEdges = planned.nodePlans
    .filter((plan) => plan.parentId)
    .map<KnowledgeSemanticEdge>((plan) => ({
      from: plan.id,
      to: plan.parentId as string,
      type: 'belongs_to',
      label: null,
      source_refs: planAnchorsToSourceRefs(plan, options.sources, options.sourceInputs),
      confidence: plan.confidence,
    }))
  planned.nodePlans
    .filter((plan) => plan.parentId && (plan.semanticType === 'evidence' || plan.semanticType === 'metric'))
    .forEach((plan) => {
      semanticEdges.push({
        from: plan.id,
        to: plan.parentId as string,
        type: 'supports',
        label: null,
        source_refs: planAnchorsToSourceRefs(plan, options.sources, options.sourceInputs),
        confidence: plan.confidence,
      })
    })

  return {
    classification: planned.classification,
    templateSummary: planned.templateSummary,
    semanticNodes,
    semanticEdges,
  }
}

function canonicalizeSemanticGraph(graph: {
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
}): {
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
} {
  const semanticNodes = graph.semanticNodes.map<KnowledgeSemanticNode>((node) => {
    const normalizedType = normalizeSemanticNodeType(node.type)
    const compactTitle = compactSemanticTitle(node.title, normalizedType)
    return {
      ...node,
      type: normalizedType,
      title: compactTitle,
      summary: collapseWhitespace(node.summary) || compactTitle,
      detail:
        compactTitle !== collapseWhitespace(node.title)
          ? mergeTextParts([node.title, node.summary, node.detail])
          : mergeTextParts([node.detail]),
      source_refs: uniqueBy(
        node.source_refs,
        (ref) => `${ref.sourceId}:${ref.lineStart}:${ref.lineEnd}:${ref.pathTitles.join('>')}`,
      ),
    }
  })

  return {
    semanticNodes,
    semanticEdges: uniqueBy(
      graph.semanticEdges
        .filter((edge) => edge.from !== edge.to),
      (edge) => `${edge.from}:${edge.to}:${edge.type}:${edge.label ?? ''}`,
    ),
  }
}

function sourceRefsToAnchors(sourceRefs: KnowledgeSourceRef[]): Array<{ lineStart: number; lineEnd: number }> {
  return uniqueBy(
    sourceRefs.map((ref) => ({ lineStart: ref.lineStart, lineEnd: ref.lineEnd })),
    (anchor) => `${anchor.lineStart}:${anchor.lineEnd}`,
  )
}

function planAnchorsToSourceRefs(
  plan: TextImportNodePlan,
  sources: KnowledgeSource[],
  sourceInputs: ImportLayerSourceInput[],
): KnowledgeSourceRef[] {
  return uniqueBy(
    plan.sourceAnchors.map((anchor) => {
      const sourceMatch = sourceInputs
        .map((sourceInput, index) => ({
          source: sources[index],
          hint: sourceInput.preprocessedHints.find(
            (hint) => hint.lineStart === anchor.lineStart && hint.lineEnd === anchor.lineEnd,
          ),
        }))
        .find((candidate) => candidate.source && candidate.hint)
      return {
        sourceId: sourceMatch?.source?.id ?? sources[0]?.id ?? 'source_1',
        lineStart: anchor.lineStart,
        lineEnd: anchor.lineEnd,
        pathTitles: sourceMatch?.hint?.sourcePath ?? [],
      }
    }),
    (ref) => `${ref.sourceId}:${ref.lineStart}:${ref.lineEnd}:${ref.pathTitles.join('>')}`,
  )
}

function buildProjectionFromNodes(options: {
  viewId: string
  viewType: KnowledgeViewType
  summary: string
  nodes: ProjectionNode[]
  fallbackInsertionParentTopicId: string
}): KnowledgeViewProjection {
  const nodePlans: TextImportNodePlan[] = options.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    order: node.order,
    title: node.title,
    note: node.note,
    semanticRole: node.semanticRole,
    semanticType: node.semanticType,
    confidence: node.confidence,
    sourceAnchors: node.sourceAnchors,
    groupKey: node.parentId ? 'projection' : 'root',
    priority: node.parentId === null ? 'primary' : node.semanticType === 'evidence' ? 'supporting' : 'secondary',
    collapsedByDefault: node.parentId !== null && node.semanticType === 'evidence',
    templateSlot: node.templateSlot,
    structureRole: node.structureRole,
    locked: node.locked,
    sourceModuleId: node.sourceModuleId,
    proposedReorder: node.proposedReorder,
    proposedReparent: node.proposedReparent,
    taskDependsOn: [...node.taskDependsOn],
    inferredOutput: node.inferredOutput,
    mirroredTaskId: node.mirroredTaskId,
  }))
  const compiled = compileTextImportNodePlans({
    insertionParentTopicId: options.fallbackInsertionParentTopicId,
    nodePlans,
  })
  return {
    viewId: options.viewId,
    viewType: options.viewType,
    summary: options.summary,
    nodePlans,
    previewNodes: compiled.previewNodes,
    operations: compiled.operations,
  }
}

const JUDGMENT_TREE_ROLES = new Set<KnowledgeStructureRole>([
  'root_context',
  'judgment_module',
  'core_judgment_group',
  'judgment_basis_group',
  'potential_action_group',
  'core_judgment',
  'basis_item',
  'action_item',
  'execution_root',
  'execution_task_mirror',
])

function isJudgmentTreeGraph(nodes: KnowledgeSemanticNode[]): boolean {
  return nodes.some((node) => node.structure_role && JUDGMENT_TREE_ROLES.has(node.structure_role))
}

function projectionNodeFromSemanticNode(options: {
  node: KnowledgeSemanticNode
  parentId: string | null
  order: number
}): ProjectionNode {
  const { node, parentId, order } = options
  return {
    id: node.id,
    parentId,
    order,
    title: node.title,
    note: buildKnowledgeNodeNote({
      title: node.title,
      summary: node.summary,
      detail: node.detail,
      task: node.type === 'task' ? node.task : null,
    }),
    semanticType: node.type,
    semanticRole: semanticRoleFromNodeType(node.type),
    confidence: node.confidence,
    sourceAnchors: sourceRefsToAnchors(node.source_refs),
    templateSlot: null,
    structureRole: node.structure_role ?? null,
    locked: node.locked ?? false,
    sourceModuleId: node.source_module_id ?? null,
    proposedReorder: node.proposed_reorder ?? null,
    proposedReparent: node.proposed_reparent ?? null,
    taskDependsOn: [...(node.task?.depends_on ?? [])],
    inferredOutput: node.task ? node.task.inferred_output : null,
    mirroredTaskId: node.task?.mirrored_task_id ?? null,
  }
}

function sortNodesByReorderProposals(nodes: KnowledgeSemanticNode[]): KnowledgeSemanticNode[] {
  const ordered = [...nodes]
  ordered.forEach((node) => {
    const afterId = node.proposed_reorder?.after_node_id
    if (!afterId) {
      return
    }
    const fromIndex = ordered.findIndex((candidate) => candidate.id === node.id)
    const targetIndex = ordered.findIndex((candidate) => candidate.id === afterId)
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
      return
    }
    const [moved] = ordered.splice(fromIndex, 1)
    ordered.splice(targetIndex + 1, 0, moved)
  })
  return ordered
}

function sortChildren(
  parentId: string,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
  allowedTypes?: KnowledgeSemanticNodeType[],
): KnowledgeSemanticNode[] {
  const edges = (edgesByParent.get(parentId) ?? []).filter((edge) => edge.type === 'belongs_to')
  return edges
    .map((edge) => nodesById.get(edge.from))
    .filter((node): node is KnowledgeSemanticNode => !!node)
    .filter((node) => (allowedTypes ? allowedTypes.includes(node.type) : true))
}

function collectVisibleThinkingChildren(
  parentId: string,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
  trail: Set<string> = new Set(),
): KnowledgeSemanticNode[] {
  if (trail.has(parentId)) {
    return []
  }

  const nextTrail = new Set(trail)
  nextTrail.add(parentId)

  return uniqueBy(
    sortChildren(parentId, nodesById, edgesByParent).flatMap((child) => {
      if (!shouldHideInThinkingView(child)) {
        return [child]
      }
      return collectVisibleThinkingChildren(child.id, nodesById, edgesByParent, nextTrail)
    }),
    (node) => node.id,
  )
}

function collectJudgmentChildren(
  parentId: string,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
): KnowledgeSemanticNode[] {
  return sortNodesByReorderProposals(sortChildren(parentId, nodesById, edgesByParent))
}

function shouldHideEmptyJudgmentGroup(
  node: KnowledgeSemanticNode,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
): boolean {
  if (
    node.structure_role !== 'judgment_basis_group' &&
    node.structure_role !== 'potential_action_group'
  ) {
    return false
  }

  return collectJudgmentChildren(node.id, nodesById, edgesByParent).length === 0
}

function selectThinkingCenter(options: {
  semanticNodes: KnowledgeSemanticNode[]
  nodesById: Map<string, KnowledgeSemanticNode>
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>
  hasParent: Set<string>
  bundleTitle: string
  sourceTitles: string[]
}): KnowledgeSemanticNode | null {
  const containerTitles = new Set(
    [options.bundleTitle, ...options.sourceTitles].map((title) => normalizeTitleKey(title)).filter(Boolean),
  )

  const ranked = options.semanticNodes
    .map((node, index) => {
      const visibleChildCount = collectVisibleThinkingChildren(
        node.id,
        options.nodesById,
        options.edgesByParent,
      ).length
      const headingClass = classifyThinkingHeading(node.title)
      let score = THINKING_ROOT_TYPE_SCORE[node.type] ?? 0

      if (!options.hasParent.has(node.id)) {
        score += 24
      }
      score += Math.min(visibleChildCount, 6) * 4
      if (isPreferredSemanticHeading(node.title)) {
        score += 10
      }
      if (!isGenericRootTitle(node.title)) {
        score += 8
      }
      if (node.id === 'import_root') {
        score -= 12
      }
      if (containerTitles.has(normalizeTitleKey(node.title))) {
        score -= 24
      }
      if (headingClass === 'wrapper') {
        score -= 72
      } else if (headingClass === 'archival') {
        score -= 56
      }
      if (node.type === 'evidence' || node.type === 'metric') {
        score -= 24
      }

      return { node, index, score }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.index - right.index
    })

  return ranked[0]?.node ?? null
}

function promoteAnalysisCenter(
  center: KnowledgeSemanticNode,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
): KnowledgeSemanticNode {
  let current = center

  while (true) {
    const directChildren = collectVisibleThinkingChildren(current.id, nodesById, edgesByParent)
    if (directChildren.length !== 1) {
      return current
    }

    const candidate = directChildren[0]
    const peerSections = collectVisibleThinkingChildren(candidate.id, nodesById, edgesByParent).filter(
      (node) => node.type === 'section' || node.type === 'claim' || node.type === 'decision' || node.type === 'question',
    )
    if (peerSections.length < 4 || peerSections.length > 8) {
      return current
    }
    current = candidate
  }
}

function selectAnalysisBranchChildren(
  branch: KnowledgeSemanticNode,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
): KnowledgeSemanticNode[] {
  const children = collectVisibleThinkingChildren(branch.id, nodesById, edgesByParent)
  if (children.length <= 3) {
    return children
  }

  const picks: KnowledgeSemanticNode[] = []
  const seen = new Set<string>()
  const pickFirst = (predicate: (node: KnowledgeSemanticNode) => boolean) => {
    const match = children.find((node) => !seen.has(node.id) && predicate(node))
    if (!match) {
      return
    }
    seen.add(match.id)
    picks.push(match)
  }

  pickFirst((node) => node.type === 'claim' || node.type === 'decision' || node.type === 'section')
  pickFirst(
    (node) =>
      node.type === 'metric' ||
      node.type === 'evidence' ||
      node.type === 'question' ||
      node.type === 'risk',
  )
  pickFirst((node) => node.type === 'task')

  if (picks.length === 0) {
    return children.slice(0, 3)
  }

  if (picks.length < 3) {
    children.forEach((node) => {
      if (picks.length >= 3 || seen.has(node.id)) {
        return
      }
      seen.add(node.id)
      picks.push(node)
    })
  }

  return picks
}

export function inferDocumentStructureTypeFromSemanticGraph(options: {
  bundleTitle: string
  sourceTitles: string[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
}): DocumentStructureType | null {
  if (options.semanticNodes.length === 0) {
    return null
  }

  const nodesById = new Map(options.semanticNodes.map((node) => [node.id, node]))
  const edgesByParent = new Map<string, KnowledgeSemanticEdge[]>()
  options.semanticEdges.forEach((edge) => {
    const group = edgesByParent.get(edge.to) ?? []
    group.push(edge)
    edgesByParent.set(edge.to, group)
  })
  const hasParent = new Set(
    options.semanticEdges
      .filter((edge) => edge.type === 'belongs_to')
      .map((edge) => edge.from),
  )
  const initialCenter =
    selectThinkingCenter({
      semanticNodes: options.semanticNodes,
      nodesById,
      edgesByParent,
      hasParent,
      bundleTitle: options.bundleTitle,
      sourceTitles: options.sourceTitles,
    }) ?? options.semanticNodes[0]

  if (!initialCenter) {
    return null
  }

  const promotedCenter = promoteAnalysisCenter(initialCenter, nodesById, edgesByParent)
  if (promotedCenter.id !== initialCenter.id) {
    return 'analysis'
  }

  const peerSections = collectVisibleThinkingChildren(promotedCenter.id, nodesById, edgesByParent).filter(
    (node) =>
      node.type === 'section' ||
      node.type === 'claim' ||
      node.type === 'decision' ||
      node.type === 'question',
  )
  if (peerSections.length >= 4 && peerSections.length <= 8) {
    return 'analysis'
  }

  return null
}

function createThinkingProjection(options: {
  viewId: string
  bundleTitle: string
  sourceTitles: string[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  fallbackInsertionParentTopicId: string
  documentType?: DocumentStructureType | null
}): KnowledgeViewProjection {
  const nodesById = new Map(options.semanticNodes.map((node) => [node.id, node]))
  const edgesByParent = new Map<string, KnowledgeSemanticEdge[]>()
  options.semanticEdges.forEach((edge) => {
    const group = edgesByParent.get(edge.to) ?? []
    group.push(edge)
    edgesByParent.set(edge.to, group)
  })

  if (isJudgmentTreeGraph(options.semanticNodes)) {
    const rootContext =
      options.semanticNodes.find((node) => node.structure_role === 'root_context') ??
      options.semanticNodes.find(
        (node) =>
          collectJudgmentChildren(node.id, nodesById, edgesByParent).some(
            (child) => child.structure_role === 'judgment_module',
          ),
      ) ??
      options.semanticNodes[0]

    if (!rootContext) {
      return buildProjectionFromNodes({
        viewId: options.viewId,
        viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
        summary: 'No semantic nodes were available for the thinking view.',
        nodes: [],
        fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
      })
    }

    const projectionNodes: ProjectionNode[] = [
      projectionNodeFromSemanticNode({
        node: rootContext,
        parentId: null,
        order: 0,
      }),
    ]
    const visited = new Set<string>([rootContext.id])
    const walkJudgmentBranch = (
      node: KnowledgeSemanticNode,
      parentId: string,
      order: number,
    ): void => {
      if (visited.has(node.id)) {
        return
      }
      visited.add(node.id)
      projectionNodes.push(
        projectionNodeFromSemanticNode({
          node,
          parentId,
          order,
        }),
      )

      collectJudgmentChildren(node.id, nodesById, edgesByParent)
        .filter((child) => !shouldHideEmptyJudgmentGroup(child, nodesById, edgesByParent))
        .forEach((child, childIndex) => {
          walkJudgmentBranch(child, node.id, childIndex)
        })
    }

    const judgmentModules = collectJudgmentChildren(rootContext.id, nodesById, edgesByParent).filter(
      (node) => node.structure_role === 'judgment_module',
    )
    judgmentModules.forEach((module, moduleIndex) => {
      walkJudgmentBranch(module, rootContext.id, moduleIndex)
    })

    return buildProjectionFromNodes({
      viewId: options.viewId,
      viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
      summary: `Projected a judgment-tree thinking view with ${judgmentModules.length} modules.`,
      nodes: projectionNodes,
      fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    })
  }

  const hasParent = new Set(
    options.semanticEdges
      .filter((edge) => edge.type === 'belongs_to')
      .map((edge) => edge.from),
  )
  const requestedDocumentType = normalizeDocumentStructureType(options.documentType) ?? null
  const initialCenter =
    selectThinkingCenter({
      semanticNodes: options.semanticNodes,
      nodesById,
      edgesByParent,
      hasParent,
      bundleTitle: options.bundleTitle,
      sourceTitles: options.sourceTitles,
    }) ?? options.semanticNodes[0]
  const center =
    requestedDocumentType === 'analysis'
      ? promoteAnalysisCenter(initialCenter, nodesById, edgesByParent)
      : initialCenter

  if (!center) {
    return buildProjectionFromNodes({
      viewId: options.viewId,
      viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
      summary: 'No semantic nodes were available for the thinking view.',
      nodes: [],
      fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    })
  }

  const projectionNodes: ProjectionNode[] = [
    projectionNodeFromSemanticNode({
      node: center,
      parentId: null,
      order: 0,
    }),
  ]
  const visited = new Set<string>([center.id])
  const directPrimaryBranches = collectVisibleThinkingChildren(center.id, nodesById, edgesByParent)
  const executionRoot =
    requestedDocumentType === 'analysis'
      ? null
      : options.semanticNodes.find(
          (node) =>
            node.id !== center.id &&
            !shouldHideInThinkingView(node) &&
            (node.type === 'section' || node.type === 'goal' || node.type === 'project'),
        ) ??
        null
  const primaryBranches = [...directPrimaryBranches]

  if (executionRoot && !primaryBranches.some((node) => node.id === executionRoot.id)) {
    primaryBranches.push(executionRoot)
  }

  const appendProjectionNode = (
    node: KnowledgeSemanticNode,
    parentId: string,
    order: number,
  ): void => {
    projectionNodes.push(
      projectionNodeFromSemanticNode({
        node,
        parentId,
        order,
      }),
    )
  }

  const walkBranch = (
    node: KnowledgeSemanticNode,
    parentId: string,
    order: number,
  ): void => {
    if (visited.has(node.id)) {
      return
    }
    visited.add(node.id)
    appendProjectionNode(node, parentId, order)

    const children = collectVisibleThinkingChildren(node.id, nodesById, edgesByParent)

    children.forEach((child, childIndex) => {
      walkBranch(child, node.id, childIndex)
    })
  }

  if (requestedDocumentType === 'analysis') {
    primaryBranches.forEach((branch, branchIndex) => {
      if (visited.has(branch.id)) {
        return
      }
      visited.add(branch.id)
      appendProjectionNode(branch, center.id, branchIndex)
      selectAnalysisBranchChildren(branch, nodesById, edgesByParent).forEach((child, childIndex) => {
        if (visited.has(child.id)) {
          return
        }
        visited.add(child.id)
        appendProjectionNode(child, branch.id, childIndex)
      })
    })
  } else {
    primaryBranches.forEach((branch, branchIndex) => {
      walkBranch(branch, center.id, branchIndex)
    })
  }

  return buildProjectionFromNodes({
    viewId: options.viewId,
    viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
    summary: `Projected a thinking view around "${center.title}" with ${primaryBranches.length} primary branches.`,
    nodes: projectionNodes,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
}

export function createExecutionProjection(options: {
  viewId: string
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  fallbackInsertionParentTopicId: string
}): KnowledgeViewProjection {
  const nodesById = new Map(options.semanticNodes.map((node) => [node.id, node]))
  const edgesByParent = new Map<string, KnowledgeSemanticEdge[]>()
  options.semanticEdges.forEach((edge) => {
    const group = edgesByParent.get(edge.to) ?? []
    group.push(edge)
    edgesByParent.set(edge.to, group)
  })

  if (isJudgmentTreeGraph(options.semanticNodes)) {
    const rootContext =
      options.semanticNodes.find((node) => node.structure_role === 'root_context') ??
      options.semanticNodes[0] ??
      null
    const executionRootId = 'execution_root'
    const executionRoot: ProjectionNode = {
      id: executionRootId,
      parentId: null,
      order: 0,
      title: '执行汇总',
      note: '任务镜像汇总，保留来源模块引用。',
      semanticType: 'section',
      semanticRole: 'section',
      confidence: 'high',
      sourceAnchors: [],
      templateSlot: null,
      structureRole: 'execution_root',
      locked: false,
      sourceModuleId: null,
      proposedReorder: null,
      proposedReparent: null,
      taskDependsOn: [],
      inferredOutput: null,
      mirroredTaskId: null,
    }
    const projectionNodes: ProjectionNode[] = [executionRoot]
    const judgmentModules =
      rootContext
        ? collectJudgmentChildren(rootContext.id, nodesById, edgesByParent).filter(
            (node) => node.structure_role === 'judgment_module',
          )
        : []

    const collectModuleTasks = (node: KnowledgeSemanticNode): KnowledgeSemanticNode[] => {
      const tasks: KnowledgeSemanticNode[] = node.type === 'task' ? [node] : []
      collectJudgmentChildren(node.id, nodesById, edgesByParent).forEach((child) => {
        tasks.push(...collectModuleTasks(child))
      })
      return tasks
    }

    let mirrorOrder = 0
    judgmentModules.forEach((module) => {
      const tasks = collectModuleTasks(module)
      tasks.forEach((task) => {
        const mirrorId = task.task?.mirrored_task_id ?? `execution::${task.id}`
        const moduleTitle = nodesById.get(task.source_module_id ?? module.id)?.title ?? module.title
        projectionNodes.push({
          id: mirrorId,
          parentId: executionRootId,
          order: mirrorOrder,
          title: task.title,
          note: buildKnowledgeNodeNote({
            title: task.title,
            summary: `来源模块：${moduleTitle}`,
            detail: task.detail,
            task: task.task,
          }),
          semanticType: 'task',
          semanticRole: semanticRoleFromNodeType('task'),
          confidence: task.confidence,
          sourceAnchors: sourceRefsToAnchors(task.source_refs),
          templateSlot: null,
          structureRole: 'execution_task_mirror',
          locked: task.locked ?? false,
          sourceModuleId: task.source_module_id ?? module.id,
          proposedReorder: task.proposed_reorder ?? null,
          proposedReparent: task.proposed_reparent ?? null,
          taskDependsOn: [...(task.task?.depends_on ?? [])],
          inferredOutput: task.task?.inferred_output ?? false,
          mirroredTaskId: mirrorId,
        })
        mirrorOrder += 1
      })
    })

    return buildProjectionFromNodes({
      viewId: options.viewId,
      viewType: 'execution_view',
      summary: `Projected ${Math.max(projectionNodes.length - 1, 0)} mirrored tasks into the execution view.`,
      nodes: projectionNodes,
      fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    })
  }

  const allowedTypes: KnowledgeSemanticNodeType[] = ['section', 'claim', 'task', 'decision', 'risk', 'metric', 'goal', 'project', 'review']
  const root =
    options.semanticNodes.find((node) => node.type === 'section') ??
    options.semanticNodes.find((node) => node.type === 'goal') ??
    options.semanticNodes.find((node) => node.type === 'project') ??
    options.semanticNodes.find((node) => allowedTypes.includes(node.type))

  if (!root) {
    return buildProjectionFromNodes({
      viewId: options.viewId,
      viewType: 'execution_view',
      summary: 'No execution nodes were available for the execution view.',
      nodes: [],
      fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    })
  }

  const visited = new Set<string>()
  const projectionNodes: ProjectionNode[] = []
  const walk = (node: KnowledgeSemanticNode, parentId: string | null, order: number) => {
    if (visited.has(node.id)) {
      return
    }
    visited.add(node.id)
    projectionNodes.push(
      projectionNodeFromSemanticNode({
        node,
        parentId,
        order,
      }),
    )

    sortChildren(node.id, nodesById, edgesByParent)
      .filter((child) => allowedTypes.includes(child.type))
      .forEach((child, childIndex) => walk(child, node.id, childIndex))
  }

  walk(root, null, 0)

  return buildProjectionFromNodes({
    viewId: options.viewId,
    viewType: 'execution_view',
    summary: `Projected ${projectionNodes.length} execution nodes.`,
    nodes: projectionNodes,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
}

export function createArchiveProjection(options: {
  viewId: string
  bundleTitle: string
  sources: KnowledgeSource[]
  sourceInputs?: ImportLayerSourceInput[]
  fallbackInsertionParentTopicId: string
}): KnowledgeViewProjection {
  const projectionNodes: ProjectionNode[] = []
  const archiveRootId = `archive_root_${options.viewId}`
  projectionNodes.push({
    id: archiveRootId,
    parentId: null,
    order: 0,
    title: options.sources.length > 1 ? '来源归档' : options.bundleTitle,
    note:
      options.sources.length > 1
        ? `共 ${options.sources.length} 个来源，保留原始脉络以便追溯。`
        : '保留原始来源脉络以便追溯。',
    semanticType: null,
    semanticRole: 'section',
    confidence: 'high',
    sourceAnchors: [],
    templateSlot: null,
    structureRole: null,
    locked: false,
    sourceModuleId: null,
    proposedReorder: null,
    proposedReparent: null,
    taskDependsOn: [],
    inferredOutput: null,
    mirroredTaskId: null,
  })
  options.sources.forEach((source, sourceIndex) => {
    const rootId = `archive_${source.id}`
    projectionNodes.push({
      id: rootId,
      parentId: archiveRootId,
      order: sourceIndex,
      title: source.title,
      note: null,
      semanticType: null,
      semanticRole: 'section',
      confidence: 'high',
      sourceAnchors: [],
      templateSlot: null,
      structureRole: null,
      locked: false,
      sourceModuleId: null,
      proposedReorder: null,
      proposedReparent: null,
      taskDependsOn: [],
      inferredOutput: null,
      mirroredTaskId: null,
    })

    const seen = new Set<string>()
    const sourceInput = options.sourceInputs?.[sourceIndex]
    const fallbackSegments = Array.isArray(source.metadata.segments)
      ? (source.metadata.segments as Array<Record<string, unknown>>)
      : []
    const sourceHints =
      sourceInput?.preprocessedHints ??
      fallbackSegments.map((segment: Record<string, unknown>) => ({
        kind: typeof segment.kind === 'string' ? segment.kind : 'paragraph',
        text: typeof segment.text === 'string' ? segment.text : '',
        lineStart: typeof segment.lineStart === 'number' ? segment.lineStart : 1,
        lineEnd: typeof segment.lineEnd === 'number' ? segment.lineEnd : 1,
        sourcePath: Array.isArray(segment.pathTitles)
          ? segment.pathTitles.filter((item): item is string => typeof item === 'string')
          : [],
      }))
    sourceHints.forEach((hint) => {
      const pathTitles = hint.sourcePath.length > 0 ? hint.sourcePath : ['Imported source']
      let parentId = rootId
      pathTitles.forEach((segment: string, segmentIndex: number) => {
        const archiveNodeId = `${rootId}__${pathTitles.slice(0, segmentIndex + 1).join('__')}`
        if (!seen.has(archiveNodeId)) {
          projectionNodes.push({
            id: archiveNodeId,
            parentId,
            order: projectionNodes.filter((node) => node.parentId === parentId).length,
            title: segment,
            note: segmentIndex === pathTitles.length - 1 && hint.kind !== 'heading' ? hint.text : null,
            semanticType: null,
            semanticRole: segmentIndex === pathTitles.length - 1 ? 'claim' : 'section',
            confidence: hint.kind === 'heading' ? 'high' : 'medium',
            sourceAnchors: [{ lineStart: hint.lineStart, lineEnd: hint.lineEnd }],
            templateSlot: null,
            structureRole: null,
            locked: false,
            sourceModuleId: null,
            proposedReorder: null,
            proposedReparent: null,
            taskDependsOn: [],
            inferredOutput: null,
            mirroredTaskId: null,
          })
          seen.add(archiveNodeId)
        }
        parentId = archiveNodeId
      })
    })
  })

  return buildProjectionFromNodes({
    viewId: options.viewId,
    viewType: 'archive_view',
    summary: `Projected ${options.sources.length} source branches into the archive view.`,
    nodes: projectionNodes,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
}

export function buildImportBundlePreview(
  options: ImportLayerBundleOptions,
): ImportLayerPreviewResult {
  const sources = options.sources.map((source, index) =>
    createSourceLayer(source, `source_${index + 1}`),
  )
  const extracted = createPlannerFallbackGraph({
    bundleTitle: options.bundleTitle,
    sources,
    sourceInputs: options.sources,
    requestIntent: options.requestIntent,
    requestedArchetype: options.requestedArchetype,
    requestedArchetypeMode: options.requestedArchetypeMode,
    requestedContentProfile: options.requestedContentProfile,
    requestedNodeBudget: options.requestedNodeBudget,
    precomputedPlan: options.precomputedPlan,
  })
  const canonical = canonicalizeSemanticGraph(extracted)

  const thinkingViewId = `${options.bundleId}_thinking`
  const thinkingProjection = createThinkingProjection({
    viewId: thinkingViewId,
    bundleTitle: options.bundleTitle,
    sourceTitles: sources.map((source) => source.title),
    semanticNodes: canonical.semanticNodes,
    semanticEdges: canonical.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    documentType: normalizeDocumentStructureType(extracted.classification.archetype),
  })
  const executionViewId = `${options.bundleId}_execution`
  const executionProjection = createExecutionProjection({
    viewId: executionViewId,
    semanticNodes: canonical.semanticNodes,
    semanticEdges: canonical.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
  const archiveViewId = `${options.bundleId}_archive`
  const archiveProjection = createArchiveProjection({
    viewId: archiveViewId,
    bundleTitle: options.bundleTitle,
    sources,
    sourceInputs: options.sources,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })

  const views: KnowledgeView[] = [
    {
      id: thinkingViewId,
      type: PRIMARY_KNOWLEDGE_VIEW_TYPE,
      visible_node_ids: thinkingProjection.previewNodes.map((node) => node.id),
      layout_type: 'mindmap',
    },
    {
      id: executionViewId,
      type: 'execution_view',
      visible_node_ids: executionProjection.previewNodes.map((node) => node.id),
      layout_type: 'execution',
    },
    {
      id: archiveViewId,
      type: 'archive_view',
      visible_node_ids: archiveProjection.previewNodes.map((node) => node.id),
      layout_type: 'archive',
    },
  ]
  const viewProjections: Record<string, KnowledgeViewProjection> = {
    [thinkingViewId]: thinkingProjection,
    [executionViewId]: executionProjection,
    [archiveViewId]: archiveProjection,
  }
  const defaultViewId = thinkingViewId
  const activeViewId = thinkingViewId

  return {
    bundle: {
      id: options.bundleId,
      title: options.bundleTitle,
      createdAt: options.createdAt,
      anchorTopicId: options.anchorTopicId,
      defaultViewId,
      activeViewId,
      mountedRootTopicId: null,
      sources,
      semanticNodes: canonical.semanticNodes,
      semanticEdges: canonical.semanticEdges,
      views,
      viewProjections,
    },
    classification: extracted.classification,
    templateSummary: extracted.templateSummary,
    nodePlans: thinkingProjection.nodePlans,
    previewNodes: thinkingProjection.previewNodes,
    operations: thinkingProjection.operations,
    sources,
    semanticNodes: canonical.semanticNodes,
    semanticEdges: canonical.semanticEdges,
    views,
    viewProjections,
    defaultViewId,
    activeViewId,
  }
}

export function compileSemanticLayerViews(
  options: CompileSemanticLayerViewsOptions,
): {
  views: KnowledgeView[]
  viewProjections: Record<string, KnowledgeViewProjection>
  defaultViewId: string
  activeViewId: string
} {
  const thinkingViewId = `${options.bundleId}_thinking`
  const thinkingProjection = createThinkingProjection({
    viewId: thinkingViewId,
    bundleTitle: options.bundleTitle,
    sourceTitles: options.sources.map((source) => source.title),
    semanticNodes: options.semanticNodes,
    semanticEdges: options.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    documentType: normalizeDocumentStructureType(options.documentType),
  })
  const executionViewId = `${options.bundleId}_execution`
  const executionProjection = createExecutionProjection({
    viewId: executionViewId,
    semanticNodes: options.semanticNodes,
    semanticEdges: options.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
  const archiveViewId = `${options.bundleId}_archive`
  const archiveProjection = createArchiveProjection({
    viewId: archiveViewId,
    bundleTitle: options.bundleTitle,
    sources: options.sources,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })

  return {
    views: [
      {
        id: thinkingViewId,
        type: PRIMARY_KNOWLEDGE_VIEW_TYPE,
        visible_node_ids: thinkingProjection.previewNodes.map((node) => node.id),
        layout_type: 'mindmap',
      },
      {
        id: executionViewId,
        type: 'execution_view',
        visible_node_ids: executionProjection.previewNodes.map((node) => node.id),
        layout_type: 'execution',
      },
      {
        id: archiveViewId,
        type: 'archive_view',
        visible_node_ids: archiveProjection.previewNodes.map((node) => node.id),
        layout_type: 'archive',
      },
    ],
    viewProjections: {
      [thinkingViewId]: thinkingProjection,
      [executionViewId]: executionProjection,
      [archiveViewId]: archiveProjection,
    },
    defaultViewId: thinkingViewId,
    activeViewId: thinkingViewId,
  }
}
