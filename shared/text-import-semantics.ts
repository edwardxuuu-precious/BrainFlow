import type {
  AiCanvasOperation,
  AiCanvasTarget,
  AiImportOperation,
  TextImportArchetype,
  TextImportClassification,
  TextImportConfidence,
  TextImportContentProfile,
  TextImportHintKind,
  TextImportNodeBudget,
  TextImportNodePlan,
  TextImportNodePriority,
  TextImportPreset,
  TextImportPreprocessHint,
  TextImportPreviewItem,
  TextImportRecommendedRoute,
  TextImportRequest,
  TextImportSemanticHint,
  TextImportSemanticHintKind,
  TextImportSemanticRole,
  TextImportSemanticUnit,
  TextImportSemanticUnitType,
  TextImportSourceAnchor,
  TextImportTemplateSlot,
  TextImportTemplateSummary,
} from './ai-contract.js'

type SlotPlanEntry = {
  slot: TextImportTemplateSlot
  label: string
  semanticRole: TextImportSemanticRole
  priority: TextImportNodePriority
  alwaysExplicit?: boolean
  collapsedByDefault?: boolean
}

type PlannedUnitAssignment = {
  unit: TextImportSemanticUnit
  slot: TextImportTemplateSlot
  parentUnitId?: string | null
}

type ArchetypeScore = {
  archetype: TextImportArchetype
  score: number
  reasons: string[]
}

type PresetScore = {
  preset: TextImportPreset
  score: number
  reasons: string[]
}

export interface PlannedTextImportStructure {
  nodePlans: TextImportNodePlan[]
  classification: TextImportClassification
  templateSummary: TextImportTemplateSummary
  semanticUnits: TextImportSemanticUnit[]
  profile: TextImportContentProfile
}

export interface TextImportPresetSelection {
  preset: TextImportPreset
  confidence: TextImportConfidence
  rationale: string
  secondaryPreset: TextImportPreset | null
}

export interface TextImportSourcePlanningSummary {
  sourceName: string
  sourceType: TextImportRequest['sourceType']
  resolvedPreset: TextImportPreset
  resolvedArchetype: TextImportArchetype
  confidence: TextImportConfidence
  presetConfidence: TextImportConfidence
  archetypeConfidence: TextImportConfidence
  structureScore: number
  structureConfidence: number
  recommendedRoute: TextImportRecommendedRoute
  isShallowPass: boolean
  needsDeepPass: boolean
  rationale: string
  presetRationale: string
  archetypeRationale: string
  isManual: boolean
}

export interface TextImportArtifactReuseSummary {
  contentKey: string
  planKey: string
  reusedSemanticHints: boolean
  reusedSemanticUnits: boolean
  reusedPlannedStructure: boolean
}

export interface TextImportStructureAssessment {
  score: number
  confidence: number
  recommendedRoute: TextImportRecommendedRoute
  isShallowPass: boolean
  needsDeepPass: boolean
}

export interface PreparedTextImportArtifacts {
  contentKey: string
  planKey: string
  semanticHints: TextImportSemanticHint[]
  semanticUnits: TextImportSemanticUnit[]
  plannedStructure: PlannedTextImportStructure
  artifactReuse: TextImportArtifactReuseSummary
  structure: TextImportStructureAssessment
}

export interface ResolvedTextImportPlanningOptions {
  semanticHints: TextImportSemanticHint[]
  semanticUnits: TextImportSemanticUnit[]
  contentProfile: TextImportContentProfile
  nodeBudget: TextImportNodeBudget
  intent: TextImportRequest['intent']
  resolvedPreset: TextImportPreset
  resolvedArchetype: TextImportArchetype
  summary: TextImportSourcePlanningSummary
  preparedArtifacts: PreparedTextImportArtifacts
}

const GENERIC_TITLE_PATTERNS = [
  /^item\b/i,
  /^section\b/i,
  /^details?\b/i,
  /^notes?\b/i,
  /^untitled\b/i,
  /^content\b/i,
  /^point\b/i,
]

const TEXT_IMPORT_ARCHETYPE_LABELS: Record<TextImportArchetype, string> = {
  method: 'Method',
  argument: 'Argument',
  plan: 'Plan',
  report: 'Report',
  meeting: 'Meeting',
  postmortem: 'Postmortem',
  knowledge: 'Knowledge',
  mixed: 'Mixed',
}

const TEXT_IMPORT_PRESET_LABELS: Record<TextImportPreset, string> = {
  preserve: 'Preserve structure',
  distill: 'Smart distill',
  action_first: 'Action first',
}

const TEMPLATE_SLOT_LABELS: Record<TextImportTemplateSlot, string> = {
  goal: '目标',
  use_cases: '适用场景',
  prerequisites: '前置条件',
  steps: '步骤',
  principles: '关键原则',
  criteria: '检验标准',
  pitfalls: '常见错误',
  examples: '示例/证据',
  thesis: '核心观点',
  claims: '分论点',
  evidence: '证据',
  data: '数据',
  limitations: '反例/限制',
  conclusion: '结论',
  strategy: '策略',
  actions: '行动项',
  owners: '负责人',
  timeline: '时间线',
  risks: '风险',
  success_metrics: '成功指标',
  summary: '总结',
  key_results: '关键结果',
  progress: '进展',
  metrics: '指标',
  blockers: '风险/阻塞',
  next_steps: '下一步',
  agenda: '议题',
  decisions: '结论/决策',
  open_questions: '未决问题',
  timepoints: '时间点',
  background: '背景',
  issues: '问题',
  causes: '原因',
  impacts: '影响',
  fixes: '修复方案',
  preventions: '预防措施',
  definition: '定义',
  components: '组成',
  mechanism: '原理',
  categories: '分类',
  comparisons: '对比',
  cautions: '注意事项',
  themes: '主题分组',
}

