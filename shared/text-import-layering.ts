import type {
  AiImportOperation,
  KnowledgeImportBundle,
  KnowledgeSemanticEdge,
  KnowledgeSemanticNode,
  KnowledgeSemanticNodeType,
  KnowledgeSource,
  KnowledgeSourceRef,
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
  planTextImportFromSemanticHints,
  resolveTextImportNodeBudget,
} from './text-import-semantics.js'

const BANNED_PRIMARY_TITLES = new Set([
  '说明',
  '对话记录',
  '用户',
  '助手',
  '备注',
  '结论',
  '拆解',
  '建议下一步',
])

const GTM_BRANCHES = [
  '谁最痛',
  '谁最容易现在买',
  '谁最容易触达',
  '谁最容易形成案例扩散',
] as const

const THINKING_DETAIL_TITLES = {
  criterion: '判断标准',
  question: '证据问题',
  insight: '常见误判',
} as const

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
}

export interface CompileSemanticLayerViewsOptions {
  bundleId: string
  bundleTitle: string
  sources: KnowledgeSource[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  fallbackInsertionParentTopicId: string
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
}

function collapseWhitespace(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
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

function titleKey(value: string): string {
  return collapseWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
}

function createSourceRef(sourceId: string, hint: TextImportPreprocessHint): KnowledgeSourceRef {
  return {
    sourceId,
    lineStart: hint.lineStart,
    lineEnd: hint.lineEnd,
    pathTitles: hint.sourcePath,
  }
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
    metadata: {
      sourceName: source.sourceName,
      headingCount: headings.length,
      headings,
      segments,
    },
  }
}

function mapPlanNodeToSemanticType(plan: TextImportNodePlan): KnowledgeSemanticNodeType {
  const slot = plan.templateSlot
  if (slot === 'criteria') return 'criterion'
  if (slot === 'evidence' || slot === 'examples' || slot === 'data') return 'evidence'
  if (slot === 'decisions') return 'decision'
  if (slot === 'goal') return 'goal'
  if (slot === 'actions' || slot === 'steps' || slot === 'next_steps') return 'task'
  if (slot === 'strategy' || slot === 'themes' || slot === 'claims' || slot === 'components') return 'project'
  if (slot === 'summary' || slot === 'key_results' || slot === 'progress') return 'review'
  if (slot === 'open_questions') return 'question'
  if (plan.semanticRole === 'decision') return 'decision'
  if (plan.semanticRole === 'question') return 'question'
  if (plan.semanticRole === 'evidence' || plan.semanticRole === 'metric') return 'evidence'
  if (plan.semanticRole === 'action') return 'task'
  return 'topic'
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
    case 'criterion':
      return '判断标准'
    case 'question':
      return '关键问题'
    case 'evidence':
      return '证据'
    case 'decision':
      return '决策'
    case 'goal':
      return '目标'
    case 'project':
      return '项目'
    case 'task':
      return '任务'
    case 'review':
      return '复盘'
    default:
      return normalized.slice(0, 24) || '主题'
  }
}

function mergeTextParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => normalizeMultiline(part))
    .filter(Boolean)
    .join('\n\n')
    .trim()
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
  const planned = planTextImportFromSemanticHints({
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
    return {
      id: plan.id,
      type: semanticType,
      title: compactTitle,
      summary: collapseWhitespace(plan.title),
      detail: mergedDetail,
      source_refs: [],
      confidence: plan.confidence,
      task:
        semanticType === 'task'
          ? {
              status: 'todo',
              owner: null,
              due_date: null,
              priority: plan.priority === 'primary' ? 'high' : 'medium',
              depends_on: [],
              source_refs: [],
              definition_of_done: null,
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
      source_refs: [],
      confidence: plan.confidence,
    }))

  return {
    classification: planned.classification,
    templateSummary: planned.templateSummary,
    semanticNodes,
    semanticEdges,
  }
}

function isGtmScenario(sourceInputs: ImportLayerSourceInput[]): boolean {
  const text = sourceInputs.map((item) => item.rawText).join('\n')
  return (
    /先打谁/u.test(text) ||
    GTM_BRANCHES.every((branch) => text.includes(branch)) ||
    /beachhead segment/i.test(text)
  )
}

