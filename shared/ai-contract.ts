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
}

export type AiRunStage =
  | 'idle'
  | 'checking_status'
  | 'building_context'
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
    }