const TEMPLATE_SLOT_ORDER: Record<TextImportArchetype, SlotPlanEntry[]> = {
  method: [
    { slot: 'goal', label: TEMPLATE_SLOT_LABELS.goal, semanticRole: 'summary', priority: 'primary' },
    { slot: 'use_cases', label: TEMPLATE_SLOT_LABELS.use_cases, semanticRole: 'section', priority: 'secondary' },
    {
      slot: 'prerequisites',
      label: TEMPLATE_SLOT_LABELS.prerequisites,
      semanticRole: 'section',
      priority: 'secondary',
    },
    { slot: 'steps', label: TEMPLATE_SLOT_LABELS.steps, semanticRole: 'action', priority: 'primary', alwaysExplicit: true },
    {
      slot: 'principles',
      label: TEMPLATE_SLOT_LABELS.principles,
      semanticRole: 'summary',
      priority: 'secondary',
    },
    { slot: 'criteria', label: TEMPLATE_SLOT_LABELS.criteria, semanticRole: 'metric', priority: 'secondary' },
    { slot: 'pitfalls', label: TEMPLATE_SLOT_LABELS.pitfalls, semanticRole: 'risk', priority: 'primary', alwaysExplicit: true },
    {
      slot: 'examples',
      label: TEMPLATE_SLOT_LABELS.examples,
      semanticRole: 'evidence',
      priority: 'supporting',
      collapsedByDefault: true,
    },
  ],
  argument: [
    { slot: 'thesis', label: TEMPLATE_SLOT_LABELS.thesis, semanticRole: 'summary', priority: 'primary' },
    { slot: 'claims', label: TEMPLATE_SLOT_LABELS.claims, semanticRole: 'summary', priority: 'primary', alwaysExplicit: true },
    {
      slot: 'evidence',
      label: TEMPLATE_SLOT_LABELS.evidence,
      semanticRole: 'evidence',
      priority: 'supporting',
      collapsedByDefault: true,
    },
    { slot: 'data', label: TEMPLATE_SLOT_LABELS.data, semanticRole: 'metric', priority: 'secondary' },
    { slot: 'limitations', label: TEMPLATE_SLOT_LABELS.limitations, semanticRole: 'risk', priority: 'secondary' },
    { slot: 'conclusion', label: TEMPLATE_SLOT_LABELS.conclusion, semanticRole: 'summary', priority: 'primary' },
  ],
  plan: [
    { slot: 'goal', label: TEMPLATE_SLOT_LABELS.goal, semanticRole: 'summary', priority: 'primary' },
    { slot: 'strategy', label: TEMPLATE_SLOT_LABELS.strategy, semanticRole: 'summary', priority: 'secondary' },
    { slot: 'actions', label: TEMPLATE_SLOT_LABELS.actions, semanticRole: 'action', priority: 'primary', alwaysExplicit: true },
    { slot: 'owners', label: TEMPLATE_SLOT_LABELS.owners, semanticRole: 'action', priority: 'secondary' },
    { slot: 'timeline', label: TEMPLATE_SLOT_LABELS.timeline, semanticRole: 'timeline', priority: 'secondary' },
    { slot: 'risks', label: TEMPLATE_SLOT_LABELS.risks, semanticRole: 'risk', priority: 'primary', alwaysExplicit: true },
    {
      slot: 'success_metrics',
      label: TEMPLATE_SLOT_LABELS.success_metrics,
      semanticRole: 'metric',
      priority: 'secondary',
    },
  ],
  report: [
    { slot: 'summary', label: TEMPLATE_SLOT_LABELS.summary, semanticRole: 'summary', priority: 'primary' },
    { slot: 'key_results', label: TEMPLATE_SLOT_LABELS.key_results, semanticRole: 'summary', priority: 'primary' },
    { slot: 'progress', label: TEMPLATE_SLOT_LABELS.progress, semanticRole: 'summary', priority: 'secondary' },
    { slot: 'metrics', label: TEMPLATE_SLOT_LABELS.metrics, semanticRole: 'metric', priority: 'secondary' },
    { slot: 'blockers', label: TEMPLATE_SLOT_LABELS.blockers, semanticRole: 'risk', priority: 'primary', alwaysExplicit: true },
    { slot: 'next_steps', label: TEMPLATE_SLOT_LABELS.next_steps, semanticRole: 'action', priority: 'primary', alwaysExplicit: true },
  ],
  meeting: [
    { slot: 'agenda', label: TEMPLATE_SLOT_LABELS.agenda, semanticRole: 'section', priority: 'secondary' },
    { slot: 'decisions', label: TEMPLATE_SLOT_LABELS.decisions, semanticRole: 'decision', priority: 'primary', alwaysExplicit: true },
    { slot: 'actions', label: TEMPLATE_SLOT_LABELS.actions, semanticRole: 'action', priority: 'primary', alwaysExplicit: true },
    { slot: 'owners', label: TEMPLATE_SLOT_LABELS.owners, semanticRole: 'action', priority: 'secondary' },
    {
      slot: 'open_questions',
      label: TEMPLATE_SLOT_LABELS.open_questions,
      semanticRole: 'question',
      priority: 'secondary',
    },
    { slot: 'risks', label: TEMPLATE_SLOT_LABELS.risks, semanticRole: 'risk', priority: 'primary', alwaysExplicit: true },
    { slot: 'timepoints', label: TEMPLATE_SLOT_LABELS.timepoints, semanticRole: 'timeline', priority: 'secondary' },
  ],
  postmortem: [
    { slot: 'background', label: TEMPLATE_SLOT_LABELS.background, semanticRole: 'summary', priority: 'secondary' },
    { slot: 'issues', label: TEMPLATE_SLOT_LABELS.issues, semanticRole: 'risk', priority: 'primary', alwaysExplicit: true },
    { slot: 'causes', label: TEMPLATE_SLOT_LABELS.causes, semanticRole: 'summary', priority: 'primary' },
    { slot: 'impacts', label: TEMPLATE_SLOT_LABELS.impacts, semanticRole: 'risk', priority: 'secondary' },
    {
      slot: 'evidence',
      label: TEMPLATE_SLOT_LABELS.evidence,
      semanticRole: 'evidence',
      priority: 'supporting',
      collapsedByDefault: true,
    },
    { slot: 'fixes', label: TEMPLATE_SLOT_LABELS.fixes, semanticRole: 'action', priority: 'primary', alwaysExplicit: true },
    {
      slot: 'preventions',
      label: TEMPLATE_SLOT_LABELS.preventions,
      semanticRole: 'action',
      priority: 'primary',
      alwaysExplicit: true,
    },
  ],
  knowledge: [
    { slot: 'definition', label: TEMPLATE_SLOT_LABELS.definition, semanticRole: 'summary', priority: 'primary' },
    { slot: 'components', label: TEMPLATE_SLOT_LABELS.components, semanticRole: 'section', priority: 'secondary' },
    { slot: 'mechanism', label: TEMPLATE_SLOT_LABELS.mechanism, semanticRole: 'summary', priority: 'secondary' },
    { slot: 'categories', label: TEMPLATE_SLOT_LABELS.categories, semanticRole: 'section', priority: 'secondary' },
    { slot: 'comparisons', label: TEMPLATE_SLOT_LABELS.comparisons, semanticRole: 'summary', priority: 'secondary' },
    { slot: 'examples', label: TEMPLATE_SLOT_LABELS.examples, semanticRole: 'evidence', priority: 'supporting', collapsedByDefault: true },
    { slot: 'cautions', label: TEMPLATE_SLOT_LABELS.cautions, semanticRole: 'risk', priority: 'secondary' },
  ],
  mixed: [
    { slot: 'summary', label: TEMPLATE_SLOT_LABELS.summary, semanticRole: 'summary', priority: 'primary' },
    { slot: 'themes', label: TEMPLATE_SLOT_LABELS.themes, semanticRole: 'section', priority: 'secondary' },
    { slot: 'evidence', label: TEMPLATE_SLOT_LABELS.evidence, semanticRole: 'evidence', priority: 'supporting', collapsedByDefault: true },
    { slot: 'open_questions', label: TEMPLATE_SLOT_LABELS.open_questions, semanticRole: 'question', priority: 'secondary' },
    { slot: 'actions', label: TEMPLATE_SLOT_LABELS.actions, semanticRole: 'action', priority: 'primary', alwaysExplicit: true },
  ],
}

const DEFAULT_NODE_BUDGETS: Record<TextImportContentProfile, TextImportNodeBudget> = {
  report: { maxRoots: 6, maxDepth: 4, maxTotalNodes: 32 },
  meeting_notes: { maxRoots: 6, maxDepth: 4, maxTotalNodes: 28 },
  procedure: { maxRoots: 6, maxDepth: 4, maxTotalNodes: 30 },
  mixed: { maxRoots: 7, maxDepth: 4, maxTotalNodes: 36 },
  brain_dump: { maxRoots: 5, maxDepth: 4, maxTotalNodes: 24 },
}

const semanticHintsCache = new Map<string, TextImportSemanticHint[]>()
const semanticUnitsCache = new Map<string, TextImportSemanticUnit[]>()
const plannedStructureCache = new Map<string, PlannedTextImportStructure>()

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

function collapseWhitespace(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : value
}

function createSemanticId(prefix: string, lineStart: number, lineEnd: number, index: number): string {
  return `${prefix}_${lineStart}_${lineEnd}_${index}`
}

function createPlanId(prefix: string, index: number): string {
  return `${prefix}_${index + 1}`
}

function confidenceRank(confidence: TextImportConfidence): number {
  switch (confidence) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function normalizeTitleKey(value: string): string {
  return collapseWhitespace(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
}

function createSourcePath(path: string[]): string[] {
  return path.length > 0 ? [...path] : ['Imported content']
}

function isQuestionText(value: string): boolean {
  return /[?]$/.test(value) || /(open question|question|pending confirmation|unresolved question)/iu.test(value)
}

function isDecisionText(value: string): boolean {
  return /(decision|decided|agreed|resolved|confirmed)/iu.test(value)
}

function isRiskText(value: string): boolean {
  return /(risk|blocker|issue|warning|problem|闂|椋庨櫓|闃诲|闅愭偅|鎸戞垬|娉ㄦ剰浜嬮」)/iu.test(value)
}

function isActionText(value: string): boolean {
  return /(todo|action|follow up|next step|owner|璐熻矗|鎺ㄨ繘|钀藉疄|寰呭姙|琛屽姩|璺熻繘)/iu.test(value)
}

function isMetricText(value: string): boolean {
  return /(%|kpi|okr|roi|gmv|ctr|cvr|metric|鎸囨爣|澧為暱|涓嬮檷|棰勭畻|\b\d+(?:\.\d+)?\b)/iu.test(value)
}

function isTimelineText(value: string): boolean {
  return /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}:\d{2}|today|tomorrow|deadline|timeline|launch|schedule)/iu.test(
    value,
  )
}

function createSemanticHint(
  kind: TextImportSemanticHintKind,
  confidence: TextImportConfidence,
  text: string,
  excerpt: string,
  lineStart: number,
  lineEnd: number,
  sourcePath: string[],
  index: number,
): TextImportSemanticHint {
  return {
    id: createSemanticId(kind, lineStart, lineEnd, index),
    kind,
    text: collapseWhitespace(text),
    excerpt: normalizeText(excerpt) || collapseWhitespace(text),
    confidence,
    lineStart,
    lineEnd,
    sourcePath: createSourcePath(sourcePath),
  }
}

export function inferTextImportSemanticHintKind(
  text: string,
  hintKind: TextImportHintKind,
): { kind: TextImportSemanticHintKind; confidence: TextImportConfidence } {
  const normalized = collapseWhitespace(text)
  if (!normalized) {
    return { kind: 'evidence', confidence: 'low' }
  }

  if (hintKind === 'task_list') {
    return { kind: 'action', confidence: 'high' }
  }
  if (isDecisionText(normalized)) {
    return { kind: 'decision', confidence: 'high' }
  }
  if (isRiskText(normalized)) {
    return { kind: 'risk', confidence: 'high' }
  }
  if (isQuestionText(normalized)) {
    return { kind: 'question', confidence: 'high' }
  }
  if (hintKind === 'table' || isMetricText(normalized)) {
    return { kind: 'metric', confidence: hintKind === 'table' ? 'high' : 'medium' }
  }
  if (isTimelineText(normalized)) {
    return { kind: 'timeline', confidence: 'medium' }
  }
  if (/(owner|assignee|responsible|@)/iu.test(normalized)) {
    return { kind: 'owner', confidence: 'medium' }
  }
  if (isActionText(normalized) || hintKind === 'ordered_list') {
    return { kind: 'action', confidence: hintKind === 'ordered_list' ? 'medium' : 'high' }
  }

  return { kind: 'evidence', confidence: hintKind === 'paragraph' ? 'medium' : 'low' }
}

