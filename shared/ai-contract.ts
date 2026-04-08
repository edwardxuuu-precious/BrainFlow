export type AiRole = 'user' | 'assistant'

export type AiTopicMarker =
  | 'important'
  | 'question'
  | 'idea'
  | 'warning'
  | 'decision'
  | 'blocked'

export type AiTopicSticker =
  | 'smile'
  | 'party'
  | 'heart'
  | 'star'
  | 'fire'
  | 'rocket'
  | 'bulb'
  | 'target'
  | 'coffee'
  | 'clap'
  | 'rainbow'
  | 'sparkles'

export type AiTopicType = 'normal' | 'milestone' | 'task'

export interface AiTopicMetadata {
  labels: string[]
  markers: AiTopicMarker[]
  stickers?: AiTopicSticker[]
  type?: AiTopicType
}

export interface AiTopicMetadataPatch {
  labels?: string[] | null
  type?: AiTopicType | null
}

export interface AiTopicStyle {
  emphasis?: 'normal' | 'focus'
  variant?: 'default' | 'soft' | 'solid'
  background?: string
  textColor?: string
  branchColor?: string
}

export interface AiMessage {
  id: string
  role: AiRole
  content: string
  createdAt: number
}

export interface AiDocumentTopicContext {
  topicId: string
  title: string
  note: string
  metadata: AiTopicMetadata
  style: AiTopicStyle
  parentTopicId: string | null
  childTopicIds: string[]
  aiLocked: boolean
}

export interface AiFocusContext {
  activeTopicId: string | null
  selectedTopicIds: string[]
  relationSummary: string[]
}

export type AiContextScope = 'full_document' | 'focused_subset' | 'empty'

export interface AiSelectionContext {
  documentTitle: string
  rootTopicId: string
  scope: AiContextScope
  topicCount: number
  topics: AiDocumentTopicContext[]
  focus: AiFocusContext
}

export type AiCanvasTarget = `topic:${string}` | `ref:${string}`

export type TextImportNodePriority = 'primary' | 'secondary' | 'supporting'

export type KnowledgeSemanticNodeType =
  | 'topic'
  | 'criterion'
  | 'insight'
  | 'question'
  | 'evidence'
  | 'decision'
  | 'goal'
  | 'project'
  | 'task'
  | 'review'

export type KnowledgeSemanticEdgeType =
  | 'belongs_to'
  | 'supports'
  | 'contradicts'
  | 'leads_to'
  | 'depends_on'
  | 'derived_from'

export type KnowledgeViewType = 'archive_view' | 'thinking_view' | 'execution_view'

export type KnowledgeViewLayoutType = 'mindmap' | 'archive' | 'execution'

export type KnowledgeTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export type KnowledgeTaskPriority = 'low' | 'medium' | 'high'

export interface TextImportPresentationHints {
  collapsedByDefault?: boolean
  groupKey?: string | null
  priority?: TextImportNodePriority | null
}

export interface KnowledgeSource {
  id: string
  type: TextImportSourceType
  title: string
  raw_content: string
  metadata: Record<string, unknown>
}

export interface KnowledgeSourceRef {
  sourceId: string
  lineStart: number
  lineEnd: number
  pathTitles: string[]
}

export interface KnowledgeSemanticTaskFields {
  status: KnowledgeTaskStatus
  owner: string | null
  due_date: string | null
  priority: KnowledgeTaskPriority | null
  depends_on: string[]
  source_refs: KnowledgeSourceRef[]
  definition_of_done: string | null
}

export interface KnowledgeSemanticNode {
  id: string
  type: KnowledgeSemanticNodeType
  title: string
  summary: string
  detail: string
  source_refs: KnowledgeSourceRef[]
  confidence: TextImportConfidence
  task: KnowledgeSemanticTaskFields | null
}

export interface KnowledgeSemanticEdge {
  from: string
  to: string
  type: KnowledgeSemanticEdgeType
  label: string | null
  source_refs: KnowledgeSourceRef[]
  confidence: TextImportConfidence
}

export interface KnowledgeView {
  id: string
  type: KnowledgeViewType
  visible_node_ids: string[]
  layout_type: KnowledgeViewLayoutType
}

