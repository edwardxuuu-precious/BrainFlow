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
  | 'section'
  | 'claim'
  | 'evidence'
  | 'task'
  | 'decision'
  | 'risk'
  | 'metric'
  | 'question'
  | 'topic'
  | 'criterion'
  | 'insight'
  | 'goal'
  | 'project'
  | 'review'

export type KnowledgeSemanticEdgeType =
  | 'belongs_to'
  | 'supports'
  | 'contradicts'
  | 'contrasts_with'
  | 'leads_to'
  | 'depends_on'
  | 'derived_from'

export type KnowledgeViewType = 'archive_view' | 'thinking_view' | 'execution_view'

export type KnowledgeViewLayoutType = 'mindmap' | 'archive' | 'execution'

export type KnowledgeTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export type KnowledgeTaskPriority = 'low' | 'medium' | 'high'

export type KnowledgeSourceRole = 'canonical_knowledge' | 'context_record' | 'supporting_material'

export type KnowledgeMergeMode = 'create_new' | 'merge_into_existing' | 'archive_only'

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
  source_role: KnowledgeSourceRole
  canonical_topic_id: string
  same_as_topic_id: string | null
  merge_mode: KnowledgeMergeMode
  merge_confidence: number
  semantic_fingerprint: string
  metadata: Record<string, unknown>
}

export interface KnowledgeSourceRef {
  sourceId: string
  lineStart: number
  lineEnd: number
  pathTitles: string[]
}

export type KnowledgeStructureRole =
  | 'root_context'
  | 'judgment_module'
  | 'core_judgment_group'
  | 'judgment_basis_group'
  | 'potential_action_group'
  | 'core_judgment'
  | 'basis_item'
  | 'action_item'
  | 'execution_root'
  | 'execution_task_mirror'

export interface KnowledgeStructureReorderProposal {
  after_node_id: string | null
  reason: string | null
}

export interface KnowledgeStructureReparentProposal {
  new_parent_id: string | null
  reason: string | null
}