export function deriveTextImportSemanticHints(
  preprocessedHints: TextImportPreprocessHint[],
): TextImportSemanticHint[] {
  const semanticHints: TextImportSemanticHint[] = []

  preprocessedHints.forEach((hint, hintIndex) => {
    const baseSourcePath = createSourcePath(hint.sourcePath)
    const pushHint = (
      text: string,
      lineStart: number,
      lineEnd: number,
      localIndex: number,
      excerpt?: string,
    ) => {
      const normalized = collapseWhitespace(text)
      if (!normalized) {
        return
      }
      const classified = inferTextImportSemanticHintKind(normalized, hint.kind)
      semanticHints.push(
        createSemanticHint(
          classified.kind,
          classified.confidence,
          normalized,
          excerpt ?? hint.raw,
          lineStart,
          lineEnd,
          baseSourcePath,
          hintIndex * 20 + localIndex,
        ),
      )
    }

    if (
      (hint.kind === 'bullet_list' || hint.kind === 'ordered_list' || hint.kind === 'task_list') &&
      Array.isArray(hint.items) &&
      hint.items.length > 0
    ) {
      hint.items.forEach((item, itemIndex) => {
        const estimatedLine = Math.min(hint.lineEnd, hint.lineStart + itemIndex)
        pushHint(item, estimatedLine, estimatedLine, itemIndex + 1, item)
      })
      return
    }

    if (hint.kind === 'heading') {
      const classified = inferTextImportSemanticHintKind(hint.text, hint.kind)
      if (classified.kind !== 'evidence') {
        semanticHints.push(
          createSemanticHint(
            classified.kind,
            classified.confidence,
            hint.text,
            hint.raw,
            hint.lineStart,
            hint.lineEnd,
            baseSourcePath,
            hintIndex,
          ),
        )
      }
      return
    }

    pushHint(hint.text, hint.lineStart, hint.lineEnd, 0, hint.raw)
  })

  const deduped = new Map<string, TextImportSemanticHint>()
  semanticHints.forEach((hint) => {
    const key = `${hint.kind}:${hint.lineStart}:${hint.lineEnd}:${normalizeTitleKey(hint.text)}`
    const existing = deduped.get(key)
    if (!existing || confidenceRank(hint.confidence) > confidenceRank(existing.confidence)) {
      deduped.set(key, hint)
    }
  })

  return [...deduped.values()].sort((left, right) => {
    if (left.lineStart !== right.lineStart) {
      return left.lineStart - right.lineStart
    }
    return left.id.localeCompare(right.id)
  })
}

function inferSemanticUnitType(options: {
  text: string
  excerpt: string
  hintKind?: TextImportHintKind | null
  semanticHintKind?: TextImportSemanticHintKind | null
}): TextImportSemanticUnitType {
  const normalized = collapseWhitespace([options.text, options.excerpt].filter(Boolean).join('\n'))

  if (!normalized) {
    return 'evidence'
  }
  if (/(鐩爣|鐩殑|objective|goal|aim)/iu.test(normalized)) {
    return 'goal'
  }
  if (/(閫傜敤|鍦烘櫙|use case|when to use|閫傚悎)/iu.test(normalized)) {
    return 'use_case'
  }
  if (/(鍓嶆彁|鍑嗗|渚濊禆|before you start|prerequisite|requirement)/iu.test(normalized)) {
    return 'prerequisite'
  }
  if (/(鍘熷垯|principle|guideline|rule of thumb)/iu.test(normalized)) {
    return 'principle'
  }
  if (/(鏍囧噯|楠屾敹|妫€楠寍criteria|checklist|quality bar|success criteria)/iu.test(normalized)) {
    return 'criterion'
  }
  if (/(瀹氫箟|鏄寚|means|refers to|defined as)/iu.test(normalized)) {
    return 'definition'
  }
  if (/(瀵规瘮|姣旇緝|vs\b|versus|鍖哄埆|tradeoff|difference)/iu.test(normalized)) {
    return 'comparison'
  }
  if (/(绀轰緥|渚嬪|case study|for example|example|妗堜緥)/iu.test(normalized)) {
    return 'example'
  }
  if (/(鍘熷洜|because|due to|root cause|瀵艰嚧|why)/iu.test(normalized)) {
    return 'cause'
  }
  if (/(褰卞搷|鍚庢灉|impact|blast radius|鎹熷け)/iu.test(normalized)) {
    return 'impact'
  }
  if (/(闄愬埗|灞€闄恷鍙嶄緥|tradeoff|limitation)/iu.test(normalized)) {
    return 'limitation'
  }
  if (/(owner|璐熻矗浜簗璐ｄ换浜簗@)/iu.test(normalized)) {
    return 'owner'
  }
  if (options.hintKind === 'ordered_list' || /(step|workflow|first|second|then|finally|next)/iu.test(normalized)) {
    return 'step'
  }
  if (options.semanticHintKind === 'decision' || isDecisionText(normalized)) {
    return 'decision'
  }
  if (options.semanticHintKind === 'risk' || isRiskText(normalized)) {
    return 'risk'
  }
  if (options.semanticHintKind === 'question' || isQuestionText(normalized)) {
    return 'question'
  }
  if (options.semanticHintKind === 'timeline' || isTimelineText(normalized)) {
    return 'timeline'
  }
  if (options.semanticHintKind === 'metric' || options.hintKind === 'table' || isMetricText(normalized)) {
    return 'metric'
  }
  if (options.semanticHintKind === 'action' || options.hintKind === 'task_list' || isActionText(normalized)) {
    return 'action'
  }
  if (/(should|must|we believe|claim|thesis|conclusion)/iu.test(normalized)) {
    return 'claim'
  }
  if (/(鎬荤粨|鎽樿|鎬昏|overall|summary|in short|姒傛嫭)/iu.test(normalized)) {
    return 'summary'
  }
  if (/(绛栫暐|strategy|approach|鏂规|璺緞|鎵撴硶)/iu.test(normalized)) {
    return 'strategy'
  }
  if (/(缁撴灉|杈炬垚|瀹屾垚|浜у嚭|outcome|result)/iu.test(normalized)) {
    return 'result'
  }
  if (/(杩涘睍|鎺ㄨ繘|杩涜涓瓅progress)/iu.test(normalized)) {
    return 'progress'
  }
  if (/(闂|鏁呴殰|寮傚父|incident|issue|bug)/iu.test(normalized)) {
    return 'issue'
  }
  if (options.hintKind === 'heading') {
    return 'summary'
  }
  return 'evidence'
}

export function deriveTextImportSemanticUnits(options: {
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints?: TextImportSemanticHint[]
}): TextImportSemanticUnit[] {
  const semanticHints = options.semanticHints ?? deriveTextImportSemanticHints(options.preprocessedHints)
  const units: TextImportSemanticUnit[] = []

  options.preprocessedHints.forEach((hint, hintIndex) => {
    const sourcePath = createSourcePath(hint.sourcePath)
    const createUnit = (
      text: string,
      excerpt: string,
      lineStart: number,
      lineEnd: number,
      localIndex: number,
      confidence?: TextImportConfidence,
    ) => {
      const normalized = collapseWhitespace(text)
      if (!normalized) {
        return
      }
      const matchedSemanticHint = semanticHints.find(
        (candidate) =>
          candidate.lineStart === lineStart &&
          candidate.lineEnd === lineEnd &&
          normalizeTitleKey(candidate.text) === normalizeTitleKey(normalized),
      )
      const unitType = inferSemanticUnitType({
        text: normalized,
        excerpt,
        hintKind: hint.kind,
        semanticHintKind: matchedSemanticHint?.kind ?? null,
      })
      units.push({
        id: createSemanticId(unitType, lineStart, lineEnd, hintIndex * 20 + localIndex),
        unitType,
        text: normalized,
        excerpt: normalizeText(excerpt) || normalized,
        confidence: confidence ?? matchedSemanticHint?.confidence ?? 'medium',
        lineStart,
        lineEnd,
        sourcePath,
        headingPath: sourcePath,
      })
    }

    if (
      (hint.kind === 'bullet_list' || hint.kind === 'ordered_list' || hint.kind === 'task_list') &&
      Array.isArray(hint.items) &&
      hint.items.length > 0
    ) {
      hint.items.forEach((item, itemIndex) => {
        const estimatedLine = Math.min(hint.lineEnd, hint.lineStart + itemIndex)
        createUnit(item, item, estimatedLine, estimatedLine, itemIndex + 1)
      })
      return
    }

    createUnit(hint.text, hint.raw, hint.lineStart, hint.lineEnd, 0)
  })

  semanticHints.forEach((hint, index) => {
    const key = `${hint.lineStart}:${hint.lineEnd}:${normalizeTitleKey(hint.text)}`
    const exists = units.some((unit) => `${unit.lineStart}:${unit.lineEnd}:${normalizeTitleKey(unit.text)}` === key)
    if (exists) {
      return
    }
    const unitType = inferSemanticUnitType({
      text: hint.text,
      excerpt: hint.excerpt,
      semanticHintKind: hint.kind,
      hintKind: null,
    })
    units.push({
      id: createSemanticId(unitType, hint.lineStart, hint.lineEnd, index + 1_000),
      unitType,
      text: collapseWhitespace(hint.text),
      excerpt: normalizeText(hint.excerpt) || collapseWhitespace(hint.text),
      confidence: hint.confidence,
      lineStart: hint.lineStart,
      lineEnd: hint.lineEnd,
      sourcePath: createSourcePath(hint.sourcePath),
      headingPath: createSourcePath(hint.sourcePath),
    })
  })

  const deduped = new Map<string, TextImportSemanticUnit>()
  units.forEach((unit) => {
    const key = `${unit.unitType}:${unit.lineStart}:${unit.lineEnd}:${normalizeTitleKey(unit.text)}`
    const existing = deduped.get(key)
    if (!existing || confidenceRank(unit.confidence) > confidenceRank(existing.confidence)) {
      deduped.set(key, unit)
    }
  })

  return [...deduped.values()].sort((left, right) => {
    if (left.lineStart !== right.lineStart) {
      return left.lineStart - right.lineStart
    }
    return left.id.localeCompare(right.id)
  })
}

function sumScores<T extends { score: number }>(scores: T[]): number {
  return scores.reduce((total, score) => total + Math.max(0, score.score), 0)
}

function countUnits(units: TextImportSemanticUnit[], ...types: TextImportSemanticUnitType[]): number {
  const wanted = new Set(types)
  return units.filter((unit) => wanted.has(unit.unitType)).length
}

function countHintsByKind(
  hints: TextImportPreprocessHint[],
  ...kinds: TextImportHintKind[]
): number {
  const wanted = new Set(kinds)
  return hints.filter((hint) => wanted.has(hint.kind)).length
}