export interface KnowledgeViewProjection {
  viewId: string
  viewType: KnowledgeViewType
  summary: string
  nodePlans: TextImportNodePlan[]
  previewNodes: TextImportPreviewItem[]
  operations: AiImportOperation[]
}

export interface KnowledgeImportBundle {
  id: string
  title: string
  createdAt: number
  anchorTopicId: string | null
  defaultViewId: string
  activeViewId: string
  mountedRootTopicId: string | null
  sources: KnowledgeSource[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  views: KnowledgeView[]
  viewProjections: Record<string, KnowledgeViewProjection>
}

export type AiCanvasOperation =
  | {
      type: 'create_child'
      parent: AiCanvasTarget
      title: string
      note?: string
      metadata?: AiTopicMetadataPatch
      style?: AiTopicStyle
      presentation?: TextImportPresentationHints
      resultRef?: string
    }
  | {
      type: 'create_sibling'
      anchor: AiCanvasTarget
      title: string
      note?: string
      metadata?: AiTopicMetadataPatch
      style?: AiTopicStyle
      presentation?: TextImportPresentationHints
      resultRef?: string
    }
  | {
      type: 'update_topic'
      target: AiCanvasTarget
      title?: string
      note?: string
      metadata?: AiTopicMetadataPatch
      style?: AiTopicStyle
      presentation?: TextImportPresentationHints
    }
  | {
      type: 'move_topic'
      target: AiCanvasTarget
      newParent: AiCanvasTarget
      targetIndex?: number
    }
  | {
      type: 'delete_topic'
      target: AiCanvasTarget
    }

export interface AiCanvasProposal {
  id: string
  summary: string
  baseDocumentUpdatedAt: number
  operations: AiCanvasOperation[]
}

export interface AiSkippedOperation {
  index: number
  type: AiCanvasOperation['type']
  reason: string
}

export interface AiApplySummary {
  summary: string
  appliedCount: number
  skippedCount: number
  warnings: string[]
}

export interface AiConversation {
  id?: string
  documentId: string
  documentTitle: string
  sessionId: string
  title: string
  messages: AiMessage[]
  updatedAt: number
  archivedAt: number | null
}

export interface AiSessionSummary {
  id?: string
  documentId: string
  documentTitle: string
  sessionId: string
  title: string
  updatedAt: number
  archivedAt: number | null
}

export interface AiChatRequest {
  documentId: string
  sessionId: string
  messages: AiMessage[]
  context: AiSelectionContext
  baseDocumentUpdatedAt: number
}

export interface AiChatResponse {
  assistantMessage: string
  needsMoreContext: boolean
  contextRequest?: string[]
  proposal?: AiCanvasProposal | null
  warnings?: string[]
}

export type TextImportSourceType = 'file' | 'paste'
export type TextImportIntent = 'preserve_structure' | 'distill_structure'
export type TextImportPreset = 'preserve' | 'distill' | 'action_first'
export type TextImportContentProfile =
  | 'report'
  | 'meeting_notes'
  | 'procedure'
  | 'mixed'
  | 'brain_dump'
export type TextImportArchetype =
  | 'method'
  | 'argument'
  | 'plan'
  | 'report'
  | 'meeting'
  | 'postmortem'
  | 'knowledge'
  | 'mixed'
export type TextImportArchetypeMode = 'auto' | 'manual'
export type TextImportConfidence = 'high' | 'medium' | 'low'
export type TextImportTemplateSlot =
  | 'goal'
  | 'use_cases'
  | 'prerequisites'
  | 'steps'
  | 'principles'
  | 'criteria'
  | 'pitfalls'
  | 'examples'
  | 'thesis'
  | 'claims'
  | 'evidence'
  | 'data'
  | 'limitations'
  | 'conclusion'
  | 'strategy'
  | 'actions'
  | 'owners'
  | 'timeline'
  | 'risks'
  | 'success_metrics'
  | 'summary'
  | 'key_results'
  | 'progress'
  | 'metrics'
  | 'blockers'
  | 'next_steps'
  | 'agenda'
  | 'decisions'
  | 'open_questions'
  | 'timepoints'
  | 'background'
  | 'issues'
  | 'causes'
  | 'impacts'
  | 'fixes'
  | 'preventions'
  | 'definition'
  | 'components'
  | 'mechanism'
  | 'categories'
  | 'comparisons'
  | 'cautions'
  | 'themes'

export type TextImportHintKind =
  | 'heading'
  | 'paragraph'
  | 'bullet_list'
  | 'ordered_list'
  | 'task_list'
  | 'blockquote'
  | 'code_block'
  | 'table'

export type TextImportSemanticHintKind =
  | 'decision'
  | 'action'
  | 'risk'
  | 'question'
  | 'metric'
  | 'timeline'
  | 'owner'
  | 'evidence'

export type TextImportSemanticRole =
  | 'section'
  | 'summary'
  | 'decision'
  | 'action'
  | 'risk'
  | 'question'
  | 'metric'
  | 'timeline'
  | 'evidence'

export type TextImportSemanticUnitType =
  | 'summary'
  | 'claim'
  | 'step'
  | 'criterion'
  | 'decision'
  | 'action'
  | 'risk'
  | 'question'
  | 'metric'
  | 'timeline'
  | 'evidence'
  | 'cause'
  | 'impact'
  | 'definition'
  | 'comparison'
  | 'example'
  | 'owner'
  | 'goal'
  | 'strategy'
  | 'result'
  | 'progress'
  | 'issue'
  | 'principle'
  | 'prerequisite'
  | 'use_case'
  | 'limitation'

export interface TextImportSourceAnchor {
  lineStart: number
  lineEnd: number
}

export interface TextImportPreprocessHint {
  id: string
  kind: TextImportHintKind
  text: string
  raw: string
  level: number
  lineStart: number
  lineEnd: number
  sourcePath: string[]
  language?: string | null
  items?: string[]
  checked?: boolean[]
  rows?: string[][]
}

export interface TextImportSemanticHint {
  id: string
  kind: TextImportSemanticHintKind
  text: string
  excerpt: string
  confidence: TextImportConfidence
  lineStart: number
  lineEnd: number
  sourcePath: string[]
}

export interface TextImportSemanticUnit {
  id: string
  unitType: TextImportSemanticUnitType
  text: string
  excerpt: string
  confidence: TextImportConfidence
  lineStart: number
  lineEnd: number
  sourcePath: string[]
  headingPath: string[]
}

export interface TextImportNodeBudget {
  maxRoots: number
  maxDepth: number
  maxTotalNodes: number
}

export interface TextImportNodePlan {
  id: string
  parentId: string | null
  order: number
  title: string
  note: string | null
  semanticRole: TextImportSemanticRole
  semanticType?: KnowledgeSemanticNodeType | null
  confidence: TextImportConfidence
  sourceAnchors: TextImportSourceAnchor[]
  groupKey?: string | null
  priority?: TextImportNodePriority | null
  collapsedByDefault?: boolean | null
  templateSlot?: TextImportTemplateSlot | null
}

export interface TextImportClassification {
  archetype: TextImportArchetype
  confidence: number
  rationale: string
  secondaryArchetype?: TextImportArchetype | null
}

export interface TextImportTemplateSummary {
  archetype: TextImportArchetype
  visibleSlots: TextImportTemplateSlot[]
  foldedSlots: TextImportTemplateSlot[]
}

export interface TextImportRequest {
  documentId: string
  documentTitle: string
  baseDocumentUpdatedAt: number
  context: AiSelectionContext
  anchorTopicId: string | null
  sourceName: string
  sourceType: TextImportSourceType
  intent: TextImportIntent
  archetype?: TextImportArchetype
  archetypeMode?: TextImportArchetypeMode
  contentProfile?: TextImportContentProfile
  nodeBudget?: TextImportNodeBudget
  rawText: string
  preprocessedHints: TextImportPreprocessHint[]
  semanticHints: TextImportSemanticHint[]
}

export type AiImportOperationRisk = 'low' | 'high'

export interface TextImportConflict {
  id: string
  title: string
  description: string
  kind:
    | 'rename'
    | 'move'
    | 'delete'
    | 'merge'
    | 'locked'
    | 'ambiguous_parent'
    | 'duplicate'
    | 'content_overlap'
    | 'code_block'
    | 'table'
    | 'other'
  operationIds: string[]
  targetTopicIds: string[]
}

export interface TextImportPreviewItem {
  id: string
  parentId: string | null
  order: number
  title: string
  note: string | null
  relation: 'new' | 'merge' | 'conflict'
  matchedTopicId: string | null
  reason: string | null
  semanticRole?: TextImportSemanticRole
  semanticType?: KnowledgeSemanticNodeType | null
  confidence?: TextImportConfidence
  sourceAnchors?: TextImportSourceAnchor[]
  templateSlot?: TextImportTemplateSlot | null
}

export interface TextImportPreviewNode extends TextImportPreviewItem {
  children: TextImportPreviewNode[]
}

export interface TextImportMergeSuggestion {
  id: string
  previewNodeId: string
  matchedTopicId: string
  matchedTopicTitle: string
  kind?: 'same_topic' | 'partial_overlap' | 'conflict'
  confidence: 'high' | 'medium'
  reason: string
}

export interface TextImportCrossFileMergeSuggestion {
  id: string
  previewNodeId: string
  sourceName: string
  matchedPreviewNodeId: string
  matchedSourceName: string
  matchedTitle: string
  kind?: 'same_topic' | 'partial_overlap' | 'conflict'
  confidence: 'high' | 'medium'
  reason: string
}

export interface TextImportSemanticTargetSnapshot {
  id: string
  scope: 'existing_topic' | 'import_preview'
  sourceName: string | null
  pathTitles: string[]
  title: string
  noteSummary: string
  parentTitle: string | null
  fingerprint?: string | null
}

export interface TextImportSemanticCandidate {
  candidateId: string
  scope: 'existing_topic' | 'cross_file'
  source: TextImportSemanticTargetSnapshot
  target: TextImportSemanticTargetSnapshot
}

export interface TextImportSemanticAdjudicationRequest {
  jobId: string
  documentId: string
  documentTitle: string
  batchTitle?: string | null
  candidates: TextImportSemanticCandidate[]
}

export interface TextImportSemanticDecision {
  candidateId: string
  kind: 'same_topic' | 'partial_overlap' | 'conflict' | 'distinct'
  confidence: 'high' | 'medium'
  mergedTitle: string | null
  mergedSummary: string | null
  evidence: string
}

export interface TextImportSemanticAdjudicationResponse {
  decisions: TextImportSemanticDecision[]
  warnings?: string[]
}

export interface TextImportBatchFileSummary {
  sourceName: string
  sourceType: TextImportSourceType
  previewNodeId: string
  nodeCount: number
  mergeSuggestionCount: number
  warningCount: number
  classification?: TextImportClassification | null
  templateSummary?: TextImportTemplateSummary | null
}

export interface TextImportBatchSummary {
  jobType: 'single' | 'batch'
  fileCount: number
  completedFileCount: number
  currentFileName: string | null
  batchContainerTitle?: string | null
  files?: TextImportBatchFileSummary[]
}

export interface TextImportSemanticMergeSummary {
  candidateCount: number
  adjudicatedCount: number
  autoMergedExistingCount: number
  autoMergedCrossFileCount: number
  conflictCount: number
  fallbackCount: number
}

export type AiImportOperation = AiCanvasOperation & {
  id: string
  risk: AiImportOperationRisk
  conflictId?: string
  reason?: string
  targetFingerprint?: string | null
}

export interface TextImportResponse {
  summary: string
  baseDocumentUpdatedAt: number
  anchorTopicId: string | null
  classification: TextImportClassification
  templateSummary: TextImportTemplateSummary
  bundle: KnowledgeImportBundle | null
  sources: KnowledgeSource[]
  semanticNodes: KnowledgeSemanticNode[]
  semanticEdges: KnowledgeSemanticEdge[]
  views: KnowledgeView[]
  viewProjections: Record<string, KnowledgeViewProjection>
  defaultViewId: string | null
  activeViewId: string | null
  nodePlans: TextImportNodePlan[]
  previewNodes: TextImportPreviewItem[]
  operations: AiImportOperation[]
  conflicts: TextImportConflict[]
  mergeSuggestions?: TextImportMergeSuggestion[]
  crossFileMergeSuggestions?: TextImportCrossFileMergeSuggestion[]
  semanticMerge?: TextImportSemanticMergeSummary | null
  batch?: TextImportBatchSummary | null
  warnings?: string[]
}

export type MarkdownImportRequest = TextImportRequest
export type MarkdownImportConflict = TextImportConflict
export type MarkdownImportPreviewNode = TextImportPreviewItem
export type MarkdownImportResponse = TextImportResponse

export type CodexBridgeIssueCode =
  | 'cli_missing'
  | 'login_required'
  | 'verification_required'
  | 'subscription_required'
  | 'schema_invalid'
  | 'request_failed'

export interface CodexBridgeIssue {
  code: CodexBridgeIssueCode
  message: string
}

export interface CodexStatus {
  cliInstalled: boolean
  loggedIn: boolean
  authProvider: string | null
  ready: boolean
  issues: CodexBridgeIssue[]
  systemPromptSummary: string
  systemPromptVersion: string
  systemPrompt: string
}

export interface CodexSettings {
  businessPrompt: string
  updatedAt: number
  version: string
}

export interface CodexApiError {
  code: CodexBridgeIssueCode | 'invalid_request'
  message: string
  issues?: CodexBridgeIssue[]
  rawMessage?: string
  requestId?: string
}

export type TextImportRunStage =
  | 'extracting_input'
  | 'analyzing_source'
  | 'parsing_markdown'
  | 'analyzing_import'
  | 'semantic_candidate_generation'
  | 'semantic_adjudication'
  | 'semantic_merge_review'
  | 'loading_prompt'
  | 'starting_codex_primary'
  | 'waiting_codex_primary'
  | 'parsing_primary_result'
  | 'repairing_structure'
  | 'starting_codex_repair'
  | 'waiting_codex_repair'
  | 'parsing_repair_result'
  | 'resolving_conflicts'
  | 'building_preview'

export type AiRunStage =
  | 'idle'
  | 'checking_status'
  | 'building_context'
  | 'extracting_input'
  | 'analyzing_source'
  | 'loading_prompt'
  | 'starting_codex_primary'
  | 'waiting_codex_primary'
  | 'parsing_primary_result'
  | 'parsing_markdown'
  | 'analyzing_import'
  | 'semantic_candidate_generation'
  | 'semantic_adjudication'
  | 'semantic_merge_review'
  | 'repairing_structure'
  | 'starting_codex_repair'
  | 'waiting_codex_repair'
  | 'parsing_repair_result'
  | 'resolving_conflicts'
  | 'building_preview'
  | 'starting_codex'
  | 'waiting_first_token'
  | 'streaming'
  | 'planning_changes'
  | 'applying_changes'
  | 'completed'
  | 'error'

export interface AiExecutionError {
  code?: CodexApiError['code']
  message: string
  stage?: AiRunStage
}

export interface AiStatusFeedback {
  tone: 'success' | 'warning'
  message: string
}

export type AiStreamEvent =
  | {
      type: 'status'
      stage: Exclude<AiRunStage, 'idle' | 'completed' | 'error'>
      message: string
    }
  | {
      type: 'assistant_delta'
      delta: string
    }
  | {
      type: 'result'
      data: AiChatResponse
    }
  | {
      type: 'error'
      stage?: Exclude<AiRunStage, 'idle' | 'completed'>
      code?: CodexApiError['code']
      message: string
      issues?: CodexBridgeIssue[]
      rawMessage?: string
    }

export type TextImportStreamEvent =
  | {
      type: 'status'
      stage: TextImportRunStage
      message: string
      requestId?: string
    }
  | {
      type: 'result'
      data: TextImportResponse
      requestId?: string
    }
  | {
      type: 'error'
      stage?: TextImportRunStage
      code?: CodexApiError['code']
      message: string
      issues?: CodexBridgeIssue[]
      rawMessage?: string
      requestId?: string
    }

export type MarkdownImportStreamEvent = TextImportStreamEvent