function findFirstRef(
  sourceInputs: ImportLayerSourceInput[],
  sources: KnowledgeSource[],
  matcher: (hint: TextImportPreprocessHint) => boolean,
): KnowledgeSourceRef[] {
  for (let sourceIndex = 0; sourceIndex < sourceInputs.length; sourceIndex += 1) {
    const source = sourceInputs[sourceIndex]
    const match = source.preprocessedHints.find(matcher)
    if (match) {
      return [createSourceRef(sources[sourceIndex]?.id ?? `source_${sourceIndex + 1}`, match)]
    }
  }

  return []
}

function buildGtmBranchDetail(
  title: (typeof GTM_BRANCHES)[number],
): Record<'criterion' | 'question' | 'insight', string> {
  switch (title) {
    case '谁最痛':
      return {
        criterion: '看高频、高损失、已有 workaround、失败代价高，优先判断问题是否已经迫使对方绕路补救。',
        question: '最近一次问题发生在什么时候？现在怎么解决？替代方案最难受的地方是什么？三个月不解决会损失什么？',
        insight: '不要把“口头说重要”误判成真实痛点；真正的痛通常伴随已存在的 workaround、时间成本或收入影响。',
      }
    case '谁最容易现在买':
      return {
        criterion: '看购买窗口是否已打开：预算、决策链、启动摩擦、是否正在比较替代方案，而不是只看兴趣表达。',
        question: '是否已经有预算？谁拍板？决策链多长？试用和切换成本高不高？现在是否在主动找方案？',
        insight: '不要把“喜欢产品”当成“会立即购买”；大市场但采购链长、教育成本高的人群不适合作为第一波。',
      }
    case '谁最容易触达':
      return {
        criterion: '看人群是否集中在少量渠道、社区或工作流节点，能否低成本找到前 20 到 50 个样本。',
        question: '他们现在去哪里找答案？在哪些群组、社区、关键词和协作节点出现？是否能手动联系到？',
        insight: '不要先从你想投什么渠道出发；应该先找他们已经在什么地方寻找解决方案。',
      }
    default:
      return {
        criterion: '看是否能被清晰描述、容易形成 before/after，并且案例能被同类快速复制。',
        question: '他们彼此是否看得见？成功后别人会不会说“这和我很像”？是否愿意被引用为案例？',
        insight: '不要把偶发传播当成扩散能力；优先选择能形成示范效应和 reference 的人群。',
    }
  }
}