function countSemanticHintsByKind(
  hints: TextImportSemanticHint[],
  ...kinds: TextImportSemanticHintKind[]
): number {
  const wanted = new Set(kinds)
  return hints.filter((hint) => wanted.has(hint.kind)).length
}

function lowerConfidence(
  left: TextImportConfidence,
  right: TextImportConfidence,
): TextImportConfidence {
  return confidenceRank(left) <= confidenceRank(right) ? left : right
}

function confidenceFromGap(top1Share: number, top2Share: number): TextImportConfidence {
  const gap = top1Share - top2Share
  if (gap >= 0.2) {
    return 'high'
  }
  if (gap >= 0.1) {
    return 'medium'
  }
  return 'low'
}

export function scoreTextImportArchetypes(options: {
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
  semanticUnits: TextImportSemanticUnit[]
}): ArchetypeScore[] {
  const sourceName = options.sourceName.toLowerCase()
  const orderedCount = options.preprocessedHints.filter((hint) => hint.kind === 'ordered_list').length
  const tableCount = options.preprocessedHints.filter((hint) => hint.kind === 'table').length
  const headingCount = options.preprocessedHints.filter((hint) => hint.kind === 'heading').length
  const units = options.semanticUnits

  const scores: ArchetypeScore[] = [
    { archetype: 'method', score: 0, reasons: [] },
    { archetype: 'argument', score: 0, reasons: [] },
    { archetype: 'plan', score: 0, reasons: [] },
    { archetype: 'report', score: 0, reasons: [] },
    { archetype: 'meeting', score: 0, reasons: [] },
    { archetype: 'postmortem', score: 0, reasons: [] },
    { archetype: 'knowledge', score: 0, reasons: [] },
    { archetype: 'mixed', score: 0.5, reasons: ['Fallback mixed template.'] },
  ]

  const add = (archetype: TextImportArchetype, value: number, reason: string) => {
    const target = scores.find((candidate) => candidate.archetype === archetype)
    if (!target || value <= 0) {
      return
    }
    target.score += value
    target.reasons.push(reason)
  }

  if (/(sop|runbook|playbook|workflow|process|procedure|method|娴佺▼|鏂规硶)/iu.test(sourceName)) {
    add('method', 3, 'Source name looks procedural.')
  }
  if (/(argument|opinion|瑙傜偣|璁鸿瘉|绔嬪満)/iu.test(sourceName)) {
    add('argument', 3, 'Source name looks argumentative.')
  }
  if (/(plan|roadmap|proposal|鏂规|瑙勫垝|璁″垝)/iu.test(sourceName)) {
    add('plan', 3, 'Source name looks plan-oriented.')
  }
  if (/(report|weekly|monthly|鍛ㄦ姤|鏈堟姤|姹囨姤)/iu.test(sourceName)) {
    add('report', 3, 'Source name looks like a report.')
  }
  if (/(meeting|minutes|绾|璁胯皥|sync|1on1|retro)/iu.test(sourceName)) {
    add('meeting', 3, 'Source name looks like meeting notes.')
  }
  if (/(postmortem|incident|retro|澶嶇洏|浜嬫晠|鏁呴殰|鏍瑰洜)/iu.test(sourceName)) {
    add('postmortem', 3, 'Source name looks like a postmortem.')
  }
  if (/(guide|knowledge|concept|definition|鏁欑▼|鐭ヨ瘑|鍘熺悊|姒傚康)/iu.test(sourceName)) {
    add('knowledge', 3, 'Source name looks explanatory.')
  }

  add('method', orderedCount * 1.2, 'Ordered steps increase method confidence.')
  add('method', countUnits(units, 'step', 'prerequisite', 'criterion', 'principle', 'use_case') * 0.9, 'Method units detected.')
  add('argument', countUnits(units, 'claim', 'evidence', 'metric', 'comparison', 'limitation') * 0.8, 'Argument signals detected.')
  add('plan', countUnits(units, 'goal', 'strategy', 'action', 'owner', 'timeline', 'risk', 'metric') * 0.85, 'Planning signals detected.')
  add('report', countUnits(units, 'summary', 'result', 'progress', 'metric', 'risk', 'action') * 0.8, 'Report signals detected.')
  add('meeting', countUnits(units, 'decision', 'action', 'question', 'owner', 'timeline', 'risk') * 0.95, 'Meeting signals detected.')
  add('postmortem', countUnits(units, 'issue', 'cause', 'impact', 'action', 'risk', 'evidence') * 0.9, 'Postmortem signals detected.')
  add('knowledge', countUnits(units, 'definition', 'comparison', 'example', 'principle', 'summary') * 0.85, 'Knowledge signals detected.')

  if (tableCount > 0) {
    add('report', tableCount * 0.8, 'Tables often indicate reporting metrics.')
    add('argument', tableCount * 0.5, 'Tables may support evidence and data.')
  }
  if (headingCount >= 3 && orderedCount === 0 && countUnits(units, 'definition', 'comparison', 'example') >= 2) {
    add('knowledge', 1.5, 'Structured explanatory sections detected.')
  }
  if (countUnits(units, 'decision', 'action') >= 4 && countUnits(units, 'question') >= 1) {
    add('meeting', 2, 'Decisions plus actions plus open questions match meeting notes.')
  }
  if (countUnits(units, 'result', 'progress', 'metric') >= 4) {
    add('report', 2, 'Results, progress, and metrics align with reports.')
  }
  if (countUnits(units, 'issue', 'cause', 'impact') >= 3) {
    add('postmortem', 2.2, 'Issue, cause, and impact align with postmortems.')
  }
  if (countUnits(units, 'claim') >= 2 && countUnits(units, 'evidence', 'metric') >= 2) {
    add('argument', 2, 'Claims are supported by evidence or data.')
  }
  if (countUnits(units, 'goal', 'strategy', 'action') >= 3 && countUnits(units, 'owner', 'timeline') >= 1) {
    add('plan', 2.2, 'Goal, strategy, action, and ownership align with plans.')
  }
  if (countUnits(units, 'step', 'criterion') >= 3) {
    add('method', 2.2, 'Steps plus criteria align with method text.')
  }

  const strongBuckets = scores.filter((score) => score.archetype !== 'mixed' && score.score >= 4).length
  if (strongBuckets >= 3) {
    add('mixed', strongBuckets * 0.9, 'Several archetypes compete strongly.')
  }
  if (sumScores(scores) <= 4) {
    add('mixed', 2.5, 'Signals are sparse, so mixed remains safest.')
  }

  return scores.sort((left, right) => right.score - left.score)
}

function confidenceLabelFromNumeric(value: number): TextImportConfidence {
  if (value >= 0.75) {
    return 'high'
  }
  if (value >= 0.45) {
    return 'medium'
  }
  return 'low'
}

export function mapTextImportArchetypeToContentProfile(
  archetype: TextImportArchetype,
): TextImportContentProfile {
  switch (archetype) {
    case 'method':
      return 'procedure'
    case 'report':
      return 'report'
    case 'meeting':
      return 'meeting_notes'
    case 'argument':
    case 'plan':
    case 'postmortem':
    case 'knowledge':
    case 'mixed':
    default:
      return 'mixed'
  }
}

export function resolveTextImportClassification(options: {
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
  semanticUnits: TextImportSemanticUnit[]
  explicitArchetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
}): TextImportClassification {
  if (options.archetypeMode === 'manual' && options.explicitArchetype) {
    return {
      archetype: options.explicitArchetype,
      confidence: 1,
      rationale: `Manually fixed to the ${TEXT_IMPORT_ARCHETYPE_LABELS[options.explicitArchetype]} template.`,
      secondaryArchetype: null,
    }
  }

  const scores = scoreTextImportArchetypes(options)
  const [top1, top2] = scores
  if (!top1) {
    return {
      archetype: 'mixed',
      confidence: 0.3,
      rationale: 'No reliable archetype signal was detected.',
      secondaryArchetype: null,
    }
  }

  const total = Math.max(1, sumScores(scores))
  const normalizedTop1 = Math.min(1, top1.score / total)
  const normalizedTop2 = Math.min(1, (top2?.score ?? 0) / total)
  const rationaleParts = top1.reasons.slice(0, 3)
  const confidenceAdjustment =
    normalizedTop1 - normalizedTop2 < 0.15 ? ' The next-best archetype is close, so this classification should stay editable.' : ''

  return {
    archetype: top1.archetype,
    confidence: Number(normalizedTop1.toFixed(3)),
    rationale:
      rationaleParts.length > 0
        ? `${rationaleParts.join(' ')}${confidenceAdjustment}`
        : `Detected ${TEXT_IMPORT_ARCHETYPE_LABELS[top1.archetype]}-like signals.`,
    secondaryArchetype: top2?.score ? top2.archetype : null,
  }
}

export function detectTextImportContentProfile(options: {
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
  explicitProfile?: TextImportContentProfile
  explicitArchetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
}): TextImportContentProfile {
  if (options.explicitProfile) {
    return options.explicitProfile
  }

  const semanticUnits = deriveTextImportSemanticUnits({
    preprocessedHints: options.preprocessedHints,
    semanticHints: options.semanticHints,
  })
  const classification = resolveTextImportClassification({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
    semanticHints: options.semanticHints,
    semanticUnits,
    explicitArchetype: options.explicitArchetype,
    archetypeMode: options.archetypeMode,
  })
  return mapTextImportArchetypeToContentProfile(classification.archetype)
}

