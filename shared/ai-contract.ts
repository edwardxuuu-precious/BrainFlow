export type AiRole = 'user' | 'assistant'

export type AiTopicMarker =
  | 'important'
  | 'question'
  | 'idea'
  | 'warning'
  | 'decision'
  | 'blocked'

export interface AiTopicTask {
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  dueDate: string | null
}

export interface AiTopicLink {
  id: string
  type: 'web' | 'topic' | 'local'
  label: string
  href?: string
  targetTopicId?: string
  path?: string
}

export interface AiTopicAttachmentRef {
  id: string
  name: string
  uri: string
  source: 'local' | 'url'
  mimeType?: string | null
}

export interface AiTopicMetadata {
  labels: string[]
  markers: AiTopicMarker[]
  task: AiTopicTask | null
  links: AiTopicLink[]
  attachments: AiTopicAttachmentRef[]
}

export interface AiTopicMetadataPatch {
  labels?: string[] | null
  markers?: AiTopicMarker[] | null
  task?: AiTopicTask | null
  links?: AiTopicLink[] | null
  attachments?: AiTopicAttachmentRef[] | null
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

export interface AiSelectionContext {
  documentTitle: string
  rootTopicId: string
  topicCount: number
  topics: AiDocumentTopicContext[]
  focus: AiFocusContext
}

export type AiCanvasTarget = `topic:${string}` | `ref:${string}`

export type AiCanvasOperation =
  | {
      type: 'create_child'
      parent: AiCanvasTarget
      title: string
      note?: string
      metadata?: AiTopicMetadataPatch
      style?: AiTopicStyle
      resultRef?: string
    }
  | {
      type: 'create_sibling'
      anchor: AiCanvasTarget
      title: string
      note?: string
      metadata?: AiTopicMetadataPatch
      style?: AiTopicStyle
      resultRef?: string
    }
  | {
      type: 'update_topic'
      target: AiCanvasTarget
      title?: string
      note?: string
      metadata?: AiTopicMetadataPatch
      style?: AiTopicStyle
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
  documentId: string
  documentTitle: string
  sessionId: string
  title: string
  messages: AiMessage[]
  updatedAt: number
  archivedAt: number | null
}

export interface AiSessionSummary {
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

export type TextImportHintKind =
  | 'heading'
  | 'paragraph'
  | 'bullet_list'
  | 'ordered_list'
  | 'task_list'
  | 'blockquote'
  | 'code_block'
  | 'table'

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

export interface TextImportRequest {
  documentId: string
  documentTitle: string
  baseDocumentUpdatedAt: number
  context: AiSelectionContext
  anchorTopicId: string | null
  sourceName: string
  sourceType: TextImportSourceType
  rawText: string
  preprocessedHints: TextImportPreprocessHint[]
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

export type TextImportRunnerAttempt = 'primary' | 'repair'

export type TextImportRunnerObservationPhase =
  | 'spawn_started'
  | 'heartbeat'
  | 'first_json_event'
  | 'completed'

export interface TextImportRunnerObservation {
  attempt: TextImportRunnerAttempt
  phase: TextImportRunnerObservationPhase
  kind: 'structured' | 'message'
  promptLength: number
  elapsedSinceSpawnMs?: number
  elapsedSinceLastEventMs?: number
  exitCode?: number
  hadJsonEvent?: boolean
}

export interface TextImportCodexEvent {
  attempt: TextImportRunnerAttempt
  eventType: string
  at: number
  summary: string
  rawJson: string
  requestId?: string
}

export interface TextImportCodexExplainer {
  attempt: TextImportRunnerAttempt
  at: number
  headline: string
  reason: string
  evidence: string[]
  requestId?: string
}

export type TextImportCodexDiagnosticCategory =
  | 'noise'
  | 'capability_gap'
  | 'actionable'

export interface TextImportCodexDiagnostic {
  attempt: TextImportRunnerAttempt
  category: TextImportCodexDiagnosticCategory
  at: number
  message: string
  rawLine: string
  requestId?: string
}

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
  | ({
      type: 'runner_observation'
      requestId?: string
    } & TextImportRunnerObservation)
  | ({
      type: 'codex_event'
    } & TextImportCodexEvent)
  | ({
      type: 'codex_explainer'
    } & TextImportCodexExplainer)
  | ({
      type: 'codex_diagnostic'
    } & TextImportCodexDiagnostic)
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