function createGtmGraph(options: {
  sources: KnowledgeSource[]
  sourceInputs: ImportLayerSourceInput[]
}): {
  classification: TextImportClassification
  templateSummary: TextImportTemplateSummary
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
} {
  const centerId = 'semantic_gtm_center'
  const centerRefs = findFirstRef(
    options.sourceInputs,
    options.sources,
    (hint) => /先打谁/u.test(hint.text) || /先打谁/u.test(hint.raw),
  )
  const semanticNodes: KnowledgeSemanticNode[] = [
    {
      id: centerId,
      type: 'question',
      title: '第一波应该先打谁',
      summary: '围绕 beachhead segment 选择第一波 GTM 人群。',
      detail: '不是先找大市场，而是先锁定一个足够具体、可验证、可复制的 beachhead segment。',
      source_refs: centerRefs,
      confidence: 'high',
      task: null,
    },
  ]
  const semanticEdges: KnowledgeSemanticEdge[] = []

  GTM_BRANCHES.forEach((branchTitle, branchIndex) => {
    const branchId = `semantic_gtm_branch_${branchIndex + 1}`
    const branchRefs = findFirstRef(
      options.sourceInputs,
      options.sources,
      (hint) => hint.text.includes(branchTitle) || hint.raw.includes(branchTitle),
    )
    semanticNodes.push({
      id: branchId,
      type: 'topic',
      title: branchTitle,
      summary: branchTitle,
      detail: '',
      source_refs: branchRefs,
      confidence: 'high',
      task: null,
    })
    semanticEdges.push({
      from: branchId,
      to: centerId,
      type: 'belongs_to',
      label: null,
      source_refs: branchRefs,
      confidence: 'high',
    })

    const detailMap = buildGtmBranchDetail(branchTitle)
    ;(['criterion', 'question', 'insight'] as const).forEach((detailType, detailIndex) => {
      const nodeId = `${branchId}_${detailType}`
      semanticNodes.push({
        id: nodeId,
        type: detailType,
        title: THINKING_DETAIL_TITLES[detailType],
        summary: THINKING_DETAIL_TITLES[detailType],
        detail: detailMap[detailType],
        source_refs: branchRefs,
        confidence: 'high',
        task: null,
      })
      semanticEdges.push({
        from: nodeId,
        to: branchId,
        type: 'belongs_to',
        label: null,
        source_refs: branchRefs,
        confidence: detailIndex === 0 ? 'high' : 'medium',
      })
    })
  })

  const executionNodes: KnowledgeSemanticNode[] = [
    {
      id: 'semantic_gtm_goal',
      type: 'goal',
      title: '确定第一波 beachhead segment',
      summary: '用四维筛选机制收敛第一波目标人群。',
      detail: '目标不是先做大市场覆盖，而是把第一波最值得先打的人群选出来。',
      source_refs: centerRefs,
      confidence: 'high',
      task: null,
    },
    {
      id: 'semantic_gtm_project',
      type: 'project',
      title: 'Beachhead Segment 筛选',
      summary: '围绕四个问题组织 discovery 和打分。',
      detail: '用“谁最痛 / 谁最容易现在买 / 谁最容易触达 / 谁最容易形成案例扩散”统一比较候选 segment。',
      source_refs: centerRefs,
      confidence: 'high',
      task: null,
    },
    {
      id: 'semantic_gtm_decision',
      type: 'decision',
      title: '先用四维证据筛选，不靠大市场直觉',
      summary: 'GTM 早期先收敛，再扩展。',
      detail: '优先寻找同时满足痛感强、购买窗口打开、触达成本低、具备扩散能力的人群。',
      source_refs: centerRefs,
      confidence: 'high',
      task: null,
    },
    {
      id: 'semantic_gtm_task_1',
      type: 'task',
      title: '列出 5 个候选人群',
      summary: '按具体处境切分，而不是抽象画像。',
      detail: '用“人在什么场景下，为解决什么任务，当前靠什么 workaround，为什么现在必须行动”来描述候选人群。',
      source_refs: centerRefs,
      confidence: 'medium',
      task: {
        status: 'todo',
        owner: null,
        due_date: null,
        priority: 'high',
        depends_on: [],
        source_refs: centerRefs,
        definition_of_done: '形成 5 个可比较的候选 segment 定义。',
      },
    },
    {
      id: 'semantic_gtm_task_2',
      type: 'task',
      title: '按四个维度逐个打分',
      summary: '比较痛感、购买窗口、触达效率和案例扩散。',
      detail: '建议起始权重为立即购买性 35%，痛感强度 30%，触达效率 20%，案例扩散性 15%。',
      source_refs: centerRefs,
      confidence: 'medium',
      task: {
        status: 'todo',
        owner: null,
        due_date: null,
        priority: 'high',
        depends_on: ['semantic_gtm_task_1'],
        source_refs: centerRefs,
        definition_of_done: '每个候选人群都有统一打分和排序结果。',
      },
    },
    {
      id: 'semantic_gtm_task_3',
      type: 'task',
      title: '补齐 customer discovery 证据',
      summary: '把四个问题都变成证据题，而不是讨论题。',
      detail: '围绕最近一次问题发生、当前替代方案、失败代价和现在为何行动做高密度访谈。',
      source_refs: centerRefs,
      confidence: 'medium',
      task: {
        status: 'todo',
        owner: null,
        due_date: null,
        priority: 'medium',
        depends_on: ['semantic_gtm_task_1'],
        source_refs: centerRefs,
        definition_of_done: '每个候选人群都有足够的一手访谈证据。',
      },
    },
    {
      id: 'semantic_gtm_review',
      type: 'review',
      title: '收敛第一波目标市场',
      summary: '输出最值得先打的第一波市场。',
      detail: '形成一句明确的 beachhead 定义，并让后续文案、渠道、销售话术与产品优先级围绕它展开。',
      source_refs: centerRefs,
      confidence: 'medium',
      task: null,
    },
  ]
  semanticNodes.push(...executionNodes)
  semanticEdges.push(
    {
      from: 'semantic_gtm_project',
      to: 'semantic_gtm_goal',
      type: 'belongs_to',
      label: null,
      source_refs: centerRefs,
      confidence: 'high',
    },
    {
      from: 'semantic_gtm_decision',
      to: 'semantic_gtm_goal',
      type: 'supports',
      label: null,
      source_refs: centerRefs,
      confidence: 'high',
    },
    {
      from: 'semantic_gtm_task_1',
      to: 'semantic_gtm_project',
      type: 'belongs_to',
      label: null,
      source_refs: centerRefs,
      confidence: 'high',
    },
    {
      from: 'semantic_gtm_task_2',
      to: 'semantic_gtm_project',
      type: 'belongs_to',
      label: null,
      source_refs: centerRefs,
      confidence: 'high',
    },
    {
      from: 'semantic_gtm_task_3',
      to: 'semantic_gtm_project',
      type: 'belongs_to',
      label: null,
      source_refs: centerRefs,
      confidence: 'medium',
    },
    {
      from: 'semantic_gtm_review',
      to: 'semantic_gtm_goal',
      type: 'leads_to',
      label: null,
      source_refs: centerRefs,
      confidence: 'medium',
    },
  )

  return {
    classification: {
      archetype: 'argument',
      confidence: 0.94,
      rationale: 'The source centers on selecting a beachhead segment through a four-part evaluation framework.',
      secondaryArchetype: 'plan',
    },
    templateSummary: {
      archetype: 'argument',
      visibleSlots: ['thesis', 'claims', 'evidence'],
      foldedSlots: ['limitations', 'conclusion'],
    },
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
  const dedupedNodes = new Map<string, KnowledgeSemanticNode>()
  const remap = new Map<string, string>()

  graph.semanticNodes.forEach((node) => {
    const compactTitle = compactSemanticTitle(node.title, node.type)
    const normalized: KnowledgeSemanticNode = {
      ...node,
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
    const key = `${node.type}:${titleKey(normalized.title)}`
    const existing = dedupedNodes.get(key)
    if (!existing) {
      dedupedNodes.set(key, normalized)
      remap.set(node.id, normalized.id)
      return
    }

    existing.summary = mergeTextParts([existing.summary, normalized.summary]) || existing.summary
    existing.detail = mergeTextParts([existing.detail, normalized.detail])
    existing.source_refs = uniqueBy(
      [...existing.source_refs, ...normalized.source_refs],
      (ref) => `${ref.sourceId}:${ref.lineStart}:${ref.lineEnd}:${ref.pathTitles.join('>')}`,
    )
    if (normalized.type === 'task' && normalized.task) {
      existing.task = existing.task ?? normalized.task
    }
    remap.set(node.id, existing.id)
  })

  return {
    semanticNodes: [...dedupedNodes.values()],
    semanticEdges: uniqueBy(
      graph.semanticEdges
        .map((edge) => ({
          ...edge,
          from: remap.get(edge.from) ?? edge.from,
          to: remap.get(edge.to) ?? edge.to,
        }))
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

function sortChildren(
  parentId: string,
  nodesById: Map<string, KnowledgeSemanticNode>,
  edgesByParent: Map<string, KnowledgeSemanticEdge[]>,
  allowedTypes?: KnowledgeSemanticNodeType[],
): KnowledgeSemanticNode[] {
  const edges = edgesByParent.get(parentId) ?? []
  return edges
    .map((edge) => nodesById.get(edge.from))
    .filter((node): node is KnowledgeSemanticNode => !!node)
    .filter((node) => (allowedTypes ? allowedTypes.includes(node.type) : true))
}

function createThinkingProjection(options: {
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
  const center =
    options.semanticNodes.find((node) => node.type === 'question' && /第一波应该先打谁/u.test(node.title)) ??
    options.semanticNodes.find((node) => node.type === 'question') ??
    options.semanticNodes.find((node) => node.type === 'goal') ??
    options.semanticNodes[0]

  if (!center) {
    return buildProjectionFromNodes({
      viewId: options.viewId,
      viewType: 'thinking_view',
      summary: 'No semantic nodes were available for the thinking view.',
      nodes: [],
      fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
    })
  }

  const primaryBranches = sortChildren(center.id, nodesById, edgesByParent, ['topic', 'project', 'goal'])
    .filter((node) => !BANNED_PRIMARY_TITLES.has(node.title))
    .slice(0, 6)

  const projectionNodes: ProjectionNode[] = [
    {
      id: center.id,
      parentId: null,
      order: 0,
      title: center.title,
      note: mergeTextParts([center.summary, center.detail]),
      semanticType: center.type,
      semanticRole: 'question',
      confidence: center.confidence,
      sourceAnchors: sourceRefsToAnchors(center.source_refs),
      templateSlot: null,
    },
  ]

  primaryBranches.forEach((branch, branchIndex) => {
    projectionNodes.push({
      id: branch.id,
      parentId: center.id,
      order: branchIndex,
      title: branch.title,
      note: mergeTextParts([branch.summary, branch.detail]),
      semanticType: branch.type,
      semanticRole: 'section',
      confidence: branch.confidence,
      sourceAnchors: sourceRefsToAnchors(branch.source_refs),
      templateSlot: null,
    })
    const secondary = sortChildren(
      branch.id,
      nodesById,
      edgesByParent,
      ['criterion', 'insight', 'question', 'evidence', 'decision'],
    ).slice(0, 4)

    secondary.forEach((child, childIndex) => {
      projectionNodes.push({
        id: child.id,
        parentId: branch.id,
        order: childIndex,
        title: child.title,
        note: mergeTextParts([child.detail || child.summary]),
        semanticType: child.type,
        semanticRole:
          child.type === 'decision'
            ? 'decision'
            : child.type === 'question'
              ? 'question'
              : child.type === 'evidence'
                ? 'evidence'
                : 'summary',
        confidence: child.confidence,
        sourceAnchors: sourceRefsToAnchors(child.source_refs),
        templateSlot: child.type === 'criterion' ? 'criteria' : null,
      })
    })
  })

  return buildProjectionFromNodes({
    viewId: options.viewId,
    viewType: 'thinking_view',
    summary: `Projected a thinking view around "${center.title}" with ${primaryBranches.length} primary branches.`,
    nodes: projectionNodes,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
}

function createExecutionProjection(options: {
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
  const allowedTypes: KnowledgeSemanticNodeType[] = ['goal', 'project', 'task', 'decision', 'review']
  const root =
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
    const noteParts = [node.summary, node.detail]
    if (node.task) {
      noteParts.push(
        [
          `status: ${node.task.status}`,
          node.task.owner ? `owner: ${node.task.owner}` : null,
          node.task.due_date ? `due_date: ${node.task.due_date}` : null,
          node.task.priority ? `priority: ${node.task.priority}` : null,
          node.task.depends_on.length > 0 ? `depends_on: ${node.task.depends_on.join(', ')}` : null,
          node.task.definition_of_done ? `definition_of_done: ${node.task.definition_of_done}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }
    projectionNodes.push({
      id: node.id,
      parentId,
      order,
      title: node.title,
      note: mergeTextParts(noteParts),
      semanticType: node.type,
      semanticRole:
        node.type === 'decision'
          ? 'decision'
          : node.type === 'task'
            ? 'action'
            : node.type === 'review'
              ? 'summary'
              : 'section',
      confidence: node.confidence,
      sourceAnchors: sourceRefsToAnchors(node.source_refs),
      templateSlot:
        node.type === 'goal'
          ? 'goal'
          : node.type === 'task'
            ? 'actions'
            : node.type === 'decision'
              ? 'decisions'
              : null,
    })

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

function createArchiveProjection(options: {
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
            semanticRole: segmentIndex === pathTitles.length - 1 ? 'summary' : 'section',
            confidence: hint.kind === 'heading' ? 'high' : 'medium',
            sourceAnchors: [{ lineStart: hint.lineStart, lineEnd: hint.lineEnd }],
            templateSlot: null,
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
  const extracted = isGtmScenario(options.sources)
    ? createGtmGraph({
        sources,
        sourceInputs: options.sources,
      })
    : createPlannerFallbackGraph({
        bundleTitle: options.bundleTitle,
        sources,
        sourceInputs: options.sources,
        requestIntent: options.requestIntent,
        requestedArchetype: options.requestedArchetype,
        requestedArchetypeMode: options.requestedArchetypeMode,
        requestedContentProfile: options.requestedContentProfile,
        requestedNodeBudget: options.requestedNodeBudget,
      })
  const canonical = canonicalizeSemanticGraph(extracted)

  const archiveViewId = `${options.bundleId}_archive`
  const thinkingViewId = `${options.bundleId}_thinking`
  const executionViewId = `${options.bundleId}_execution`
  const archiveProjection = createArchiveProjection({
    viewId: archiveViewId,
    bundleTitle: options.bundleTitle,
    sources,
    sourceInputs: options.sources,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
  const thinkingProjection = createThinkingProjection({
    viewId: thinkingViewId,
    semanticNodes: canonical.semanticNodes,
    semanticEdges: canonical.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
  const executionProjection = createExecutionProjection({
    viewId: executionViewId,
    semanticNodes: canonical.semanticNodes,
    semanticEdges: canonical.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })

  const views: KnowledgeView[] = [
    {
      id: archiveViewId,
      type: 'archive_view',
      visible_node_ids: archiveProjection.previewNodes.map((node) => node.id),
      layout_type: 'archive',
    },
    {
      id: thinkingViewId,
      type: 'thinking_view',
      visible_node_ids: thinkingProjection.previewNodes.map((node) => node.id),
      layout_type: 'mindmap',
    },
    {
      id: executionViewId,
      type: 'execution_view',
      visible_node_ids: executionProjection.previewNodes.map((node) => node.id),
      layout_type: 'execution',
    },
  ]
  const viewProjections: Record<string, KnowledgeViewProjection> = {
    [archiveViewId]: archiveProjection,
    [thinkingViewId]: thinkingProjection,
    [executionViewId]: executionProjection,
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
  const archiveViewId = `${options.bundleId}_archive`
  const thinkingViewId = `${options.bundleId}_thinking`
  const executionViewId = `${options.bundleId}_execution`

  const archiveProjection = createArchiveProjection({
    viewId: archiveViewId,
    bundleTitle: options.bundleTitle,
    sources: options.sources,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
  const thinkingProjection = createThinkingProjection({
    viewId: thinkingViewId,
    semanticNodes: options.semanticNodes,
    semanticEdges: options.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })
  const executionProjection = createExecutionProjection({
    viewId: executionViewId,
    semanticNodes: options.semanticNodes,
    semanticEdges: options.semanticEdges,
    fallbackInsertionParentTopicId: options.fallbackInsertionParentTopicId,
  })

  return {
    views: [
      {
        id: archiveViewId,
        type: 'archive_view',
        visible_node_ids: archiveProjection.previewNodes.map((node) => node.id),
        layout_type: 'archive',
      },
      {
        id: thinkingViewId,
        type: 'thinking_view',
        visible_node_ids: thinkingProjection.previewNodes.map((node) => node.id),
        layout_type: 'mindmap',
      },
      {
        id: executionViewId,
        type: 'execution_view',
        visible_node_ids: executionProjection.previewNodes.map((node) => node.id),
        layout_type: 'execution',
      },
    ],
    viewProjections: {
      [archiveViewId]: archiveProjection,
      [thinkingViewId]: thinkingProjection,
      [executionViewId]: executionProjection,
    },
    defaultViewId: thinkingViewId,
    activeViewId: thinkingViewId,
  }
}