export function resolveTextImportPresetSelection(options: {
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
  classification?: TextImportClassification | null
}): TextImportPresetSelection {
  const headingCount = countHintsByKind(options.preprocessedHints, 'heading')
  const listCount = countHintsByKind(
    options.preprocessedHints,
    'bullet_list',
    'ordered_list',
    'task_list',
  )
  const taskListCount = countHintsByKind(options.preprocessedHints, 'task_list')
  const tableCount = countHintsByKind(options.preprocessedHints, 'table')
  const codeBlockCount = countHintsByKind(options.preprocessedHints, 'code_block')
  const paragraphCount = countHintsByKind(options.preprocessedHints, 'paragraph')
  const structuredCount = headingCount + listCount + tableCount
  const totalHints = Math.max(1, options.preprocessedHints.length)
  const structuredRatio = structuredCount / totalHints
  const paragraphRatio = paragraphCount / totalHints

  const actionHintCount = countSemanticHintsByKind(options.semanticHints, 'action')
  const coordinationSignalCount = countSemanticHintsByKind(
    options.semanticHints,
    'decision',
    'risk',
    'owner',
    'timeline',
  )
  const actionSignalCount = coordinationSignalCount + taskListCount
  const evidenceSignalCount = countSemanticHintsByKind(options.semanticHints, 'evidence', 'metric')
  const actionDensity = actionSignalCount / Math.max(1, options.semanticHints.length)

  const scores: PresetScore[] = [
    {
      preset: 'preserve',
      score: 0.8,
      reasons: ['The source already has strong structure, so preserving hierarchy is likely safe.'],
    },
    {
      preset: 'distill',
      score: 1.2,
      reasons: ['Distill stays the safest default when the source is mixed or prose-heavy.'],
    },
    {
      preset: 'action_first',
      score: 0.8,
      reasons: ['Action-first works best when tasks, decisions, and blockers dominate the source.'],
    },
  ]

  const add = (preset: TextImportPreset, value: number, reason: string) => {
    const target = scores.find((candidate) => candidate.preset === preset)
    if (!target || value <= 0) {
      return
    }
    target.score += value
    target.reasons.push(reason)
  }

  add('preserve', headingCount * 0.55, 'Headings increase preserve confidence.')
  add('preserve', listCount * 0.45, 'Lists already encode hierarchy.')
  add('preserve', tableCount * 0.8, 'Tables usually benefit from structure preservation.')
  add('preserve', codeBlockCount * 0.35, 'Code blocks often belong in preserved source context.')
  if (structuredRatio >= 0.55) {
    add('preserve', 2.2, 'Most parsed hints are already structured.')
  }
  if (paragraphRatio <= 0.35 && structuredCount >= 3) {
    add('preserve', 1.3, 'The source is structured enough that compression is not necessary.')
  }

  add('action_first', taskListCount * 1.6, 'Task lists strongly suggest action-focused output.')
  add('action_first', coordinationSignalCount * 1.05, 'Decisions, risks, owners, or timelines are dense.')
  if (taskListCount > 0 && (coordinationSignalCount >= 1 || actionHintCount >= 2)) {
    add('action_first', 1.8, 'Task lists plus action-heavy semantics favour action-first mode.')
  }
  if (actionDensity >= 0.45 && (taskListCount > 0 || coordinationSignalCount >= 2)) {
    add('action_first', 2.4, 'A large share of semantic hints are action-oriented.')
  }

  add('distill', paragraphCount * 0.7, 'Paragraph-heavy prose benefits from distillation.')
  add('distill', evidenceSignalCount * 0.45, 'Evidence and metric prose often needs summarization.')
  if (paragraphRatio >= 0.45) {
    add('distill', 1.8, 'The source contains enough prose to justify a distilled summary branch.')
  }
  if (structuredCount <= 2) {
    add('distill', 1.1, 'Sparse structure makes distillation the safer default.')
  }

  switch (options.classification?.archetype) {
    case 'meeting':
    case 'plan':
    case 'postmortem':
      add('action_first', 1.2, 'The detected archetype usually carries actions, decisions, and risks.')
      break
    case 'method':
    case 'knowledge':
      add('preserve', 1.1, 'The detected archetype benefits from keeping structure visible.')
      break
    case 'argument':
    case 'report':
    case 'mixed':
      add('distill', 0.9, 'The detected archetype usually benefits from synthesis before import.')
      break
    default:
      break
  }

  const ordered = [...scores].sort((left, right) => right.score - left.score)
  const top1 = ordered[0]
  const top2 = ordered[1]

  if (!top1) {
    return {
      preset: 'distill',
      confidence: 'low',
      rationale: 'No strong preset signal was detected, so distill stays the safest default.',
      secondaryPreset: null,
    }
  }

  const total = Math.max(1, sumScores(ordered))
  const top1Share = Math.min(1, top1.score / total)
  const top2Share = Math.min(1, (top2?.score ?? 0) / total)

  return {
    preset: top1.preset,
    confidence: confidenceFromGap(top1Share, top2Share),
    rationale: top1.reasons.slice(-2).join(' '),
    secondaryPreset: top2?.score ? top2.preset : null,
  }
}

function createContentArtifactKey(options: {
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
}): string {
  return stableStringify({
    sourceName: options.sourceName,
    hints: options.preprocessedHints.map((hint) => ({
      kind: hint.kind,
      text: hint.text,
      level: hint.level,
      lineStart: hint.lineStart,
      lineEnd: hint.lineEnd,
      sourcePath: hint.sourcePath,
      items: hint.items ?? null,
      checked: hint.checked ?? null,
      rows: hint.rows ?? null,
    })),
  })
}

function createPlannedStructureKey(options: {
  contentKey: string
  rootTitle: string
  intent: TextImportRequest['intent']
  sourceName: string
  profile: TextImportContentProfile
  archetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
  nodeBudget: TextImportNodeBudget
}): string {
  return stableStringify({
    contentKey: options.contentKey,
    rootTitle: options.rootTitle,
    intent: options.intent,
    sourceName: options.sourceName,
    profile: options.profile,
    archetype: options.archetype ?? null,
    archetypeMode: options.archetypeMode ?? 'auto',
    nodeBudget: options.nodeBudget,
  })
}

export function assessTextImportStructure(options: {
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
}): TextImportStructureAssessment {
  const totalHints = Math.max(1, options.preprocessedHints.length)
  const structuredHintCount = options.preprocessedHints.filter((hint) =>
    ['heading', 'bullet_list', 'ordered_list', 'task_list', 'table'].includes(hint.kind),
  ).length
  const headingCount = options.preprocessedHints.filter((hint) => hint.kind === 'heading').length
  const paragraphCount = options.preprocessedHints.filter((hint) => hint.kind === 'paragraph').length
  const actionLikeHintCount = options.semanticHints.filter((hint) =>
    ['decision', 'action', 'risk', 'question', 'metric', 'timeline', 'owner'].includes(hint.kind),
  ).length
  const structuredRatio = structuredHintCount / totalHints
  const paragraphRatio = paragraphCount / totalHints
  const semanticDensity = options.semanticHints.length / totalHints
  const markdownBias = /\.(md|markdown)$/i.test(options.sourceName) ? 0.08 : 0
  const score = Math.max(
    0,
    Math.min(
      1,
      structuredRatio * 0.52 +
        Math.min(1, headingCount / 4) * 0.18 +
        Math.min(1, semanticDensity) * 0.16 +
        (paragraphRatio <= 0.35 ? 0.06 : 0) +
        markdownBias,
    ),
  )
  const recommendedRoute: TextImportRecommendedRoute =
    score >= 0.5 || (headingCount >= 2 && structuredRatio >= 0.42)
      ? 'local_markdown'
      : 'codex_import'
  const confidenceBase =
    recommendedRoute === 'local_markdown' ? score : 1 - score
  const confidence = Math.max(0.35, Math.min(0.98, 0.35 + confidenceBase * 0.63))
  const needsDeepPass =
    recommendedRoute === 'codex_import' ||
    (actionLikeHintCount >= 6 && paragraphRatio >= 0.3) ||
    totalHints >= 18

  return {
    score,
    confidence,
    recommendedRoute,
    isShallowPass: false,
    needsDeepPass,
  }
}

export function prepareTextImportArtifacts(options: {
  rootTitle: string
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  intent: TextImportRequest['intent']
  profile: TextImportContentProfile
  archetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
  nodeBudget: TextImportNodeBudget
}): PreparedTextImportArtifacts {
  const contentKey = createContentArtifactKey({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
  })
  const cachedSemanticHints = semanticHintsCache.get(contentKey)
  const semanticHints = cachedSemanticHints ?? deriveTextImportSemanticHints(options.preprocessedHints)
  if (!cachedSemanticHints) {
    semanticHintsCache.set(contentKey, semanticHints)
  }

  const cachedSemanticUnits = semanticUnitsCache.get(contentKey)
  const semanticUnits =
    cachedSemanticUnits ??
    deriveTextImportSemanticUnits({
      preprocessedHints: options.preprocessedHints,
      semanticHints,
    })
  if (!cachedSemanticUnits) {
    semanticUnitsCache.set(contentKey, semanticUnits)
  }

  const planKey = createPlannedStructureKey({
    contentKey,
    rootTitle: options.rootTitle,
    intent: options.intent,
    sourceName: options.sourceName,
    profile: options.profile,
    archetype: options.archetype,
    archetypeMode: options.archetypeMode,
    nodeBudget: options.nodeBudget,
  })
  const cachedPlannedStructure = plannedStructureCache.get(planKey)
  const plannedStructure =
    cachedPlannedStructure ??
    planTextImportFromSemanticHints({
      rootTitle: options.rootTitle,
      intent: options.intent,
      sourceName: options.sourceName,
      preprocessedHints: options.preprocessedHints,
      profile: options.profile,
      archetype: options.archetype,
      archetypeMode: options.archetypeMode,
      nodeBudget: options.nodeBudget,
      semanticHints,
      semanticUnits,
    })
  if (!cachedPlannedStructure) {
    plannedStructureCache.set(planKey, plannedStructure)
  }

  return {
    contentKey,
    planKey,
    semanticHints,
    semanticUnits,
    plannedStructure,
    artifactReuse: {
      contentKey,
      planKey,
      reusedSemanticHints: Boolean(cachedSemanticHints),
      reusedSemanticUnits: Boolean(cachedSemanticUnits),
      reusedPlannedStructure: Boolean(cachedPlannedStructure),
    },
    structure: assessTextImportStructure({
      sourceName: options.sourceName,
      preprocessedHints: options.preprocessedHints,
      semanticHints,
    }),
  }
}