export interface KnowledgeSemanticTaskFields {
  status: KnowledgeTaskStatus
  owner: string | null
  due_date: string | null
  priority: KnowledgeTaskPriority | null
  depends_on: string[]
  output: string | null
  inferred_output: boolean
  mirrored_task_id: string | null
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
  structure_role?: KnowledgeStructureRole | null
  locked?: boolean
  source_module_id?: string | null
  proposed_reorder?: KnowledgeStructureReorderProposal | null
  proposed_reparent?: KnowledgeStructureReparentProposal | null
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
export type TextImportRecommendedRoute = 'local_markdown' | 'codex_import'
export type TextImportContentProfile =
  | 'report'
  | 'meeting_notes'
  | 'procedure'
  | 'mixed'
  | 'brain_dump'
export type TextImportArchetype =
  | 'analysis'
  | 'process'
  | 'notes'
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
  | 'claim'
  | 'task'
  | 'evidence'
  | 'summary'
  | 'decision'
  | 'action'
  | 'risk'
  | 'question'
  | 'metric'
  | 'timeline'

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
  structureRole?: KnowledgeStructureRole | null
  locked?: boolean | null
  sourceModuleId?: string | null
  proposedReorder?: KnowledgeStructureReorderProposal | null
  proposedReparent?: KnowledgeStructureReparentProposal | null
  taskDependsOn?: string[]
  inferredOutput?: boolean | null
  mirroredTaskId?: string | null
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
  structureRole?: KnowledgeStructureRole | null
  locked?: boolean | null
  sourceModuleId?: string | null
  proposedReorder?: KnowledgeStructureReorderProposal | null
  proposedReparent?: KnowledgeStructureReparentProposal | null
  taskDependsOn?: string[]
  inferredOutput?: boolean | null
  mirroredTaskId?: string | null
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
  canonicalTopicId?: string | null
  sameAsTopicId?: string | null
  mergeMode?: KnowledgeMergeMode
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
  sourceRole?: KnowledgeSourceRole
  canonicalTopicId?: string | null
  sameAsTopicId?: string | null
  mergeMode?: KnowledgeMergeMode
  mergeConfidence?: number
  semanticFingerprint?: string | null
  groupId?: string | null
  groupSize?: number
  similarityScore?: number | null
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
  sourceRole: KnowledgeSourceRole
  canonicalTopicId: string
  sameAsTopicId: string | null
  mergeMode: KnowledgeMergeMode
  mergeConfidence: number
  semanticFingerprint: string
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

export interface TextImportTimingDiagnostics {
  preprocessMs: number
  planningMs: number
  parseTreeMs: number
  batchComposeMs: number
  semanticCandidateMs: number
  semanticAdjudicationMs: number
  previewEditMs: number
  applyMs: number
  totalMs: number
}

export interface TextImportDensityStats {
  previewNodeCount: number
  semanticNodeCount: number
  semanticEdgeCount: number
  operationCount: number
  sourceAnchorCount: number
  foldedNoteCount: number
  evidenceNodeCount: number
  maxDepth: number
}

export interface TextImportArtifactReuseSummary {
  contentKey: string
  planKey: string
  reusedSemanticHints: boolean
  reusedSemanticUnits: boolean
  reusedPlannedStructure: boolean
}

export interface TextImportQualitySignalSummary {
  warningCount: number
  genericTitleCount: number
  lowConfidenceNodeCount: number
  foldedEvidenceCount: number
  duplicateSiblingGroupCount: number
  shallowSourceCount: number
  needsDeepPassCount: number
}

export interface TextImportApplyEstimate {
  createCount: number
  updateCount: number
  mergeCount: number
  crossFileMergeCount: number
  skippedUpdateCount: number
}

export interface TextImportSemanticAdjudicationDiagnostics {
  candidateCount: number
  representativeCount: number
  requestCount: number
  adjudicatedCount: number
  fallbackCount: number
}

export interface TextImportDiagnostics {
  timings: TextImportTimingDiagnostics
  densityStats: TextImportDensityStats
  artifactReuse: TextImportArtifactReuseSummary
  qualitySignals: TextImportQualitySignalSummary
  applyEstimate: TextImportApplyEstimate
  semanticAdjudication: TextImportSemanticAdjudicationDiagnostics
  dirtySubtreeIds?: string[]
  lastEditAction?: string | null
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
  diagnostics?: TextImportDiagnostics | null
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
  | 'authentication_failed'
  | 'provider_unavailable'
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
  providerType?: AiProviderType
}

export interface AiStatusFeedback {
  tone: 'success' | 'warning'
  message: string
}

export type TextImportProgressTone = 'info' | 'waiting' | 'success' | 'warning'

export type TextImportProgressSource = 'status' | 'observation' | 'codex'

export type TextImportProgressAttempt = 'local' | 'primary' | 'repair'

export interface TextImportProgressEntry {
  id: string
  timestampMs: number
  stage: TextImportRunStage
  message: string
  tone: TextImportProgressTone
  source: TextImportProgressSource
  attempt: TextImportProgressAttempt
  replaceKey?: string
  currentFileName?: string | null
  requestId?: string
}

export type TextImportTraceAttempt = 'local' | 'primary' | 'repair'

export type TextImportTraceChannel = 'request' | 'runner' | 'codex'

export interface TextImportTraceEntry {
  id: string
  sequence: number
  timestampMs: number
  requestId?: string
  currentFileName?: string | null
  attempt: TextImportTraceAttempt
  channel: TextImportTraceChannel
  eventType: string
  payload: unknown
  replaceKey?: string
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
      type: 'progress'
      entry: TextImportProgressEntry
      requestId?: string
    }
  | {
      type: 'trace'
      entry: TextImportTraceEntry
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

// ============================================
// AI Provider 相关类型（新增）
// ============================================

export type AiProviderType = 'codex' | 'deepseek' | 'kimi-code'

export interface AiProviderInfo {
  type: AiProviderType
  name: string
  description: string
  ready: boolean
  requiresApiKey: boolean
  features: {
    streaming: boolean
    structuredOutput: boolean
    contextInjection: boolean
  }
}

export interface AiProviderConfig {
  type: AiProviderType
  model?: string
  customBaseUrl?: string
}

export interface AiProviderStatus {
  type: AiProviderType
  ready: boolean
  issues: CodexBridgeIssue[]
  metadata: Record<string, unknown>
}

export interface AiProviderValidationResult {
  valid: boolean
  error?: string
  models?: string[]
}