function buildTextImportPlanningSummary(options: {
  sourceName: string
  sourceType: TextImportRequest['sourceType']
  presetSelection: TextImportPresetSelection
  classification: TextImportClassification
  resolvedPreset: TextImportPreset
  resolvedArchetype: TextImportArchetype
  isManual: boolean
  structure: TextImportStructureAssessment
}): TextImportSourcePlanningSummary {
  const presetConfidence = options.presetSelection.confidence
  const archetypeConfidence = formatTextImportClassificationConfidence(
    options.classification.confidence,
  )
  const confidence = options.isManual
    ? 'high'
    : lowerConfidence(presetConfidence, archetypeConfidence)
  const presetRationale =
    options.resolvedPreset === options.presetSelection.preset && !options.isManual
      ? options.presetSelection.rationale
      : `Manually set strategy to ${TEXT_IMPORT_PRESET_LABELS[options.resolvedPreset]}.`
  const archetypeRationale =
    options.resolvedArchetype === options.classification.archetype && !options.isManual
      ? options.classification.rationale
      : `Manually set archetype to ${TEXT_IMPORT_ARCHETYPE_LABELS[options.resolvedArchetype]}.`

  return {
    sourceName: options.sourceName,
    sourceType: options.sourceType,
    resolvedPreset: options.resolvedPreset,
    resolvedArchetype: options.resolvedArchetype,
    confidence,
    presetConfidence,
    archetypeConfidence,
    structureScore: Number(options.structure.score.toFixed(3)),
    structureConfidence: Number(options.structure.confidence.toFixed(3)),
    recommendedRoute: options.structure.recommendedRoute,
    isShallowPass: options.structure.isShallowPass,
    needsDeepPass: options.structure.needsDeepPass,
    rationale: `${presetRationale} ${archetypeRationale}`.trim(),
    presetRationale,
    archetypeRationale,
    isManual: options.isManual,
  }
}

export function resolveTextImportPlanningOptions(options: {
  sourceName: string
  sourceType: TextImportRequest['sourceType']
  preprocessedHints: TextImportPreprocessHint[]
  presetOverride?: TextImportPreset | null
  archetypeOverride?: TextImportArchetype | null
}): ResolvedTextImportPlanningOptions {
  const contentKey = createContentArtifactKey({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
  })
  const initialSemanticHints =
    semanticHintsCache.get(contentKey) ?? deriveTextImportSemanticHints(options.preprocessedHints)
  if (!semanticHintsCache.has(contentKey)) {
    semanticHintsCache.set(contentKey, initialSemanticHints)
  }
  const presetSelection = resolveTextImportPresetSelection({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
    semanticHints: initialSemanticHints,
  })
  const initialSemanticUnits =
    semanticUnitsCache.get(contentKey) ??
    deriveTextImportSemanticUnits({
      preprocessedHints: options.preprocessedHints,
      semanticHints: initialSemanticHints,
    })
  if (!semanticUnitsCache.has(contentKey)) {
    semanticUnitsCache.set(contentKey, initialSemanticUnits)
  }
  const classification = resolveTextImportClassification({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
    semanticHints: initialSemanticHints,
    semanticUnits: initialSemanticUnits,
    explicitArchetype: options.archetypeOverride ?? undefined,
    archetypeMode: options.archetypeOverride ? 'manual' : 'auto',
  })
  const resolvedPreset = options.presetOverride ?? presetSelection.preset
  const resolvedArchetype = options.archetypeOverride ?? classification.archetype
  const intent =
    resolvedPreset === 'preserve' ? 'preserve_structure' : 'distill_structure'
  const contentProfile = detectTextImportContentProfile({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
    semanticHints: initialSemanticHints,
    explicitArchetype: resolvedArchetype,
    archetypeMode: 'manual',
  })
  const baseNodeBudget = resolveTextImportNodeBudget(intent, contentProfile)
  const nodeBudget =
    resolvedPreset === 'action_first'
      ? {
          maxRoots: Math.max(4, Math.min(baseNodeBudget.maxRoots, 5)),
          maxDepth: baseNodeBudget.maxDepth,
          maxTotalNodes: Math.max(18, Math.min(baseNodeBudget.maxTotalNodes, 24)),
        }
      : baseNodeBudget
  const preparedArtifacts = prepareTextImportArtifacts({
    rootTitle: options.sourceName.replace(/\.[^.]+$/, '') || options.sourceName,
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
    intent,
    profile: contentProfile,
    archetype: resolvedArchetype,
    archetypeMode: options.archetypeOverride ? 'manual' : 'auto',
    nodeBudget,
  })

  return {
    semanticHints: preparedArtifacts.semanticHints,
    semanticUnits: preparedArtifacts.semanticUnits,
    contentProfile,
    nodeBudget,
    intent,
    resolvedPreset,
    resolvedArchetype,
    summary: buildTextImportPlanningSummary({
      sourceName: options.sourceName,
      sourceType: options.sourceType,
      presetSelection,
      classification,
      resolvedPreset,
      resolvedArchetype,
      isManual: Boolean(options.presetOverride || options.archetypeOverride),
      structure: preparedArtifacts.structure,
    }),
    preparedArtifacts,
  }
}

export function resolveTextImportNodeBudget(
  intent: TextImportRequest['intent'],
  profile: TextImportContentProfile,
  budget?: TextImportNodeBudget,
): TextImportNodeBudget {
  const defaults = DEFAULT_NODE_BUDGETS[profile]
  if (!budget) {
    return intent === 'preserve_structure'
      ? { maxRoots: Math.max(defaults.maxRoots + 2, 8), maxDepth: 6, maxTotalNodes: defaults.maxTotalNodes + 18 }
      : defaults
  }

  return {
    maxRoots: Math.max(1, Math.round(budget.maxRoots)),
    maxDepth: Math.max(2, Math.round(budget.maxDepth)),
    maxTotalNodes: Math.max(3, Math.round(budget.maxTotalNodes)),
  }
}

function createAnchorsFromUnit(unit: TextImportSemanticUnit): TextImportSourceAnchor[] {
  return [{ lineStart: unit.lineStart, lineEnd: unit.lineEnd }]
}

function titleFromUnit(unit: TextImportSemanticUnit): string {
  const firstLine = normalizeText(unit.text).split('\n')[0] ?? ''
  return truncate(firstLine || 'Untitled', 60)
}

function combineFoldedSlotLines(lines: string[]): string | null {
  const note = lines.filter(Boolean).join('\n').trim()
  return note || null
}

function estimateSlotPriority(entry: SlotPlanEntry): number {
  switch (entry.priority) {
    case 'primary':
      return 3
    case 'secondary':
      return 2
    default:
      return 1
  }
}

function selectTemplateSlotForUnit(
  archetype: TextImportArchetype,
  unit: TextImportSemanticUnit,
): TextImportTemplateSlot {
  const text = collapseWhitespace([unit.text, unit.excerpt].filter(Boolean).join('\n'))

  switch (archetype) {
    case 'method':
      if (unit.unitType === 'goal' || unit.unitType === 'summary') return 'goal'
      if (unit.unitType === 'use_case') return 'use_cases'
      if (unit.unitType === 'prerequisite' || /(鍓嶆彁|鍑嗗|鐜|渚濊禆)/iu.test(text)) return 'prerequisites'
      if (unit.unitType === 'step' || unit.unitType === 'action') return 'steps'
      if (unit.unitType === 'principle' || /(principle|guideline|rule)/iu.test(text)) return 'principles'
      if (unit.unitType === 'criterion' || unit.unitType === 'metric') return 'criteria'
      if (unit.unitType === 'risk' || unit.unitType === 'issue' || unit.unitType === 'limitation') return 'pitfalls'
      return 'examples'
    case 'argument':
      if (unit.unitType === 'claim' || /(鏍稿績瑙傜偣|涓诲紶|璁虹偣)/iu.test(text)) return 'claims'
      if (unit.unitType === 'summary') return 'thesis'
      if (unit.unitType === 'metric') return 'data'
      if (unit.unitType === 'limitation' || unit.unitType === 'risk' || /(counterexample|limitation|tradeoff)/iu.test(text)) return 'limitations'
      if (/(缁撹|鍥犳|鎵€浠缁间笂)/iu.test(text)) return 'conclusion'
      return unit.unitType === 'evidence' || unit.unitType === 'example' ? 'evidence' : 'claims'
    case 'plan':
      if (unit.unitType === 'goal' || unit.unitType === 'summary') return 'goal'
      if (unit.unitType === 'strategy' || /(绛栫暐|璺緞|鏂规)/iu.test(text)) return 'strategy'
      if (unit.unitType === 'owner') return 'owners'
      if (unit.unitType === 'timeline') return 'timeline'
      if (unit.unitType === 'risk' || unit.unitType === 'issue') return 'risks'
      if (unit.unitType === 'metric') return 'success_metrics'
      return 'actions'
    case 'report':
      if (unit.unitType === 'result' || /(缁撴灉|杈炬垚|浜у嚭)/iu.test(text)) return 'key_results'
      if (unit.unitType === 'progress' || /(progress|ongoing|in progress)/iu.test(text)) return 'progress'
      if (unit.unitType === 'metric') return 'metrics'
      if (unit.unitType === 'risk' || unit.unitType === 'issue') return 'blockers'
      if (unit.unitType === 'action' || unit.unitType === 'timeline') return 'next_steps'
      return 'summary'
    case 'meeting':
      if (unit.unitType === 'decision') return 'decisions'
      if (unit.unitType === 'action') return 'actions'
      if (unit.unitType === 'owner') return 'owners'
      if (unit.unitType === 'question') return 'open_questions'
      if (unit.unitType === 'timeline') return 'timepoints'
      if (unit.unitType === 'risk' || unit.unitType === 'issue') return 'risks'
      return 'agenda'
    case 'postmortem':
      if (unit.unitType === 'cause') return 'causes'
      if (unit.unitType === 'impact') return 'impacts'
      if (unit.unitType === 'issue' || unit.unitType === 'risk') return 'issues'
      if (/(淇|缂撹В|mitigation|fix)/iu.test(text) || unit.unitType === 'action') return 'fixes'
      if (/(棰勯槻|闃叉|閬垮厤鍐嶆|prevention)/iu.test(text) || unit.unitType === 'principle') return 'preventions'
      if (unit.unitType === 'evidence' || unit.unitType === 'metric' || unit.unitType === 'example') return 'evidence'
      return 'background'
    case 'knowledge':
      if (unit.unitType === 'definition' || unit.unitType === 'summary') return 'definition'
      if (/(缁勬垚|妯″潡|component)/iu.test(text)) return 'components'
      if (/(鍘熺悊|鏈哄埗|mechanism|how it works)/iu.test(text) || unit.unitType === 'principle') return 'mechanism'
      if (/(鍒嗙被|category|type)/iu.test(text)) return 'categories'
      if (unit.unitType === 'comparison') return 'comparisons'
      if (unit.unitType === 'risk' || unit.unitType === 'limitation') return 'cautions'
      return 'examples'
    case 'mixed':
    default:
      if (unit.unitType === 'question') return 'open_questions'
      if (unit.unitType === 'action') return 'actions'
      if (unit.unitType === 'evidence' || unit.unitType === 'example' || unit.unitType === 'metric') return 'evidence'
      if (unit.unitType === 'summary') return 'summary'
      return 'themes'
  }
}

function findClosestParentUnit(
  unit: TextImportSemanticUnit,
  candidateUnits: TextImportSemanticUnit[],
): string | null {
  let bestCandidateId: string | null = null
  let bestScore = Number.POSITIVE_INFINITY
  candidateUnits.forEach((candidate) => {
    if (candidate.id === unit.id) {
      return
    }
    const samePath = candidate.headingPath.join('>') === unit.headingPath.join('>')
    const distance = Math.abs(candidate.lineStart - unit.lineStart)
    if (!samePath && distance > 8) {
      return
    }
    const score = (samePath ? 0 : 100) + distance
    if (score < bestScore) {
      bestScore = score
      bestCandidateId = candidate.id
    }
  })
  return bestScore <= 108 ? bestCandidateId : null
}

function buildSlotAssignments(
  archetype: TextImportArchetype,
  semanticUnits: TextImportSemanticUnit[],
): PlannedUnitAssignment[] {
  const assignments: PlannedUnitAssignment[] = semanticUnits.map((unit) => ({
    unit,
    slot: selectTemplateSlotForUnit(archetype, unit),
    parentUnitId: null,
  }))

  const attachableParents = assignments
    .filter((assignment) =>
      ['claim', 'step', 'decision', 'summary', 'goal', 'result', 'progress'].includes(assignment.unit.unitType),
    )
    .map((assignment) => assignment.unit)

  assignments.forEach((assignment) => {
    if (!['evidence', 'metric', 'example', 'timeline', 'owner'].includes(assignment.unit.unitType)) {
      return
    }
    assignment.parentUnitId = findClosestParentUnit(assignment.unit, attachableParents)
  })

  return assignments
}

export function formatTextImportTemplateSlotLabel(slot: TextImportTemplateSlot | null | undefined): string | null {
  if (!slot) {
    return null
  }
  return TEMPLATE_SLOT_LABELS[slot] ?? slot
}

function createTemplateSummary(
  archetype: TextImportArchetype,
  visibleSlots: TextImportTemplateSlot[],
  foldedSlots: TextImportTemplateSlot[],
): TextImportTemplateSummary {
  return {
    archetype,
    visibleSlots,
    foldedSlots,
  }
}

export function buildTextImportTemplatePlan(options: {
  rootTitle: string
  archetype: TextImportArchetype
  semanticUnits: TextImportSemanticUnit[]
  nodeBudget: TextImportNodeBudget
}): { nodePlans: TextImportNodePlan[]; templateSummary: TextImportTemplateSummary } {
  const slotDefinitions = TEMPLATE_SLOT_ORDER[options.archetype]
  const assignments = buildSlotAssignments(options.archetype, options.semanticUnits)
  const assignmentsBySlot = new Map<TextImportTemplateSlot, PlannedUnitAssignment[]>()

  assignments.forEach((assignment) => {
    const bucket = assignmentsBySlot.get(assignment.slot) ?? []
    bucket.push(assignment)
    assignmentsBySlot.set(assignment.slot, bucket)
  })

  const populatedSlots = slotDefinitions
    .filter((entry) => (assignmentsBySlot.get(entry.slot)?.length ?? 0) > 0)
    .sort((left, right) => estimateSlotPriority(right) - estimateSlotPriority(left))
    .slice(0, options.nodeBudget.maxRoots)

  const explicitSlots = populatedSlots.filter((entry) => {
    const count = assignmentsBySlot.get(entry.slot)?.length ?? 0
    return Boolean(entry.alwaysExplicit) || count >= 2
  })
  const foldedSlots = populatedSlots
    .filter((entry) => !explicitSlots.some((candidate) => candidate.slot === entry.slot))
    .map((entry) => entry.slot)

  const visibleSlots = explicitSlots.map((entry) => entry.slot)
  const templateSummary = createTemplateSummary(options.archetype, visibleSlots, foldedSlots)

  const nodePlans: TextImportNodePlan[] = []
  const rootPlan: TextImportNodePlan = {
    id: 'import_root',
    parentId: null,
    order: 0,
    title: options.rootTitle,
    note: null,
    semanticRole: 'section',
    confidence: 'high',
    sourceAnchors: [],
    groupKey: 'root',
    priority: 'primary',
    collapsedByDefault: false,
    templateSlot: null,
  }
  nodePlans.push(rootPlan)

  const foldedLines: string[] = []
  foldedSlots.forEach((slot) => {
    const entry = populatedSlots.find((candidate) => candidate.slot === slot)
    const firstAssignment = assignmentsBySlot.get(slot)?.[0]
    if (!entry || !firstAssignment) {
      return
    }
    foldedLines.push(`- ${entry.label}: ${collapseWhitespace(firstAssignment.unit.text)}`)
  })
  rootPlan.note = combineFoldedSlotLines(foldedLines)

  let totalNodes = 1
  const unitNodeIdByUnitId = new Map<string, string>()

  explicitSlots.forEach((entry, slotIndex) => {
    if (totalNodes >= options.nodeBudget.maxTotalNodes) {
      return
    }
    const containerId = createPlanId(`slot_${entry.slot}`, slotIndex)
    const slotAssignments = [...(assignmentsBySlot.get(entry.slot) ?? [])].sort((left, right) => {
      if (left.unit.lineStart !== right.unit.lineStart) {
        return left.unit.lineStart - right.unit.lineStart
      }
      return left.unit.id.localeCompare(right.unit.id)
    })

    nodePlans.push({
      id: containerId,
      parentId: 'import_root',
      order: slotIndex,
      title: entry.label,
      note: null,
      semanticRole: entry.semanticRole,
      confidence:
        slotAssignments.some((assignment) => assignment.unit.confidence === 'high') ? 'high' : 'medium',
      sourceAnchors: slotAssignments.flatMap((assignment) => createAnchorsFromUnit(assignment.unit)).slice(0, 8),
      groupKey: entry.slot,
      priority: entry.priority,
      collapsedByDefault: entry.collapsedByDefault ?? false,
      templateSlot: entry.slot,
    })
    totalNodes += 1

    const topLevelAssignments = slotAssignments.filter((assignment) => !assignment.parentUnitId)
    topLevelAssignments.forEach((assignment, itemIndex) => {
      if (totalNodes >= options.nodeBudget.maxTotalNodes) {
        return
      }
      const nodeId = createPlanId(`${containerId}_item`, itemIndex)
      unitNodeIdByUnitId.set(assignment.unit.id, nodeId)
      nodePlans.push({
        id: nodeId,
        parentId: containerId,
        order: itemIndex,
        title: titleFromUnit(assignment.unit),
        note: normalizeText(assignment.unit.excerpt) || null,
        semanticRole: entry.semanticRole,
        confidence: assignment.unit.confidence,
        sourceAnchors: createAnchorsFromUnit(assignment.unit),
        groupKey: entry.slot,
        priority: entry.priority,
        collapsedByDefault: entry.collapsedByDefault ?? false,
        templateSlot: entry.slot,
      })
      totalNodes += 1
    })
  })

  explicitSlots.forEach((entry) => {
    const slotAssignments = assignmentsBySlot.get(entry.slot) ?? []
    const attachedAssignments = slotAssignments.filter((assignment) => Boolean(assignment.parentUnitId))
    const childrenByParent = new Map<string, PlannedUnitAssignment[]>()
    attachedAssignments.forEach((assignment) => {
      const parentId = assignment.parentUnitId as string
      const bucket = childrenByParent.get(parentId) ?? []
      bucket.push(assignment)
      childrenByParent.set(parentId, bucket)
    })

    childrenByParent.forEach((children, parentUnitId) => {
      const parentNodeId = unitNodeIdByUnitId.get(parentUnitId)
      if (!parentNodeId) {
        return
      }
      children
        .sort((left, right) => left.unit.lineStart - right.unit.lineStart)
        .forEach((assignment, childIndex) => {
          if (totalNodes >= options.nodeBudget.maxTotalNodes) {
            return
          }
          const childNodeId = createPlanId(`${parentNodeId}_support`, childIndex)
          nodePlans.push({
            id: childNodeId,
            parentId: parentNodeId,
            order: childIndex,
            title: titleFromUnit(assignment.unit),
            note: normalizeText(assignment.unit.excerpt) || null,
            semanticRole:
              assignment.unit.unitType === 'metric'
                ? 'metric'
                : assignment.unit.unitType === 'timeline'
                ? 'timeline'
                : assignment.unit.unitType === 'owner'
                ? 'action'
                : 'evidence',
            confidence: assignment.unit.confidence,
            sourceAnchors: createAnchorsFromUnit(assignment.unit),
            groupKey: entry.slot,
            priority:
              assignment.unit.unitType === 'metric'
                ? 'secondary'
                : assignment.unit.unitType === 'timeline'
                ? 'secondary'
                : 'supporting',
            collapsedByDefault: assignment.unit.unitType === 'evidence',
            templateSlot: entry.slot,
          })
          totalNodes += 1
        })
    })
  })

  return { nodePlans, templateSummary }
}

export function planTextImportFromSemanticHints(options: {
  rootTitle: string
  intent: TextImportRequest['intent']
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  profile?: TextImportContentProfile
  archetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
  nodeBudget: TextImportNodeBudget
  semanticHints: TextImportSemanticHint[]
  semanticUnits?: TextImportSemanticUnit[]
}): PlannedTextImportStructure {
  const semanticUnits =
    options.semanticUnits ??
    deriveTextImportSemanticUnits({
      preprocessedHints: options.preprocessedHints,
      semanticHints: options.semanticHints,
    })
  const classification = resolveTextImportClassification({
    sourceName: options.sourceName,
    preprocessedHints: options.preprocessedHints,
    semanticHints: options.semanticHints,
    semanticUnits,
    explicitArchetype: options.archetype,
    archetypeMode: options.archetypeMode,
  })
  const profile = options.profile ?? mapTextImportArchetypeToContentProfile(classification.archetype)
  const template = buildTextImportTemplatePlan({
    rootTitle: options.rootTitle,
    archetype: classification.archetype,
    semanticUnits,
    nodeBudget: options.nodeBudget,
  })

  return {
    nodePlans: template.nodePlans,
    classification,
    templateSummary: template.templateSummary,
    semanticUnits,
    profile,
  }
}

export function createTextImportNodePlansFromSemanticHints(options: {
  rootTitle: string
  intent: TextImportRequest['intent']
  sourceName: string
  preprocessedHints: TextImportPreprocessHint[]
  profile?: TextImportContentProfile
  archetype?: TextImportArchetype
  archetypeMode?: TextImportRequest['archetypeMode']
  nodeBudget: TextImportNodeBudget
  semanticHints: TextImportSemanticHint[]
}): TextImportNodePlan[] {
  return planTextImportFromSemanticHints(options).nodePlans
}

function sortPreviewItems(items: TextImportPreviewItem[]): TextImportPreviewItem[] {
  return [...items].sort((left, right) => {
    if (left.parentId !== right.parentId) {
      return (left.parentId ?? '').localeCompare(right.parentId ?? '')
    }
    if (left.order !== right.order) {
      return left.order - right.order
    }
    return left.id.localeCompare(right.id)
  })
}

export function deriveTextImportNodePlansFromPreviewNodes(options: {
  previewNodes: TextImportPreviewItem[]
}): TextImportNodePlan[] {
  const previewNodes = sortPreviewItems(options.previewNodes)
  const childCountByParent = new Map<string, number>()

  previewNodes.forEach((node) => {
    if (!node.parentId) {
      return
    }

    childCountByParent.set(node.parentId, (childCountByParent.get(node.parentId) ?? 0) + 1)
  })

  return previewNodes.map((node) => {
    const hasChildren = childCountByParent.has(node.id)
    const isRoot = node.parentId === null

    return {
      id: node.id,
      parentId: node.parentId,
      order: node.order,
      title: normalizeText(node.title) || 'Untitled',
      note: normalizeText(node.note) || null,
      semanticRole: node.semanticRole ?? (hasChildren || isRoot ? 'section' : 'summary'),
      semanticType: node.semanticType ?? null,
      confidence: node.confidence ?? (isRoot ? 'high' : 'medium'),
      sourceAnchors: node.sourceAnchors?.map((anchor) => ({ ...anchor })) ?? [],
      groupKey: null,
      priority: isRoot ? 'primary' : hasChildren ? 'secondary' : null,
      collapsedByDefault: null,
      templateSlot: node.templateSlot ?? null,
    }
  })
}

export function compileTextImportPreviewNodesToOperations(options: {
  insertionParentTopicId: string
  previewNodes: TextImportPreviewItem[]
}): AiImportOperation[] {
  const previewNodes = sortPreviewItems(options.previewNodes)
  const operations: AiImportOperation[] = []

  previewNodes.forEach((node) => {
    const parentTarget = (
      node.parentId
        ? (`ref:${node.parentId}` as AiCanvasTarget)
        : (`topic:${options.insertionParentTopicId}` as AiCanvasTarget)
    )
    const operation: AiCanvasOperation = {
      type: 'create_child',
      parent: parentTarget,
      title: node.title,
      note: node.note ?? undefined,
      metadata: node.semanticType === 'task' ? { type: 'task' } : undefined,
      resultRef: node.id,
    }

    operations.push({
      ...operation,
      id: `op_${node.id}`,
      risk: 'low',
      reason: 'Safe additive import.',
    })
  })

  return operations
}

export function compileTextImportNodePlans(options: {
  insertionParentTopicId: string
  nodePlans: TextImportNodePlan[]
}): { previewNodes: TextImportPreviewItem[]; operations: AiImportOperation[] } {
  const previewNodes = sortPreviewItems(
    options.nodePlans.map((plan) => ({
      id: plan.id,
      parentId: plan.parentId,
      order: plan.order,
      title: normalizeText(plan.title) || 'Untitled',
      note: normalizeText(plan.note) || null,
      relation: 'new' as const,
      matchedTopicId: null,
      reason: null,
      semanticRole: plan.semanticRole,
      semanticType: plan.semanticType ?? null,
      confidence: plan.confidence,
      sourceAnchors: plan.sourceAnchors.map((anchor) => ({ ...anchor })),
      templateSlot: plan.templateSlot ?? null,
    })),
  )

  const operations = compileTextImportPreviewNodesToOperations({
    insertionParentTopicId: options.insertionParentTopicId,
    previewNodes,
  })

  return { previewNodes, operations }
}

export function buildTextImportQualityWarnings(options: {
  previewNodes: TextImportPreviewItem[]
  nodeBudget?: TextImportNodeBudget
}): string[] {
  const warnings = new Set<string>()
  const childrenByParent = new Map<string | null, TextImportPreviewItem[]>()

  options.previewNodes.forEach((node) => {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  })

  const nonRootNodes = options.previewNodes.filter((node) => node.parentId !== null)
  const missingRoleCount = nonRootNodes.filter((node) => !node.semanticRole).length
  if (nonRootNodes.length > 0 && missingRoleCount / nonRootNodes.length > 0.4) {
    warnings.add('Too many preview nodes are missing semantic roles, which usually indicates a weak import structure.')
  }

  const genericTitleCount = nonRootNodes.filter((node) =>
    GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalizeText(node.title))),
  ).length
  if (nonRootNodes.length > 0 && genericTitleCount / nonRootNodes.length > 0.25) {
    warnings.add('A large share of preview nodes use generic titles. The import may need stronger title distillation.')
  }

  childrenByParent.forEach((siblings, parentId) => {
    if (siblings.length > 8) {
      warnings.add(
        parentId === null
          ? 'Top-level import branches are too dense. Consider a tighter node budget or stronger semantic grouping.'
          : `Preview group ${parentId} has too many sibling nodes, which can make the map hard to scan.`,
      )
    }

    const seenTitles = new Set<string>()
    siblings.forEach((sibling) => {
      const titleKey = normalizeTitleKey(sibling.title)
      if (!titleKey) {
        return
      }
      if (seenTitles.has(titleKey)) {
        warnings.add(`Preview group ${parentId ?? 'root'} contains duplicate sibling titles.`)
        return
      }
      seenTitles.add(titleKey)
    })
  })

  const childCountById = new Map<string, number>()
  options.previewNodes.forEach((node) => {
    if (node.parentId) {
      childCountById.set(node.parentId, (childCountById.get(node.parentId) ?? 0) + 1)
    }
  })

  nonRootNodes.forEach((node) => {
    if ((node.note?.length ?? 0) > 480 && (childCountById.get(node.id) ?? 0) === 0) {
      warnings.add(`Preview node "${node.title}" still carries a long note dump instead of distilled child nodes.`)
    }
  })

  if (options.nodeBudget && nonRootNodes.length > options.nodeBudget.maxTotalNodes) {
    warnings.add('The preview exceeded the requested node budget before apply. Distillation should be tightened.')
  }

  const supportingRatio =
    nonRootNodes.length > 0
      ? nonRootNodes.filter((node) => node.semanticRole === 'evidence').length / nonRootNodes.length
      : 0
  if (supportingRatio > 0.45) {
    warnings.add('Evidence-heavy nodes dominate the preview. Consider stronger claim or step grouping.')
  }

  return [...warnings]
}

export function formatTextImportArchetypeLabel(archetype: TextImportArchetype): string {
  return TEXT_IMPORT_ARCHETYPE_LABELS[archetype] ?? archetype
}

export function formatTextImportPresetLabel(preset: TextImportPreset): string {
  return TEXT_IMPORT_PRESET_LABELS[preset] ?? preset
}

export function formatTextImportClassificationConfidence(value: number): TextImportConfidence {
  return confidenceLabelFromNumeric(value)
}
